/** Legacy effective gateway status (no payments are triggered here). */
import { autoDepositsAllowed, gatewayEnabled, demoCheckoutSelected, demoGatewayAllowed, gatewayCurrency } from './gatewayMode.js';
export function gatewayPublicConfig(settings, env = process.env) {
  const autoOn = autoDepositsAllowed(settings);
  const liveKey = gatewayEnabled(env);
  const live = autoOn && liveKey; // live gateway users see
  const demo = autoOn && demoCheckoutSelected(settings) && demoGatewayAllowed(env); // demo checkout users see
  return {
    enabled: live,
    demo,
    currency: gatewayCurrency(env),
    autoDeposits: autoOn, // master AUTO switch
    liveKey, // deployment fact: is a real NOWPayments key configured?
    // Why the ⚡ Automatic tab is unavailable when neither path is on.
    reason: live || demo ? null : autoOn ? 'DEMO_DISABLED' : 'AUTO_DISABLED',
  };
}

