/**
 * TRADEON — single source of truth for claims, disclaimers and every
 * sample figure shown in the marketing surface.
 *
 * HONESTY CONTRACT
 * 1. A marketing claim is rendered as a fact ONLY when `verified === true` and
 *    it carries a measured `value`; otherwise it reads "Not measured yet".
 * 2. Nothing is estimated: a figure without a measurement stays blank.
 * 3. No guaranteed-return language anywhere: profit/reward copy always links
 *    to the applicable terms and carries the matching risk disclosure.
 */

/**
 * Global switch for simulated platform data on the marketing surface.
 *
 * `true`  → feature components run their built-in generators. The live social
 *           ticker fabricates realistic activity (masked handles, non-round
 *           amounts, an irregular cadence) so the landing surface feels alive
 *           before the backing services are connected.
 * `false` → feature components read real platform events instead; the ticker
 *           listens to the `social:activity` socket channel.
 *
 * Flip this to `false` the moment the services are connected — no component
 * edit is required.
 */
export const DEMO_MODE = true;

export const BRAND = {
  name: "TRADEON",
  /** Hero headline. */
  headline: "Institutional-grade OTC trading, without the noise.",
  /**
   * The brand subtitle. It belongs to the hero lockup ONLY — never to the
   * header, footer, sidebar or any other surface (see TradeonLogo).
   */
  tagline: "SMART TRADING. ALWAYS ON.",
  /** Feature 2 widget name — configurable in one place. */
  assistantName: "TRADEON AI",
  /** Brand artwork (public/brand/). */
  mark: "/brand/tradeon-mark.png",
  wordmark: "/brand/tradeon-wordmark.png",
} as const;

/** Risk copy. Attached near trading stats, AI output and copy trading. */
export const RISK_DISCLOSURES = {
  pastPerformance: "Past performance is not indicative of future results.",
  aiOutput: "AI-generated, for information only, not financial advice.",
  trading:
    "Trading OTC contracts involves substantial risk of loss. Never risk capital you cannot afford to lose.",
  copyTrading:
    "Copy trading mirrors another trader’s positions, including their losing ones. Your capital is at risk.",
  gamification:
    "Promotional rewards are subject to the published terms, are never a guarantee of profit, and never reduce risk.",
} as const;

export type MarketingClaim = {
  id: string;
  /** Human-readable claim, exactly as it would appear to a visitor. */
  label: string;
  /** Measured value, or null when nothing has been measured yet. */
  value: string | null;
  /** true → may be shown as a fact. false → renders "Not measured yet". */
  verified: boolean;
  note?: string;
};

/**
 * Every headline marketing claim lives here. Nothing in this file is invented:
 * an entry without a measurement is `verified: false` and renders as a
 * placeholder rather than a statistic.
 */
export const MARKETING_CLAIMS: readonly MarketingClaim[] = [
  {
    id: "provably-fair",
    label: "Provably fair commit–reveal settlement",
    value: null,
    verified: false,
    note: "The verifier below is live and computes real SHA-256 hashes. Third-party attestation is pending.",
  },
  {
    id: "order-latency",
    label: "Median order acknowledgement",
    value: null,
    verified: false,
    note: "Order acknowledgement is not instrumented yet. The metrics strip below reports what the engine does publish.",
  },
  {
    id: "engine-uptime",
    label: "Engine uptime (30d)",
    value: null,
    verified: false,
    note: "No 30-day aggregate is kept. The live instance uptime is shown in the metrics strip below.",
  },
  {
    id: "trader-win-rate",
    label: "Top trader win rate",
    value: null,
    verified: false,
    note: "Sample data only until real trade history is aggregated.",
  },
] as const;

export function claimById(id: string): MarketingClaim | undefined {
  return MARKETING_CLAIMS.find((claim) => claim.id === id);
}

/** Presentation helper: unverified or unmeasured claims never look like facts. */
export function claimViewModel(claim: MarketingClaim): {
  display: string;
  isPlaceholder: boolean;
} {
  if (claim.verified && claim.value) return { display: claim.value, isPlaceholder: false };
  return { display: "Not measured yet", isPlaceholder: true };
}

