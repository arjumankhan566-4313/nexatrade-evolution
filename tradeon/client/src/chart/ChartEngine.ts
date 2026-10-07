/**
 * ChartEngine — a framework-agnostic HTML5 Canvas candlestick renderer.
 *
 * No charting library is used. Everything is drawn with the native 2D context.
 * The engine owns the viewport transform (index→X, price→Y), user input
 * (zoom / grab-and-drag pan / crosshair) and a requestAnimationFrame loop that
 * repaints only the layer that actually changed.
 *
 * Two stacked canvases:
 *   • base    — background, grid, candles, live-price line, trade overlays
 *   • overlay — crosshair lines + axis tooltips only, so moving the mouse
 *               never repaints the candles.
 *
 * Key invariants:
 *  • Overlays (entry/exit lines, entry/exit dots) are stored in DATA
 *    coordinates (candle index + price) and re-projected every frame, so they
 *    stay glued to their candles through zoom, pan and reload.
 *  • Every candle's centre X is computed once per frame and shared by its wick
 *    and its body; all strokes/fills are snapped to whole device pixels, so
 *    lines stay crisp at any devicePixelRatio (including 1.25 / 1.5 browser
 *    zoom) instead of blurring across two half-lit pixels.
 *  • Panning is grab-and-drag: the candle under the pointer at pointer-down
 *    stays under the pointer, derived from the stored start position (never by
 *    accumulating per-move deltas).
 */
import type { Candle, ChartOverlays, ChartTheme, OverlayDot, OverlayLine } from './types';
import { DEFAULT_THEME } from './types';
import { formatAxisTime, formatDateTime, formatPrice, pricePrecision } from './format';
import { priceTicks, timeStepMs } from './ticks';

const RIGHT_GUTTER = 78;
const BOTTOM_GUTTER = 24;
const TOP_PAD = 10;
const PRICE_PAD = 0.08;
const MIN_BAR_WIDTH = 1.5;
const MAX_BAR_WIDTH = 48;
/** Empty slots the viewport may show to the right of the latest candle. */
const RIGHT_MARGIN_SLOTS = 4;
const GRID_LINES = 6;
/** Live-price line thickness in CSS px (premium: solid white, 2px). */
const PRICE_LINE_W = 2;
const MIN_TIME_LABEL_PX = 88;
const AXIS_FONT = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
const TAG_H = 18;
/**
 * When a candle's slot is narrower than this, consecutive candles are folded
 * into one true OHLC bar. Zoomed all the way out, individual 1px bodies blur
 * into a continuous line; aggregated bars keep real bodies and wicks, so the
 * chart still reads as market data at every zoom level.
 */
const AGGREGATE_BELOW_PX = 4;
/** Candle slots left of the viewport that trigger a history prefetch. */
const PREFETCH_LEFT_SLOTS = 60;
/** Price-scale easing toward its target each frame (relative deltas below
 *  RANGE_SNAP_REL snap instantly so live ticks never lag the price line). */
const RANGE_EASE = 0.3;
const RANGE_SNAP_REL = 0.004;
/** Exponential wheel sensitivity — smooth for both notched mice and trackpads. */
const ZOOM_SENSITIVITY = 0.0016;

/** How the series is painted — the bottom-left toolbar selects this. */
export type ChartType = 'candles' | 'bars' | 'line';

export interface CrosshairInfo {
  /** Price at the cursor's exact Y, through the chart's own price scale. */
  price: number;
  /** Time of the candle the vertical line snapped to. */
  time: number;
  /** Index of that candle in the live array. */
  index: number;
  candle: Candle;
}

export interface ChartEngineOptions {
  theme?: Partial<ChartTheme>;
  onCrosshair?: (info: CrosshairInfo | null) => void;
  /**
   * Fired once per prefetch round when the viewport nears the oldest loaded
   * candle, so the caller can page older history in (infinite left-scroll).
   * The caller must answer with `setOlderPending(false)` when the page
   * resolves (or fails), otherwise prefetching stays parked.
   */
  onNeedOlder?: () => void;
  /** Plot-space Y (CSS px) of the live-price line, null when it is off-plot. */
  onPriceLineY?: (y: number | null) => void;
}

export class ChartEngine {
  private base: HTMLCanvasElement;
  private overlay: HTMLCanvasElement;
  private baseCtx: CanvasRenderingContext2D;
  private overlayCtx: CanvasRenderingContext2D;

  private dpr = 1;
  private cssW = 0;
  private cssH = 0;

  private candles: Candle[] = [];
  private overlays: ChartOverlays = { lines: [], dots: [] };
  private theme: ChartTheme = { ...DEFAULT_THEME };

