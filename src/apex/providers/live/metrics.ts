import type { MetricSample, MetricsProvider } from "../types";

/**
 * Live metrics provider — reads the running OTC engine.
 *
 * Every figure below is a value the server actually reports; there is no
 * estimate and no fallback number. A field the API does not return stays
 * `null`, and the tile renders "—" rather than a plausible-looking guess.
 */

type EngineHealthPayload = {
  engine?: {
    running?: boolean;
    uptimeMs?: number;
    subscriberCount?: number;
    queueDepth?: number;
    metrics?: {
      ticks?: number;
      flushes?: number;
      checkpoints?: number;
      gaps?: number;
      rejects?: number;
      lastTickAt?: number | null;
    };
    symbols?: unknown[];
  };
};

const numberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export function createLiveMetricsProvider(): MetricsProvider {
  return {
    id: "live-engine-metrics",
    source: "live",

    async getSystemMetrics(): Promise<readonly MetricSample[]> {
      const startedAt = performance.now();
      const response = await fetch("/api/health/otc", {
        headers: { accept: "application/json" },
      });
      // Round-trip of this very request — a real measurement, not a benchmark.
      const roundTripMs = performance.now() - startedAt;

      if (!response.ok) {
        throw new Error(`The metrics endpoint answered with HTTP ${response.status}.`);
      }

      const payload = (await response.json()) as EngineHealthPayload;
      const engine = payload.engine ?? {};
      const counters = engine.metrics ?? {};
      const measuredAt = new Date().toISOString();

      const sample = (
        id: string,
        label: string,
        value: number | null,
        unit: string,
        precision: number,
      ): MetricSample => ({
        id,
        label,
        value,
        unit,
        precision,
        source: "live",
        measuredAt: value === null ? null : measuredAt,
      });

      const uptimeMs = numberOrNull(engine.uptimeMs);

      return [
        sample(
          "engine-uptime",
          "Engine uptime (this instance)",
          uptimeMs === null ? null : uptimeMs / 3_600_000,
          "h",
          2,
        ),
        sample("ticks-published", "Ticks published", numberOrNull(counters.ticks), "", 0),
        sample(
          "instruments-streaming",
          "Instruments streaming",
          Array.isArray(engine.symbols) ? engine.symbols.length : null,
          "",
          0,
        ),
        sample("api-round-trip", "API round-trip (measured)", roundTripMs, "ms", 1),
      ];
    },
  };
}
