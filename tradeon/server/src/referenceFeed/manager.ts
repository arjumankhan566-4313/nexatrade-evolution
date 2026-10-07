/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NEXATRADE V2 — REFERENCE FEED MANAGER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The poller that closes the loop the legacy code left open: it periodically
 * fetches a real-market reference price for every active OTC instrument and
 * hands it to the engine via `updateReferencePrice`, which gradually re-anchors
 * the synthetic stream toward reality (reanchor_rate per tick, spec §4–7).
 *
 * Resilience contract (spec §6 — OTC is 24/7):
 *   • A provider that errors or returns null is SKIPPED, not retried; the
 *     engine simply keeps its last reference state for that symbol.
 *   • Fetches run with bounded concurrency so 361 instruments never open 361
 *     sockets at once.
 *   • The manager never throws into the engine; a broken poll cycle logs and
 *     schedules the next.
 *   • It only runs while the OTC engine is the active leader (running). On a
 *     read-only standby it stays idle — exactly one process anchors each symbol.
 */
import { allProviderTargets } from './symbols';
import { fetchReferencePrice } from './providers';
import { otcInstrument } from '../otc/instruments';
import { updateReferencePrice, getEngine } from '../otc/runner';

const MAX_CONCURRENCY = 12;

export interface ProviderHealth {
  kind: string;
  successes: number;
  failures: number;
  lastPrice: number | null;
  lastAt: number | null;
}

export interface ReferenceFeedHealth {
  enabled: boolean;
  running: boolean;
  pollIntervalMs: number;
  symbols: number;
  lastCycleAt: number | null;
  lastCycleDurationMs: number | null;
  lastCycleResults: { ok: number; failed: number; skipped: number };
  providers: Record<string, ProviderHealth>;
}

class ReferenceFeedManager {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private enabled = false;
  private pollIntervalMs = 30_000;
  private symbols = 0;

  private lastCycleAt: number | null = null;
  private lastCycleDurationMs: number | null = null;
  private lastCycleResults = { ok: 0, failed: 0, skipped: 0 };
  private providers: Record<string, ProviderHealth> = {};

  configure(enabled: boolean, pollIntervalMs: number) {
    this.enabled = enabled;
    this.pollIntervalMs = Math.min(120_000, Math.max(5_000, pollIntervalMs));
  }

  start(otcSymbols: string[]) {
    const targets = allProviderTargets(otcSymbols);
    this.symbols = targets.length;
    if (!this.enabled || this.timer) return;
    if (!this.symbols) return;
    console.log(
      `[reference-feed] starting · ${this.symbols} symbols · interval ${this.pollIntervalMs}ms · concurrency ${MAX_CONCURRENCY}`
    );
    this.running = true;
    // Stagger the first cycle a little so it does not collide with engine boot.
    this.timer = setTimeout(() => this.cycle().catch(() => {}), 5_000);
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private providerHealth(kind: string): ProviderHealth {
    if (!this.providers[kind]) {
      this.providers[kind] = { kind, successes: 0, failures: 0, lastPrice: null, lastAt: null };
    }
    return this.providers[kind];
  }

  private async cycle() {
    // Re-check liveness every cycle: if the engine stopped, stay parked.
    const engine = getEngine();
    if (!engine?.running) {
      this.scheduleNext();
      return;
    }
    // Only the leader process owns the stream — a standby must not anchor.
    if (engine.leaderMode && engine.leaderMode !== 'running') {
      this.scheduleNext();
      return;
    }

    // Build targets fresh each cycle so admin catalogue changes apply live.
    const otcSymbols = [...engine.runtimes.keys()];
    const targets = allProviderTargets(otcSymbols);
    this.symbols = targets.length;
    const started = Date.now();
    let ok = 0;
    let failed = 0;
    let skipped = 0;

    // Bounded-concurrency pool.
    let cursor = 0;
    const worker = async () => {
      while (cursor < targets.length) {
        const i = cursor++;
        const { otcSymbol, target } = targets[i];
        const price = await fetchReferencePrice(target.kind, target.symbol, target.fallbackSymbol).catch(() => null);
        if (price == null) {
          failed += 1;
          const h = this.providerHealth(target.kind);
          h.failures += 1;
          continue;
        }
        ok += 1;
        const h = this.providerHealth(target.kind);
        h.successes += 1;
        h.lastPrice = price;
        h.lastAt = Date.now();
        // Anchor the engine. updateReferencePrice no-ops if the symbol is not
        // active in this process, so a stale target can never corrupt state.
        updateReferencePrice(otcSymbol, price);
      }
    };
    const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, targets.length || 1) }, worker);
    await Promise.all(workers);
    skipped = this.symbols - ok - failed;

    this.lastCycleAt = started;
    this.lastCycleDurationMs = Date.now() - started;
    this.lastCycleResults = { ok, failed, skipped };
    console.log(
      `[reference-feed] cycle complete · ok=${ok} failed=${failed} skipped=${skipped} · ${Date.now() - started}ms`
    );
    this.scheduleNext();
  }

  private scheduleNext() {
    if (!this.running) return;
    this.timer = setTimeout(() => this.cycle().catch(() => {}), this.pollIntervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  health(): ReferenceFeedHealth {
    return {
      enabled: this.enabled,
      running: this.running,
      pollIntervalMs: this.pollIntervalMs,
      symbols: this.symbols,
      lastCycleAt: this.lastCycleAt,
      lastCycleDurationMs: this.lastCycleDurationMs,
      lastCycleResults: this.lastCycleResults,
      providers: this.providers,
    };
  }
}

const g = globalThis as unknown as { __nexaRefFeed?: ReferenceFeedManager };
export const referenceFeed: ReferenceFeedManager =
  g.__nexaRefFeed || (g.__nexaRefFeed = new ReferenceFeedManager());

export function getReferenceFeedHealth(): ReferenceFeedHealth {
  return referenceFeed.health();
}