  private barWidth = 9;
  /** Index (float) anchored to the right edge of the plot. */
  private viewRight = 0;
  private autoFollow = true;
  private chartType: ChartType = 'candles';

  private crosshair: { x: number; y: number } | null = null;
  private drag: { pointerId: number; startX: number; startViewRight: number } | null = null;

  /** Precision of the price axis, shared with the crosshair price tag. */
  private pricePrecision = 2;
  /** Plot-space Y of the live-price badge, so tags never overlap it. */
  private liveBadgeY: number | null = null;

  private needBase = false;
  private needOverlay = false;
  private frame = 0;

  /** Price scale actually drawn, eased toward `fitPriceRange()`'s target. */
  private range: { lo: number; hi: number } | null = null;
  private rangeAnimating = false;
  private olderPending = false;

  private dprQuery: MediaQueryList | null = null;
  private onCrosshair?: ChartEngineOptions['onCrosshair'];
  private onNeedOlder?: ChartEngineOptions['onNeedOlder'];
  private onPriceLineY?: ChartEngineOptions['onPriceLineY'];

  constructor(base: HTMLCanvasElement, overlay: HTMLCanvasElement, options: ChartEngineOptions = {}) {
    this.base = base;
    this.overlay = overlay;
    const bctx = base.getContext('2d', { alpha: false });
    const octx = overlay.getContext('2d', { alpha: true });
    if (!bctx || !octx) throw new Error('2D canvas context unavailable');
    this.baseCtx = bctx;
    this.overlayCtx = octx;
    if (options.theme) this.theme = { ...DEFAULT_THEME, ...options.theme };
    this.onCrosshair = options.onCrosshair;
    this.onNeedOlder = options.onNeedOlder;
    this.onPriceLineY = options.onPriceLineY;

    this.bindEvents();
  }

  // ── public API ─────────────────────────────────────────────────────────────
  resize(cssW: number, cssH: number) {
    if (!(cssW > 0) || !(cssH > 0)) return;
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = this.readDpr();
    this.applyBackingStore();
    this.armDprWatch();
    if (this.autoFollow) this.viewRight = Math.max(0, this.candles.length - 1);
    this.clampView();
    this.requestBaseRender();
  }

  setCandles(candles: Candle[]) {
    const prev = this.candles;
    const prevLen = prev.length;
    this.candles = candles;

    if (!candles.length) {
      this.viewRight = 0;
      // A fresh series (symbol switch) must not ease from the old asset's scale.
      this.range = null;
      this.requestBaseRender();
      return;
    }

    const last = candles.length - 1;
    if (this.autoFollow) {
      // Stay at the live edge; keep whatever small right margin the user left.
      const margin =
        prevLen > 0
          ? Math.max(0, Math.min(RIGHT_MARGIN_SLOTS, this.viewRight - (prevLen - 1)))
          : 0;
      this.viewRight = last + margin;
    } else if (prevLen) {
      // Re-anchor a panned window on the candle that was at the right edge, so
      // appends and buffer trims never slide the view under the user.
      const anchorIdx = Math.min(prevLen - 1, Math.max(0, Math.round(this.viewRight)));
      const anchorTime = prev[anchorIdx]?.time;
      const newIdx = anchorTime == null ? -1 : this.indexOfTime(anchorTime);
      if (newIdx >= 0) this.viewRight += newIdx - anchorIdx;
    }
    this.clampView();
    this.requestBaseRender();
  }

  setOverlays(overlays: ChartOverlays) {
    this.overlays = overlays;
    this.requestBaseRender();
  }

  /** Candles (default), OHLC bars or a close-price line. */
  setChartType(type: ChartType) {
    if (type === this.chartType) return;
    this.chartType = type;
    this.requestBaseRender();
  }

  setTheme(theme: Partial<ChartTheme>) {
    this.theme = { ...DEFAULT_THEME, ...theme };
    this.requestBaseRender();
  }

  /** The caller answers a `onNeedOlder` request through this. */
  setOlderPending(pending: boolean) {
    this.olderPending = pending;
  }

  /** Paint both layers synchronously (resize / hidden-tab recovery / tests). */
  render() {
    this.needBase = false;
    this.needOverlay = false;
    this.drawBase();
    this.drawOverlay();
  }

  destroy() {
    this.unbindEvents();
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.needBase = false;
    this.needOverlay = false;
  }

  // ── sizing ─────────────────────────────────────────────────────────────────
  private readDpr() {
    const d = typeof window === 'undefined' ? 1 : window.devicePixelRatio;
    return Number.isFinite(d) && d > 0 ? d : 1;
  }

