/**
 * Provider contracts for the Apex surface.
 *
 * Every feature reads data through one of these interfaces, never from a mock
 * directly. Swapping a mock for a real backend is then a one-line change in
 * `src/apex/providers/index.ts` — no component changes.
 */

/** 'demo' → value produced locally and illustrative; 'live' → real measurement. */
export type ProviderSource = "live" | "demo";

export type ResourceStatus = "loading" | "ready" | "error";

export type ResourceState<T> = {
  data: T | null;
  status: ResourceStatus;
  error: string | null;
  reload: () => void;
};

export type MetricSample = {
  id: string;
  label: string;
  /** null → nothing has been measured yet; the UI shows "-", never a guess. */
  value: number | null;
  unit: string;
  /** How many decimals to render when a real value arrives. */
  precision: number;
  source: ProviderSource;
  measuredAt: string | null;
};

export interface MetricsProvider {
  readonly id: string;
  readonly source: ProviderSource;
  getSystemMetrics(): Promise<readonly MetricSample[]>;
}

export interface MarketProvider {
  readonly id: string;
  readonly source: ProviderSource;
  /** Live payout rate (percent) keyed by instrument symbol. */
  getPayouts(): Promise<Record<string, number>>;
}

export type SentimentReading = {
  symbol: string;
  /** 0-100 share of the simulated order flow reading bullish. */
  bullishPct: number;
  /** 0-1 model confidence for the simulated reading. */
  confidence: number;
  summary: string;
  generatedAt: string;
  source: ProviderSource;
};

export interface AIAssistantProvider {
  readonly id: string;
  readonly name: string;
  readonly source: ProviderSource;
  suggestedPrompts(): readonly string[];
  /** Follow-up prompts offered inside the conversation after a reply. */
  followUps(prompt: string, context?: { symbol?: string }): readonly string[];
  getSentiment(symbol: string): Promise<SentimentReading>;
  /** Streams the reply in chunks so the widget can render a typing effect. */
  ask(prompt: string, context?: { symbol?: string }): AsyncIterable<string>;
}