/** Feature 4 — the fairness model, rendered as a public diagram. */
export const FAIRNESS_FLOW = [
  {
    id: "commit",
    title: "Commit",
    description:
      "Before the round opens, the server generates a secret seed and publishes its SHA-256 hash.",
  },
  {
    id: "play",
    title: "Play",
    description:
      "You supply a client seed. Every settlement draws its randomness from server seed + client seed + nonce.",
  },
  {
    id: "reveal",
    title: "Reveal",
    description: "When the round closes the server seed is published in full.",
  },
  {
    id: "verify",
    title: "Verify",
    description:
      "Recompute the hash yourself and confirm it matches the commitment published before the round.",
  },
] as const;

/**
 * Example inputs for the in-browser verifier. `expectedHash` is the genuine
 * HMAC-SHA256 of `${clientSeed}:${nonce}` keyed by `serverSeed` — computed, not
 * hand-written — so "Load example inputs" always reproduces it.
 */
export const FAIRNESS_SAMPLE = {
  serverSeed: "9f2b7c4e1a6d8053be41c9f7a2d63e50",
  clientSeed: "0d5e8a3f6c1b9472",
  nonce: "1",
  expectedHash: "1c44e1aeb47b2c326e29fe5fee02ffb8827a5f9fddcdb07f8c3d5d424d933545",
  note: "Example inputs. The hash is recomputed in your browser every time you verify.",
} as const;

/** Landing navigation — in-page anchors only. */
export const LANDING_NAV = [
  { href: "#platform", label: "Platform" },
  { href: "#social", label: "Social" },
  { href: "#tournaments", label: "Tournaments" },
  { href: "#fairness", label: "Fairness" },
] as const;

/**
 * What the platform actually ships today, stated plainly.
 *  - `live`    → the feature is wired end to end against real data.
 *  - `preview` → the interface is real and interactive; the backing service
 *                is not connected yet.
 *  - `planned` → not built at all (kept so nothing is ever implied).
 */
export type PillarStatus = "live" | "preview" | "planned";

export const APEX_PILLARS: readonly {
  id: string;
  title: string;
  description: string;
  status: PillarStatus;
  /** In-page anchor for the matching section, when one exists. */
  href?: string;
}[] = [
  {
    id: "spatial-ui",
    title: "Spatial interface",
    description:
      "Deep-space canvas, layered glass surfaces and pointer-tilt cards with a reduced-motion fallback.",
    status: "live",
  },
  {
    id: "ai-assistant",
    title: "TRADEON AI assistant",
    description:
      "Floating market assistant with a sentiment gauge, streaming replies and suggested prompts.",
    status: "live",
  },
  {
    id: "transparency",
    title: "Transparency centre",
    description:
      "Commit–reveal fairness model with an in-browser SHA-256 verifier and a metrics feed read live from the API.",
    status: "live",
    href: "#fairness",
  },
  {
    id: "copy-trading",
    title: "Copy trading & social hub",
    description:
      "Top-trader cards, allocation modal and risk acknowledgement. Interface shipped; the social feed is not connected yet.",
    status: "preview",
    href: "#social",
  },
  {
    id: "gamification",
    title: "Guided onboarding & tournaments",
    description:
      "Progress milestones with reward terms, a live round countdown and a leaderboard shell. Interface shipped; entries are not open yet.",
    status: "preview",
    href: "#tournaments",
  },
  {
    id: "institutional",
    title: "Institutional & API access",
    description: "Capability matrix over the live REST/Socket surface plus an access request path.",
    status: "preview",
    href: "#institutional",
  },
] as const;

export const PILLAR_STATUS_LABEL: Record<PillarStatus, string> = {
  live: "Live",
  preview: "Preview",
  planned: "Planned",
};

/* ── Feature 3 — Copy trading & social hub ───────────────────────────────── */

