/** Direct port: src/lib/gatewayMode.js. */
/**
 * Pure gateway-mode decision helpers (NO imports → unit-testable anywhere and
 * impossible to accidentally pull into the client bundle).
 *
 * These rules protect the deposit guarantee — "a deposit is credited only
 * after a real, confirmed charge":
 *
 *   1. The LIVE gateway is enabled only when a real, non-blank
 *      NOWPAYMENTS_API_KEY is configured.
 *   2. The DEMO gateway may run ONLY when the live gateway is NOT enabled.
 *      The moment a real key is configured, demo checkout tokens are never
 *      issued and the demo-charge endpoint refuses to run — the demo can never
 *      credit a balance behind the real gateway's back, no matter which
 *      environment the app is deployed to.
 *   3. DISABLE_DEMO_GATEWAY=1 switches the demo off even when no live key is
 *      present (a production staging box that wants no auto deposits at all).
 *   4. Administrator runtime control (system_settings row, flipped live from
 *      Admin → Finance → ⚡ Gateway config):
 *        • auto_deposits_enabled  — master switch for the ⚡ Automatic tab.
 *          OFF ⇒ Automatic deposits are disabled site-wide, live AND demo.
 *        • demo_gateway_enabled   — the in-app NexaPay demo checkout. OFF ⇒ the
 *          demo is disabled site-wide (it still can never run with a live key).
 *      Both default to ON and only ever make the demo/strict; neither can ever
 *      switch the demo ON while a real key exists (rule 2 always wins).
 *
 * Every function takes an optional `env` (defaults to process.env) so tests
 * can exercise the whole matrix deterministically.
 */

/** True only when a real (non-blank) server-side NOWPayments key is set. */
export function gatewayEnabled(env = process.env) {
  return typeof env.NOWPAYMENTS_API_KEY === 'string' && env.NOWPAYMENTS_API_KEY.trim().length > 0;
}

/**
 * True only when the in-app demo gateway may be used.
 * Hard rule: never when a live key is configured.
 */
export function demoGatewayAllowed(env = process.env) {
  return !gatewayEnabled(env) && env.DISABLE_DEMO_GATEWAY !== '1';
}

/** Fiat currency configured for deposits (lower-cased). */
export function gatewayCurrency(env = process.env) {
  return (env.NEXT_PUBLIC_DEPOSIT_CURRENCY || 'usd').toLowerCase();
}

/**
 * Administrator master switch: may the ⚡ Automatic deposit tab run at all?
 * (system_settings.auto_deposits_enabled, defaults to ON.)
 */
export function autoDepositsAllowed(settings = {}) {
  return settings.auto_deposits_enabled !== false;
}

/**
 * Administrator demo switch: is the in-app demo checkout selected?
 * (system_settings.demo_gateway_enabled, defaults to ON.) This only matters
 * when no live key exists — rule 2 above still turns the demo off regardless.
 */
export function demoCheckoutSelected(settings = {}) {
  return settings.demo_gateway_enabled !== false;
}

/** Effective state users actually see: live gateway active? */
export function liveGatewayActive(settings = {}, env = process.env) {
  return autoDepositsAllowed(settings) && gatewayEnabled(env);
}

/** Effective state users actually see: demo gateway active? */
export function demoGatewayActive(settings = {}, env = process.env) {
  return autoDepositsAllowed(settings) && demoCheckoutSelected(settings) && demoGatewayAllowed(env);
}

