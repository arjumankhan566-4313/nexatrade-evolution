/**
 * useSheetDrag — pointer/touch drag for the mobile trade-panel bottom sheet.
 *
 * The panel has three stops (see `styles/trade-panel.css`):
 *   peek — only the 64px handle shows, the chart stays fully visible
 *   half — the ticket is usable while the chart above it stays on screen
 *   full — the ticket takes the screen (still swipeable back down)
 *
 * The gestures move the panel 1:1 with the finger and, on release, snap to the
 * nearest stop plus a small flick projection, so a quick swipe skips a step.
 * Stops are expressed in the panel's OWN height, matching the CSS percentages,
 * so the gesture and the stylesheet never disagree about the geometry.
 */
import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";

export type SheetSnap = "peek" | "half" | "full";

/** Visible height while collapsed — the sticky sheet handle. Keep in sync with
 *  `.nxw__panel` in `styles/trade-panel.css`. */
export const SHEET_PEEK_PX = 64;
/** Translation of the `half` stop, as a fraction of the panel height. */
export const SHEET_HALF_FRACTION = 0.52;
/** Finger travel (px) above which a gesture counts as a drag, not a tap. */
const DRAG_SLOP_PX = 6;
/** Momentum window: projects the flick velocity 250ms ahead. */
const FLICK_MS = 250;
const MAX_FLICK_PX = 220;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Pixel translation of a stop, measured from the fully-open position. */
function stopPx(snap: SheetSnap, height: number): number {
  if (snap === "full") return 0;
  if (snap === "half") return height * SHEET_HALF_FRACTION;
  return Math.max(0, height - SHEET_PEEK_PX);
}

export interface SheetDrag {
  /** Spread onto the drag handle (the sheet head). */
  handleProps: {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
  };
  /** True while a finger is actually dragging (the click handler uses it too). */
  isDragging: () => boolean;
}

export function useSheetDrag(
  panelRef: React.RefObject<HTMLElement | null>,
  snap: SheetSnap,
  onSnap: (next: SheetSnap) => void,
): SheetDrag {
  const drag = useRef({
    active: false,
    startY: 0,
    startPx: 0,
    px: 0,
    height: 0,
    lastY: 0,
    lastT: 0,
    vy: 0,
    moved: false,
  });

  const end = useCallback(
    (pointerId: number) => {
      const d = drag.current;
      const panel = panelRef.current;
      if (!d.active) return;
      d.active = false;
      if (panel) {
        try {
          if (panel.hasPointerCapture?.(pointerId)) panel.releasePointerCapture(pointerId);
        } catch {
          /* capture is an optimisation — losing it must never break the drag */
        }
        panel.classList.remove("is-dragging");
      }
      if (!panel) return;
      // Inline transform is released; the snap class owns the final position.
      panel.style.transform = "";

      const stops: Array<{ snap: SheetSnap; px: number }> = [
        { snap: "full", px: stopPx("full", d.height) },
        { snap: "half", px: stopPx("half", d.height) },
        { snap: "peek", px: stopPx("peek", d.height) },
      ];
      // A flick projects where the gesture was heading before snapping.
      const projected = d.px + clamp(d.vy * FLICK_MS, -MAX_FLICK_PX, MAX_FLICK_PX);
      let best = stops[0];
      for (const stop of stops) {
        if (Math.abs(stop.px - projected) < Math.abs(best.px - projected)) best = stop;
      }
      onSnap(best.snap);
    },
    [onSnap, panelRef],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const panel = panelRef.current;
      if (!panel) return;
      const height = panel.offsetHeight || 1;
      drag.current = {
        active: true,
        startY: e.clientY,
        startPx: stopPx(snap, height),
        px: stopPx(snap, height),
        height,
        lastY: e.clientY,
        lastT: e.timeStamp,
        vy: 0,
        moved: false,
      };
      panel.classList.add("is-dragging");
      try {
        panel.setPointerCapture?.(e.pointerId);
      } catch {
        /* same: dragging still works without pointer capture */
      }
    },
    [panelRef, snap],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const d = drag.current;
      const panel = panelRef.current;
      if (!d.active || !panel) return;
      const dy = e.clientY - d.startY;
      if (Math.abs(dy) > DRAG_SLOP_PX) d.moved = true;
      d.px = clamp(d.startPx + dy, 0, stopPx("peek", d.height));
      const dt = e.timeStamp - d.lastT;
      if (dt > 0) d.vy = (e.clientY - d.lastY) / dt;
      d.lastY = e.clientY;
      d.lastT = e.timeStamp;
      panel.style.transform = `translateY(${d.px}px)`;
    },
    [panelRef],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      // Keep `moved` readable by the click handler that fires right after.
      const moved = drag.current.moved;
      end(e.pointerId);
      drag.current.moved = moved;
    },
    [end],
  );

  const onPointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      end(e.pointerId);
    },
    [end],
  );

  const isDragging = useCallback(() => drag.current.moved, []);

  return {
    handleProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    isDragging,
  };
}