  private applyBackingStore() {
    const w = Math.max(1, Math.round(this.cssW * this.dpr));
    const h = Math.max(1, Math.round(this.cssH * this.dpr));
    for (const c of [this.base, this.overlay]) {
      if (c.width !== w) c.width = w;
      if (c.height !== h) c.height = h;
      c.style.width = `${this.cssW}px`;
      c.style.height = `${this.cssH}px`;
    }
  }

  /** Browser zoom changes devicePixelRatio without resizing the element. */
  private syncDpr() {
    const dpr = this.readDpr();
    this.armDprWatch();
    if (Math.abs(dpr - this.dpr) < 1e-6) return;
    this.dpr = dpr;
    this.applyBackingStore();
    this.requestBaseRender();
  }

  private armDprWatch() {
    if (this.dprQuery) this.dprQuery.removeEventListener('change', this.onDprChange);
    this.dprQuery = window.matchMedia(`(resolution: ${this.readDpr()}dppx)`);
    this.dprQuery.addEventListener('change', this.onDprChange);
  }

  // ── transforms ─────────────────────────────────────────────────────────────
  private get plotRight() {
    return this.cssW - RIGHT_GUTTER;
  }
  private get plotBottom() {
    return this.cssH - BOTTOM_GUTTER;
  }
  private get plotTop() {
    return TOP_PAD;
  }
  private get plotWidth() {
    return this.plotRight;
  }
  /** One device pixel, expressed in CSS px. */
  private get hairline() {
    return 1 / this.dpr;
  }

  /** Centre X of the bar at the given index (float CSS px). */
  private indexToX(i: number) {
    return this.plotRight - (this.viewRight - i + 0.5) * this.barWidth;
  }
  private xToIndex(x: number) {
    return this.viewRight - (this.plotRight - x) / this.barWidth + 0.5;
  }
  /** Snapped coordinate for a crisp 1-device-pixel line. */
  private snap(v: number) {
    return (Math.round(v * this.dpr) + 0.5) / this.dpr;
  }
  /** Snapped edge for fills. */
  private snapEdge(v: number) {
    return Math.round(v * this.dpr) / this.dpr;
  }

  private visibleRange(): { min: number; max: number } {
    const count = this.plotWidth / this.barWidth;
    return { min: this.viewRight - count, max: this.viewRight };
  }

