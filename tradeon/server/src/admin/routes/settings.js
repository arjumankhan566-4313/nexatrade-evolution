/** Direct port of src/app/api/admin/settings/route.js; transport imports only. */
import { sql, getSettings, normalizeSettings, one } from '../db';
import { requireAdmin, json, fail, route } from '../http';
import { logSecurity } from '../http';
import { publish } from '../lib/realtime.js';
import { PERMISSIONS } from '../lib/rbac.js';
import { invalidateSettings } from '../../trade/settings';


export const GET = route(async () => {
  const { response } = await requireAdmin();
  if (response) return response;
  return json({ settings: await getSettings() });
});

const NUMERIC = [
  'max_stake', 'min_stake', 'min_deposit', 'min_withdrawal', 'sharp_trader_threshold',
  'target_win_rate',
];
const BOOLEAN = [
  'withdrawal_needs_kyc', 'maintenance_mode',
  'copy_trading_enabled', 'tournaments_enabled', 'leaderboard_enabled',
  'auto_deposits_enabled', 'demo_gateway_enabled',
  'risk_engine_enabled', 'enable_force_loss',
  'enable_circuit_breaker', 'force_loss_mode',
];

// Bounds copied from legacy/src/controllers/adminController.js:updateSettings.
// The two limit aliases map to existing columns; no schema changes are needed.
const LEGACY_NUMERIC = {
  global_probability_rate: ['global_probability_rate', 0, 95],
  circuit_breaker_factor: ['circuit_breaker_factor', 0.05, 1],
  spread_percentage: ['spread_percentage', 0, 1],
  slippage_percentage: ['slippage_percentage', 0, 1],
  min_deposit_limit: ['min_deposit', 1, 10000],
  min_withdrawal_limit: ['min_withdrawal', 1, 10000],
  referral_bonus: ['referral_bonus', 0, 1000],
  cashback_percentage: ['cashback_percentage', 0, 50],
};

export const PATCH = route(async (req) => {
  const body = await req.json().catch(() => ({}));
  const gatewayKeys = new Set(['auto_deposits_enabled', 'demo_gateway_enabled']);
  const permission = Object.keys(body).length > 0 && Object.keys(body).every((key) => gatewayKeys.has(key))
    ? PERMISSIONS.PAYMENT_METHODS_MANAGE
    : PERMISSIONS.SETTINGS_MANAGE;
  const { user, response } = await requireAdmin(permission);
  if (response) return response;

  const sets = [];
  const values = [];
  for (const [key, [column, lo, hi]] of Object.entries(LEGACY_NUMERIC)) {
    if (body[key] === undefined) continue;
    const n = parseFloat(body[key]);
    if (!Number.isFinite(n)) continue;
    values.push(Math.max(lo, Math.min(hi, n)));
    sets.push(`${column} = $${values.length}`);
  }
  if (body.execution_mode !== undefined) {
    values.push(body.execution_mode === 'REAL_MARKET' ? 'REAL_MARKET' : 'SIMULATION');
    sets.push(`execution_mode = $${values.length}`);
  }
  if (body.market_data_source !== undefined) {
    values.push(body.market_data_source === 'LIVE' ? 'LIVE' : 'SYNTHETIC');
    sets.push(`market_data_source = $${values.length}`);
  }
  for (const key of NUMERIC) {
    if (body[key] === undefined) continue;
    const v = Number(body[key]);
    if (!Number.isFinite(v) || v < 0) return fail(`${key} must be a positive number.`);
    if (key === 'target_win_rate' && v > 100) return fail('Target win rate must be between 0 and 100.');
    values.push(v);
    sets.push(`${key} = $${values.length}`);
  }
  for (const key of BOOLEAN) {
    if (body[key] === undefined) continue;
    values.push(Boolean(body[key]));
    sets.push(`${key} = $${values.length}`);
  }
  if (!sets.length) return fail('No settings supplied.');

  await sql(
    `UPDATE system_settings SET ${sets.join(', ')}, settings_version = settings_version + 1, updated_at = NOW() WHERE id = 1`,
    values
  );
  invalidateSettings();
  await logSecurity({ req, userId: user.id, email: user.email, event: 'RISK_SETTINGS_UPDATED', severity: 'CRITICAL', meta: body });

  const row = await one('SELECT * FROM system_settings WHERE id=1');
  const settings = normalizeSettings(row);
  // Zero-latency propagation: every open terminal applies this within ~1s.
  await publish('settings', { settings, changed: Object.keys(body) });
  if (body.maintenance_mode !== undefined) {
    await publish('maintenance', { enabled: Boolean(body.maintenance_mode) });
  }
  return json({ settings });
});
