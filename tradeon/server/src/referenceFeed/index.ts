/**
 * Reference feed bootstrap. Reads its config from the environment, configures
 * the singleton manager, and starts it once the OTC engine is the active
 * leader. Kept separate from index.ts so the wiring is one auditable import.
 */
import { env } from '../config/env';
import { referenceFeed } from './manager';

export { referenceFeed, getReferenceFeedHealth } from './manager';

export function bootstrapReferenceFeed(otcSymbols: string[]): void {
  const enabled =
    env.otcEngineEnabled &&
    env.referenceFeedEnabled &&
    otcSymbols.length > 0;
  referenceFeed.configure(env.referenceFeedEnabled, env.referenceFeedIntervalMs);
  if (enabled) {
    referenceFeed.start(otcSymbols);
  } else {
    console.log(
      `[reference-feed] disabled (engineEnabled=${env.otcEngineEnabled} feedEnabled=${env.referenceFeedEnabled})`
    );
  }
}

export function stopReferenceFeed(): void {
  referenceFeed.stop();
}