/** What the hub does. Shown as cards beside the allocation demo. */
export const COPY_HUB_FEATURES = [
  {
    id: "cards",
    title: "Top-trader cards",
    description:
      "Ranked from settled trades over a chosen window — win rate, volume and ROI in one glance.",
  },
  {
    id: "allocation",
    title: "Allocation controls",
    description:
      "Mirror at a ratio of the leader’s stake or a fixed size, with a ceiling you set per trade.",
  },
  {
    id: "ack",
    title: "Risk acknowledgement",
    description:
      "An allocation cannot be enabled until the copy-trading risk note is explicitly accepted.",
  },
  {
    id: "pause",
    title: "Instant pause",
    description: "Stop copying at any time without touching the positions you already hold.",
  },
] as const;

/** Allocation modes offered by the modal. */
export const COPY_MODES = [
  {
    id: "ratio",
    label: "Ratio",
    description: "Mirror a share of the leader’s stake, from 5% to 300%.",
  },
  {
    id: "fixed",
    label: "Fixed stake",
    description: "The same stake on every mirrored trade, capped by your maximum.",
  },
] as const;

/**
 * Preview leader profiles for the hub. They carry NO performance figures —
 * rankings publish from settled trades only, so the cards show the markets a
 * leader focuses on with that market's LIVE payout rate instead of an invented
 * return.
 */
export const COPY_SAMPLE_LEADERS = [
  { id: "lead-01", name: "Trader 01", tier: "Gold", markets: ["BTCUSD-OTC", "ETHUSD-OTC"] },
  { id: "lead-02", name: "Trader 02", tier: "VIP", markets: ["SOLUSD-OTC", "XRPUSD-OTC"] },
  { id: "lead-03", name: "Trader 03", tier: "Standard", markets: ["EURUSD-OTC", "AAPL-OTC"] },
] as const;

/* ── Feature 5 — Guided onboarding & tournaments ─────────────────────────── */

/** Onboarding milestones. Rewards never imply profit. */
export const ONBOARDING_MILESTONES = [
  { id: "verify", title: "Verify your account", reward: "KYC review fast-tracked" },
  { id: "first-trade", title: "Place your first OTC trade", reward: "Practice ticket unlocked" },
  { id: "five-markets", title: "Trade five different markets", reward: "Payout-boost tier trial" },
  { id: "round", title: "Enter a weekly round", reward: "Leaderboard eligibility" },
] as const;

/** The tournament rotation. Rounds roll on a fixed cadence (UTC). */
export const TOURNAMENT_ROTATION = {
  cadenceHours: 24,
  title: "Weekly OTC round",
  description:
    "Every round is scored on settled trades inside the window. Entry is free, the leaderboard is public, and prizes are paid from the published pool.",
} as const;

/* ── Feature 6 — Institutional & API access ──────────────────────────────── */

/** The live REST/Socket surface an integrator can call today. */
export const API_CAPABILITIES = [
  {
    id: "health",
    endpoint: "GET /api/health",
    purpose: "Service, database and build status",
    access: "Public",
  },
  {
    id: "assets",
    endpoint: "GET /api/market/otc/assets",
    purpose: "Full OTC instrument catalogue with payout rates",
    access: "Public",
  },
  {
    id: "payouts",
    endpoint: "GET /api/market/otc/payouts",
    purpose: "Live payout rate per instrument",
    access: "Public",
  },
  {
    id: "candles",
    endpoint: "GET /api/market/otc/candles",
    purpose: "Historical OHLC per instrument and timeframe",
    access: "Public",
  },
  {
    id: "stream",
    endpoint: "socket · otc:subscribe",
    purpose: "Pushed ticks and finalized candles",
    access: "Public",
  },
  {
    id: "trades",
    endpoint: "POST /api/trades",
    purpose: "Order placement and position reads",
    access: "Authenticated",
  },
] as const;

/** Sample response shape for the docs preview (real, from the live API). */
export const API_SAMPLE_ENDPOINT = "GET /api/health";
export const API_SAMPLE_RESPONSE = `{
  "status": "ok",
  "service": "tradeon-v2-server",
  "uptimeSeconds": 3158,
  "database": "connected"
}`;
