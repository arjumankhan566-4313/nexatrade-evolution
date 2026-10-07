/** Existing V2 pool, with the legacy transaction contract (no schema/seeding). */
import { pool, one, sql } from '../config/db';
export { one, many, sql, uuid } from '../config/db';
export { normalizeSettings, getSettings } from './lib/settings.js';
export const money = (n: unknown) => Math.round(Number(n) * 100) / 100;

export async function withTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tx = {
      query: (text: string, params: unknown[] = []) => client.query(text, params),
      one: async (text: string, params: unknown[] = []) => (await client.query(text, params)).rows[0] ?? null,
      many: async (text: string, params: unknown[] = []) => (await client.query(text, params)).rows,
      lock: (table: string, id: string) => client.query(`SELECT id FROM ${table} WHERE id=$1 FOR UPDATE`, [id]),
    };
    const out = await fn(tx);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
