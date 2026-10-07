/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SystemSetting reader — ported 1:1 from legacy src/models/SystemSetting.js
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The `system_settings` table holds admin risk rules (execution_mode,
 * global_probability_rate, spread/slippage, circuit breaker, force_loss_mode,
 * cashback). The V2 trade engine reads these exactly as the legacy engine did.
 */
import { one } from '../config/db';

export interface SystemSettings {
  execution_mode: string;
  global_probability_rate: number;
  enable_circuit_breaker: boolean;
  circuit_breaker_factor: number;
  spread_percentage: number;
  slippage_percentage: number;
  force_loss_mode: boolean;
  cashback_percentage: number;
  market_data_source: string;
  maintenance_mode: boolean;
}

let cached: SystemSettings | null = null;
let cacheAt = 0;
const CACHE_TTL = 3000; // 3s — legacy read fresh on every placeTrade; 3s is a
// reasonable refresh that avoids hammering the DB while the engine settles.

const DEFAULTS: SystemSettings = {
  execution_mode: 'SIMULATION',
  global_probability_rate: 30,
  enable_circuit_breaker: false,
  circuit_breaker_factor: 0.5,
  spread_percentage: 0.05,
  slippage_percentage: 0.03,
  force_loss_mode: false,
  cashback_percentage: 0,
  market_data_source: 'LIVE',
  maintenance_mode: false,
};

/**
 * Load the singleton system_settings row (id=1). The legacy SystemSetting.get()
 * was synchronous because PGlite/Better-SQLite3 is sync; here it's async (pg),
 * so the trade engine awaits this on every placeTrade/resolveTrade.
 */
export async function getSettings(): Promise<SystemSettings> {
  if (cached && Date.now() - cacheAt < CACHE_TTL) return cached;
  const row = await one('SELECT * FROM system_settings WHERE id = 1');
  if (!row) {
    cached = { ...DEFAULTS };
    cacheAt = Date.now();
    return cached;
  }
  const r = row as Record<string, any>;
  cached = {
    execution_mode: r.execution_mode || 'SIMULATION',
    global_probability_rate: Number(r.global_probability_rate ?? 30),
    enable_circuit_breaker: Boolean(r.enable_circuit_breaker),
    circuit_breaker_factor: Number(r.circuit_breaker_factor ?? 0.5),
    spread_percentage: Number(r.spread_percentage ?? 0.05),
    slippage_percentage: Number(r.slippage_percentage ?? 0.03),
    force_loss_mode: Boolean(r.force_loss_mode),
    cashback_percentage: Number(r.cashback_percentage ?? 0),
    market_data_source: r.market_data_source || 'LIVE',
    maintenance_mode: Boolean(r.maintenance_mode),
  };
  cacheAt = Date.now();
  return cached;
}

/** Force a refresh (after admin updates settings). */
export function invalidateSettings(): void {
  cached = null;
}
