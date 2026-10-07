import type { AIAssistantProvider, MarketProvider, MetricsProvider } from './types';
import { createMockAIAssistantProvider } from './mock/ai';
import { createLiveMetricsProvider } from './live/metrics';
import { createLiveMarketProvider } from './live/market';

/**
 * The only place the app decides which implementation backs each interface.
 * Swapping an implementation is a change to THIS file — every feature picks it
 * up with no component edits.
 *
 * `metricsProvider` reads the real OTC engine (`/api/health/otc`).
 * `aiProvider` is still the built-in assistant; replace the factory with a real
 * model client and the widget needs no change.
 */

export const metricsProvider: MetricsProvider = createLiveMetricsProvider();
export const marketProvider: MarketProvider = createLiveMarketProvider();
export const aiProvider: AIAssistantProvider = createMockAIAssistantProvider();

export type {
  AIAssistantProvider,
  MarketProvider,
  MetricsProvider,
  MetricSample,
  SentimentReading,
} from './types';
