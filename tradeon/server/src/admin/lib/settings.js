/** Legacy settings read/normalization; existing V2 pool only. */
import { one, sql } from '../../config/db';
export async function getSettings() {
  const row = await one('SELECT * FROM system_settings WHERE id = 1');
  if (row) return normalizeSettings(row);
  await sql('INSERT INTO system_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
  return normalizeSettings(await one('SELECT * FROM system_settings WHERE id = 1'));
}

export function normalizeSettings(row) {
  return {
    ...row,
    // Vanilla legacy risk controls use these names; the shared PostgreSQL
    // schema already stores deposit/withdrawal limits without the suffix.
    min_deposit_limit: Number(row.min_deposit),
    min_withdrawal_limit: Number(row.min_withdrawal),
    global_probability_rate: Number(row.global_probability_rate),
    enable_circuit_breaker: Boolean(row.enable_circuit_breaker),
    circuit_breaker_factor: Number(row.circuit_breaker_factor),
    spread_percentage: Number(row.spread_percentage),
    slippage_percentage: Number(row.slippage_percentage),
    force_loss_mode: Boolean(row.force_loss_mode),
    referral_bonus: Number(row.referral_bonus),
    cashback_percentage: Number(row.cashback_percentage),
    target_win_rate: Number(row.target_win_rate),
    enable_force_loss: Boolean(row.enable_force_loss),
    risk_engine_enabled: Boolean(row.risk_engine_enabled),
    copy_trading_enabled: row.copy_trading_enabled === undefined ? true : Boolean(row.copy_trading_enabled),
    tournaments_enabled: row.tournaments_enabled === undefined ? true : Boolean(row.tournaments_enabled),
    leaderboard_enabled: row.leaderboard_enabled === undefined ? true : Boolean(row.leaderboard_enabled),
    sharp_trader_threshold: Number(row.sharp_trader_threshold ?? 65),
    settings_version: Number(row.settings_version ?? 1),
    max_stake: Number(row.max_stake),
    min_stake: Number(row.min_stake),
    min_deposit: Number(row.min_deposit),
    min_withdrawal: Number(row.min_withdrawal),
    withdrawal_needs_kyc: Boolean(row.withdrawal_needs_kyc),
    maintenance_mode: Boolean(row.maintenance_mode),
    affiliate_default_rate: Number(row.affiliate_default_rate ?? 40.00),
    affiliate_enabled: row.affiliate_enabled === undefined ? true : Boolean(row.affiliate_enabled),
    auto_deposits_enabled: row.auto_deposits_enabled === undefined ? true : Boolean(row.auto_deposits_enabled),
    demo_gateway_enabled: row.demo_gateway_enabled === undefined ? true : Boolean(row.demo_gateway_enabled),
  };
}
