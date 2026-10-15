import type { MarketProvider } from "../types";

/**
 * Live market provider — the OTC payout board.
 *
 * Rates come from `/api/market/otc/payouts`, the same in-memory feed the
 * trading ticket reads. The server recomputes them on a rolling step, so what
 * the marketing surface shows is what a trade would settle on.
 */

type PayoutsPayload = { payouts?: Record<string, unknown> };

export function createLiveMarketProvider(): MarketProvider {
  return {
    id: "live-otc-market",
    source: "live",

    async getPayouts(): Promise<Record<string, number>> {
      const response = await fetch("/api/market/otc/payouts", {
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`The payout feed answered with HTTP ${response.status}.`);
      }

      const payload = (await response.json()) as PayoutsPayload;
      const entries = Object.entries(payload.payouts ?? {});
      return Object.fromEntries(
        entries
          .filter(([, rate]) => typeof rate === "number" && Number.isFinite(rate))
          .map(([symbol, rate]) => [symbol, rate as number]),
      );
    },
  };
}