  /** Index of the candle whose time is exactly `t`, else the last one before. */
  private indexOfTime(t: number): number {
    const arr = this.candles;
    let lo = 0;
    let hi = arr.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].time === t) return mid;
      if (arr[mid].time < t) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return found;
  }

  private fitPriceRange(): { lo: number; hi: number } {
    const { min, max } = this.visibleRange();
    let lo = Infinity;
    let hi = -Infinity;
    const i0 = Math.max(0, Math.floor(min));
    const i1 = Math.min(this.candles.length - 1, Math.ceil(max));
    for (let i = i0; i <= i1; i++) {
      const c = this.candles[i];
      if (c.low < lo) lo = c.low;
      if (c.high > hi) hi = c.high;
    }
    // Include the price of marks whose own candle is on screen, so a visible
    // entry/exit stays framed. NEVER count an off-view mark: one anchored hours
    // to the left would stretch the axis (e.g. 0…90000) and squash the candles
    // that are actually on screen into an invisible sliver.
    const onScreen = (i?: number) => i == null || (i >= i0 - 2 && i <= i1 + 2);
    const include = (price: number) => {
      if (!Number.isFinite(price)) return;
      if (price < lo) lo = price;
      if (price > hi) hi = price;
    };
    for (const line of this.overlays.lines) if (onScreen(line.index)) include(line.price);
    for (const dot of this.overlays.dots) if (onScreen(dot.index)) include(dot.price);
    if (!isFinite(lo) || !isFinite(hi)) return { lo: 0, hi: 1 };
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }
    const pad = (hi - lo) * PRICE_PAD;
    return { lo: lo - pad, hi: hi + pad };
  }

  /**
   * The scale actually painted. It eases toward the freshly fitted target so
   * zoom, pan and symbol switches glide instead of snapping. A relative move
   * below RANGE_SNAP_REL is applied immediately, so an ordinary live tick
   * never lags the price line it draws.
   */
  private resolveRange(): { lo: number; hi: number } {
    const target = this.fitPriceRange();
    const cur = this.range;
    if (!cur) {
      this.range = target;
      this.rangeAnimating = false;
      return target;
    }
    const span = Math.max(target.hi - target.lo, 1e-9);
    const shift = Math.max(Math.abs(target.lo - cur.lo), Math.abs(target.hi - cur.hi)) / span;
    if (shift < RANGE_SNAP_REL) {
      this.range = target;
      this.rangeAnimating = false;
      return target;
    }
    const lo = cur.lo + (target.lo - cur.lo) * RANGE_EASE;
    const hi = cur.hi + (target.hi - cur.hi) * RANGE_EASE;
    const rest = Math.max(Math.abs(target.lo - lo), Math.abs(target.hi - hi)) / span;
    this.range = rest < 1e-3 ? target : { lo, hi };
    this.rangeAnimating = this.range !== target;
    return this.range;
  }

  /** The drawn scale, without advancing the easing (crosshair / overlays). */
  private frameRange(): { lo: number; hi: number } {
    return this.range ?? this.fitPriceRange();
  }

  private priceToY(price: number, range: { lo: number; hi: number }) {
    const t = (price - range.lo) / (range.hi - range.lo || 1);
    return this.plotBottom - t * (this.plotBottom - this.plotTop);
  }
  private yToPrice(y: number, range: { lo: number; hi: number }) {
    const t = (this.plotBottom - y) / (this.plotBottom - this.plotTop || 1);
    return range.lo + t * (range.hi - range.lo);
  }

  private clampView() {
    const last = this.candles.length - 1;
    if (last < 0 || this.plotWidth <= 0) {
      this.autoFollow = true;
      return;
    }
    const maxRight = last + RIGHT_MARGIN_SLOTS;
    const minRight = Math.min(this.plotWidth / this.barWidth, maxRight);
    if (this.viewRight > maxRight) this.viewRight = maxRight;
    if (this.viewRight < minRight) this.viewRight = minRight;
    this.autoFollow = this.viewRight >= last - 1e-6;
    this.maybePrefetch();
  }

  /**
   * Infinite left-scroll: when fewer than PREFETCH_LEFT_SLOTS candles remain to
   * the left of the viewport, ask the owner for an older page. One request is
   * in flight at a time; the owner clears the latch when the page lands.
   */
  private maybePrefetch() {
    if (!this.onNeedOlder || this.olderPending) return;
    if (!this.candles.length || this.plotWidth <= 0) return;
    if (this.visibleRange().min > PREFETCH_LEFT_SLOTS) return;
    this.olderPending = true;
    this.onNeedOlder();
  }

  // ── input ──────────────────────────────────────────────────────────────────
  private bindEvents() {
    const c = this.base;
    c.addEventListener('pointerdown', this.onPointerDown);
    c.addEventListener('pointermove', this.onPointerMove);
    c.addEventListener('pointerup', this.onPointerUp);
    c.addEventListener('pointercancel', this.onPointerUp);
    c.addEventListener('pointerleave', this.onPointerLeave);
    c.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('resize', this.onWindowResize);
  }

  private unbindEvents() {
    const c = this.base;
    c.removeEventListener('pointerdown', this.onPointerDown);
    c.removeEventListener('pointermove', this.onPointerMove);
    c.removeEventListener('pointerup', this.onPointerUp);
    c.removeEventListener('pointercancel', this.onPointerUp);
    c.removeEventListener('pointerleave', this.onPointerLeave);
    c.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('resize', this.onWindowResize);
    this.dprQuery?.removeEventListener('change', this.onDprChange);
    this.dprQuery = null;
  }

  private onWindowResize = () => {
    this.syncDpr();
  };

  private onDprChange = () => {
    this.syncDpr();
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (!this.candles.length || this.plotWidth <= 0) return;
    const rect = this.base.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    // Index under the cursor before zoom, so it can be pinned after.
    const idxBefore = this.xToIndex(cursorX);
    // Exponential in the wheel delta: a notched mouse (~100) and a trackpad's
    // stream of small deltas both scale smoothly, with no discrete jump. Line
    // and page scroll modes are normalised to pixels first.
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.plotBottom : 1;
    const delta = Math.max(-160, Math.min(160, e.deltaY * unit));
    const factor = Math.exp(-delta * ZOOM_SENSITIVITY);
    const next = Math.min(MAX_BAR_WIDTH, Math.max(MIN_BAR_WIDTH, this.barWidth * factor));
    if (next === this.barWidth) return;
    this.barWidth = next;
    this.viewRight = idxBefore + (this.plotRight - cursorX) / this.barWidth - 0.5;
    this.clampView();
    this.requestBaseRender();
  };

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!this.candles.length || this.plotWidth <= 0) return;
    const rect = this.base.getBoundingClientRect();
    try {
      this.base.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort — the drag still works inside the canvas */
    }
    this.drag = {
      pointerId: e.pointerId,
      startX: e.clientX - rect.left,
      startViewRight: this.viewRight,
    };
    this.crosshair = null;
    this.emitCrosshair();
    this.requestBaseRender();
  };

  private onPointerMove = (e: PointerEvent) => {
    const rect = this.base.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (this.drag && e.pointerId === this.drag.pointerId) {
      // Grab-and-drag: the chart follows the pointer 1:1. `viewRight` is the
      // index anchored at the right edge, so it moves OPPOSITE the pointer —
      // dragging right reveals older candles, dragging left brings the live
      // edge back. Always derived from the pointer-down start values.
      const deltaX = x - this.drag.startX;
      this.viewRight = this.drag.startViewRight - deltaX / this.barWidth;
      this.clampView();
      this.requestBaseRender();
      return;
    }

    const inside = x >= 0 && x <= this.plotRight && y >= this.plotTop && y <= this.plotBottom;
    this.crosshair = inside ? { x, y } : null;
    this.emitCrosshair();
    this.requestOverlayRender();
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    try {
      this.base.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    this.drag = null;
    this.clampView();
    this.requestBaseRender();
  };

  private onPointerLeave = () => {
    if (this.drag) return; // capture keeps the pan alive outside the canvas
    this.crosshair = null;
    this.emitCrosshair();
    this.requestOverlayRender();
  };

  private emitCrosshair() {
    if (!this.onCrosshair) return;
    const ch = this.crosshair;
    if (!ch || !this.candles.length || this.plotWidth <= 0) {
      this.onCrosshair(null);
      return;
    }
    const index = this.snapIndex(ch.x);
    const candle = this.candles[index];
    if (!candle) {
      this.onCrosshair(null);
      return;
    }
    this.onCrosshair({
      price: this.yToPrice(ch.y, this.frameRange()),
      time: candle.time,
      index,
      candle,
    });
  }

  /** Nearest candle centre to a pointer X, clamped to the loaded range. */
  private snapIndex(x: number) {
    // xToIndex returns the fractional index whose centre sits at `x`, so the
    // nearest bar centre is simply its rounded value.
    const idx = Math.round(this.xToIndex(x));
    return Math.min(this.candles.length - 1, Math.max(0, idx));
  }

  // ── scheduling ─────────────────────────────────────────────────────────────
  private requestBaseRender() {
    this.needBase = true;
    this.needOverlay = true;
    this.schedule();
  }
  private requestOverlayRender() {
    this.needOverlay = true;
    this.schedule();
  }
  private schedule() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.needBase) {
        this.needBase = false;
        this.drawBase();
      }
      if (this.needOverlay) {
        this.needOverlay = false;
        this.drawOverlay();
      }
    });
  }

  // ── render ────────────────────────────────────────────────────────────────
  private drawBase() {
    const ctx = this.baseCtx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = this.theme.bg;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    if (!this.candles.length || this.plotWidth <= 0) {
      this.liveBadgeY = null;
      this.onPriceLineY?.(null);
      return;
    }
    const range = this.resolveRange();
    const ref = this.candles[this.candles.length - 1].close;
    const { step } = priceTicks(range.lo, range.hi, GRID_LINES);
    const stepDecimals = step > 0 ? Math.max(0, Math.ceil(-Math.log10(step))) : 0;
    this.pricePrecision = Math.min(8, Math.max(pricePrecision(ref), stepDecimals));

    this.drawPriceGrid(ctx, range);
    this.drawTimeGrid(ctx);
    this.drawCandles(ctx, range);
    this.drawPriceLine(ctx, range);
    this.drawOverlays(ctx, range);

    // Keep easing the price scale while it is still catching up to the target.
    if (this.rangeAnimating) this.requestBaseRender();
  }

  private drawOverlay() {
    const ctx = this.overlayCtx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    if (!this.crosshair || !this.candles.length || this.plotWidth <= 0) return;

    const range = this.frameRange();
    const { x, y } = this.crosshair;
    const snappedX = this.snap(this.indexToX(this.snapIndex(x)));

    ctx.save();
    ctx.strokeStyle = this.theme.crosshair;
    ctx.lineWidth = this.hairline;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(snappedX, this.plotTop);
    ctx.lineTo(snappedX, this.plotBottom);
    ctx.moveTo(0, this.snap(y));
    ctx.lineTo(this.plotRight, this.snap(y));
    ctx.stroke();
    ctx.restore();

    // ── price tooltip on the right axis (exact cursor Y) ──
    const clearsLiveBadge = this.liveBadgeY == null || Math.abs(y - this.liveBadgeY) >= TAG_H + 2;
    if (clearsLiveBadge) {
      const label = formatPrice(this.yToPrice(y, range), this.pricePrecision);
      const cy = Math.min(Math.max(y, TAG_H / 2 + 2), this.cssH - TAG_H / 2 - 2);
      this.drawTag(ctx, label, this.plotRight + 1, cy - TAG_H / 2, this.cssW - this.plotRight - 2, 'left');
    }

    // ── time tooltip on the bottom axis (snapped candle) ──
    const candle = this.candles[this.snapIndex(x)];
    if (candle) {
      const label = formatDateTime(candle.time);
      ctx.font = AXIS_FONT;
      const w = ctx.measureText(label).width + 14;
      const cx = Math.min(Math.max(snappedX, w / 2), Math.max(w / 2, this.plotRight - w / 2));
      this.drawTag(ctx, label, cx - w / 2, this.plotBottom + 1, w, 'center');
    }
  }

  /** Filled axis tag: a solid box so the value stays readable over the grid. */
  private drawTag(
    ctx: CanvasRenderingContext2D,
    label: string,
    x: number,
    y: number,
    w: number,
    align: 'left' | 'center'
  ) {
    ctx.fillStyle = this.theme.crosshair;
    ctx.fillRect(this.snapEdge(x), y, Math.max(1, w), TAG_H);
    ctx.fillStyle = this.theme.crosshairText;
    ctx.font = AXIS_FONT;
    ctx.textBaseline = 'middle';
    if (align === 'center') {
      ctx.textAlign = 'center';
      ctx.fillText(label, x + w / 2, y + TAG_H / 2);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText(label, x + 6, y + TAG_H / 2);
    }
  }

  private drawPriceGrid(ctx: CanvasRenderingContext2D, range: { lo: number; hi: number }) {
    const { ticks } = priceTicks(range.lo, range.hi, GRID_LINES);
    ctx.save();
    ctx.strokeStyle = this.theme.grid;
    ctx.lineWidth = this.hairline;
    ctx.font = AXIS_FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const price of ticks) {
      const y = this.snap(this.priceToY(price, range));
      if (y < this.plotTop - 1 || y > this.plotBottom + 1) continue;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.plotRight, y);
      ctx.stroke();
      ctx.fillStyle = this.theme.axisText;
      ctx.fillText(formatPrice(price, this.pricePrecision), this.plotRight + 6, y);
    }
    ctx.restore();
  }

  private drawTimeGrid(ctx: CanvasRenderingContext2D) {
    const { min, max } = this.visibleRange();
    const bucketMs = this.bucketMs();
    const spanMs = Math.max(0, (max - min) * bucketMs);
    const step = timeStepMs(bucketMs, this.barWidth, MIN_TIME_LABEL_PX, spanMs);
    const i0 = Math.max(0, Math.floor(min));
    const i1 = Math.min(this.candles.length - 1, Math.ceil(max));
    ctx.save();
    ctx.strokeStyle = this.theme.grid;
    ctx.lineWidth = this.hairline;
    ctx.font = AXIS_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = this.theme.axisText;
    for (let i = i0; i <= i1; i++) {
      const t = this.candles[i].time;
      if (t % step !== 0) continue; // round calendar boundaries only
      const x = this.snap(this.indexToX(i));
      ctx.beginPath();
      ctx.moveTo(x, this.plotTop);
      ctx.lineTo(x, this.plotBottom);
      ctx.stroke();
      ctx.fillText(formatAxisTime(t, step), x, this.plotBottom + 5);
    }
    ctx.restore();
  }

  /** Spacing of the loaded series, used to scale the time axis. */
  private bucketMs(): number {
    if (this.candles.length < 2) return 60_000;
    const dt = this.candles[this.candles.length - 1].time - this.candles[this.candles.length - 2].time;
    return dt > 0 ? dt : 60_000;
  }

  /**
   * Candles folded into each painted bar: 1 while slots are wide enough to
   * read, more once they are not, so a zoomed-out view shows true aggregated
   * OHLC bars rather than a blur of one-pixel columns.
   */
  private aggregateStep(): number {
    return this.barWidth >= AGGREGATE_BELOW_PX ? 1 : Math.ceil(AGGREGATE_BELOW_PX / this.barWidth);
  }

  private drawCandles(ctx: CanvasRenderingContext2D, range: { lo: number; hi: number }) {
    if (this.chartType === 'line') {
      this.drawLine(ctx, range);
      return;
    }
    const { min, max } = this.visibleRange();
    const step = this.aggregateStep();
    const last = this.candles.length - 1;
    const i0 = Math.max(0, Math.floor(min) - step);
    const i1 = Math.min(last, Math.ceil(max) + step);

    ctx.save();
    ctx.lineWidth = this.hairline;
    let i = i0;
    while (i <= i1) {
      const end = Math.min(i + step - 1, i1, last);
      // Only full blocks of finalized candles merge; the forming candle and any
      // leftover tail stay 1:1 so the live bar keeps its own resolution.
      const merges = end > i && step > 1 && this.candles[i].finalized && this.candles[end].finalized;
      if (!merges) {
        const c = this.candles[i];
        const paint = this.chartType === 'bars' ? this.paintOhlcBar : this.paintBar;
        paint.call(this, ctx, range, c.open, c.high, c.low, c.close, this.indexToX(i), this.barWidth * 0.7);
        i += 1;
        continue;
      }
      let high = -Infinity;
      let low = Infinity;
      for (let k = i; k <= end; k += 1) {
        if (this.candles[k].high > high) high = this.candles[k].high;
        if (this.candles[k].low < low) low = this.candles[k].low;
      }
      const count = end - i + 1;
      const paint = this.chartType === 'bars' ? this.paintOhlcBar : this.paintBar;
      paint.call(
        this,
        ctx,
        range,
        this.candles[i].open,
        high,
        low,
        this.candles[end].close,
        this.indexToX((i + end) / 2),
        this.barWidth * count * 0.72
      );
      i = end + 1;
    }
    ctx.restore();
  }

  /** One OHLC bar — wick plus body — snapped to whole device pixels. */
  private paintBar(
    ctx: CanvasRenderingContext2D,
    range: { lo: number; hi: number },
    open: number,
    high: number,
    low: number,
    close: number,
    cx: number,
    bodyW: number
  ) {
    if (cx < -bodyW || cx > this.plotRight + bodyW) return;
    const dpr = this.dpr;
    const cxDev = Math.round(cx * dpr);
    // Wick: exactly one device pixel wide, centred on the body column below.
    const wickX = (cxDev + 0.5) / dpr;
    const color = close >= open ? this.theme.up : this.theme.down;

    const yHigh = this.priceToY(high, range);
    const yLow = this.priceToY(low, range);
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(wickX, Math.min(yHigh, yLow));
    ctx.lineTo(wickX, Math.max(yHigh, yLow));
    ctx.stroke();

    // Body: an odd number of device pixels, so it stays centred on the wick
    // column. A doji (open === close) collapses to a 1-device-pixel line
    // instead of vanishing.
    let wDev = Math.round(bodyW * dpr);
    if (wDev < 1) wDev = 1;
    if (wDev % 2 === 0) wDev += 1;
    const yOpen = this.priceToY(open, range);
    const yClose = this.priceToY(close, range);
    const topDev = Math.round(Math.min(yOpen, yClose) * dpr);
    const hDev = Math.max(1, Math.round(Math.abs(yClose - yOpen) * dpr));
    ctx.fillStyle = color;
    ctx.fillRect((cxDev - (wDev - 1) / 2) / dpr, topDev / dpr, wDev / dpr, hDev / dpr);
  }

  /** One classic OHLC bar — high/low wick plus the open and close ticks. */
  private paintOhlcBar(
    ctx: CanvasRenderingContext2D,
    range: { lo: number; hi: number },
    open: number,
    high: number,
    low: number,
    close: number,
    cx: number,
    bodyW: number
  ) {
    if (cx < -bodyW || cx > this.plotRight + bodyW) return;
    const dpr = this.dpr;
    const cxDev = Math.round(cx * dpr);
    const wickX = (cxDev + 0.5) / dpr;
    const halfW = Math.max(1, Math.round((bodyW / 2) * dpr));
    const x0 = (cxDev - halfW + 0.5) / dpr;
    const x1 = (cxDev + halfW + 0.5) / dpr;
    const color = close >= open ? this.theme.up : this.theme.down;
    const yHigh = this.priceToY(high, range);
    const yLow = this.priceToY(low, range);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1 / dpr;
    ctx.beginPath();
    ctx.moveTo(wickX, Math.min(yHigh, yLow));
    ctx.lineTo(wickX, Math.max(yHigh, yLow));
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x0, this.priceToY(open, range));
    ctx.lineTo(wickX, this.priceToY(open, range));
    ctx.moveTo(wickX, this.priceToY(close, range));
    ctx.lineTo(x1, this.priceToY(close, range));
    ctx.stroke();
    ctx.restore();
  }

  /** Close-price line — the third chart type of the floating toolbar. */
  private drawLine(ctx: CanvasRenderingContext2D, range: { lo: number; hi: number }) {
    const { min, max } = this.visibleRange();
    const last = this.candles.length - 1;
    const i0 = Math.max(0, Math.floor(min) - 1);
    const i1 = Math.min(last, Math.ceil(max) + 1);
    if (i1 <= i0) return;
    ctx.save();
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = this.theme.up;
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) {
      const x = this.indexToX(i);
      const y = this.priceToY(this.candles[i].close, range);
      if (i === i0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Latest close: a solid white 2px line plus a filled right-axis badge. */
  private drawPriceLine(ctx: CanvasRenderingContext2D, range: { lo: number; hi: number }) {
    const c = this.candles[this.candles.length - 1];
    if (!c || !Number.isFinite(c.close)) {
      this.liveBadgeY = null;
      this.onPriceLineY?.(null);
      return;
    }
    const rawY = this.priceToY(c.close, range);
    if (rawY < this.plotTop - 1 || rawY > this.plotBottom + 1) {
      this.liveBadgeY = null;
      this.onPriceLineY?.(null);
      return;
    }
    // A whole number of DEVICE pixels on a whole-device-pixel row: at a
    // fractional DPR (this preview runs 0.9) a plain 2px stroke would land
    // half-lit across two rows; this keeps the line fully opaque and crisp.
    const wDev = Math.max(1, Math.round(PRICE_LINE_W * this.dpr));
    const y = Math.round(rawY * this.dpr) / this.dpr;
    ctx.save();
    ctx.strokeStyle = this.theme.priceLine;
    ctx.lineWidth = wDev / this.dpr;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(this.plotRight, y);
    ctx.stroke();
    ctx.restore();

    // The countdown badge outside the canvas anchors itself to this exact Y.
    this.onPriceLineY?.(rawY);

    this.liveBadgeY = rawY;
    const label = formatPrice(c.close, this.pricePrecision);
    ctx.fillStyle = this.theme.priceLabelBg;
    ctx.fillRect(
      this.snapEdge(this.plotRight + 1),
      this.snapEdge(rawY - TAG_H / 2),
      this.cssW - this.plotRight - 1,
      TAG_H
    );
    ctx.fillStyle = this.theme.priceLabelText;
    ctx.font = AXIS_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, (this.plotRight + this.cssW) / 2, rawY);
  }

  private drawOverlays(ctx: CanvasRenderingContext2D, range: { lo: number; hi: number }) {
    // Anchored horizontal price lines (entry/exit).
    for (const line of this.overlays.lines) {
      const y = this.priceToY(line.price, range);
      if (y < this.plotTop || y > this.plotBottom) continue;
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 1.4;
      if (line.dashed) ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.plotRight, y);
      ctx.stroke();
      ctx.setLineDash([]);
      // Right-gutter label badge
      const label = `${line.label} ${formatPrice(line.price, this.pricePrecision)}`;
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
      const w = ctx.measureText(label).width + 10;
      ctx.fillStyle = line.color;
      ctx.fillRect(this.plotRight + 2, y - 8, w, 16);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, this.plotRight + 7, y);
    }

    // Anchored dots at (candle index, price).
    for (const dot of this.overlays.dots) {
      if (dot.index < 0 || dot.index >= this.candles.length) continue;
      const x = this.indexToX(dot.index);
      const y = this.priceToY(dot.price, range);
      if (x < -10 || x > this.plotRight + 10) continue;
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      if (dot.hollow) {
        ctx.fillStyle = this.theme.bg;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = dot.color;
        ctx.stroke();
      } else {
        ctx.fillStyle = dot.color;
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
    }
  }

  // exposed for test/debug
  get _state() {
    return {
      barWidth: this.barWidth,
      viewRight: this.viewRight,
      autoFollow: this.autoFollow,
      dpr: this.dpr,
      cssW: this.cssW,
      cssH: this.cssH,
      candles: this.candles.length,
      crosshair: this.crosshair,
      chartType: this.chartType,
      aggregateStep: this.aggregateStep(),
      range: this.range,
      olderPending: this.olderPending,
    };
  }

  /** Data-space X of a candle centre — proves the drag keeps a bar put. */
  candleX(index: number) {
    return this.indexToX(index);
  }
  /** Inverse of candleX, for the follow-the-pointer check. */
  indexAtX(x: number) {
    return this.xToIndex(x);
  }
}

/** Helper: build a sample anchored overlay set from a candle array (demo). */
export function buildSampleOverlays(candles: Candle[]): ChartOverlays {
  if (candles.length < 10) return { lines: [], dots: [] };
  const entryIdx = Math.max(0, candles.length - 60);
  const exitIdx = Math.min(candles.length - 1, candles.length - 25);
  const entry = candles[entryIdx];
  const exit = candles[exitIdx];
  const lines: OverlayLine[] = [
    { id: 'entry', price: entry.open, color: '#26a69a', label: 'ENTRY', dashed: true },
    { id: 'exit', price: exit.close, color: '#ef5350', label: 'EXIT', dashed: true },
  ];
  const dots: OverlayDot[] = [
    { id: 'entry-dot', index: entryIdx, price: entry.open, color: '#26a69a', label: 'E' },
    { id: 'exit-dot', index: exitIdx, price: exit.close, color: '#ef5350', hollow: true, label: 'X' },
  ];
  return { lines, dots };
}
