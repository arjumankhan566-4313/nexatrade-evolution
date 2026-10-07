import { Pool } from 'pg';
import { env } from './env';

// The stored DATABASE_URL may arrive wrapped in double quotes; normalise once,
// here. Everything else imports from this module.
const raw = env.databaseUrl.replace(/^"|"$/g, '');
const isLocal = raw ? /^(localhost|127\.0\.0\.1|::1)/.test(raw) : true;

export const pool = new Pool({
  connectionString: raw || undefined,
  max: 10,
  // Managed Postgres (Neon/Supabase/RDS) requires TLS; request it explicitly
  // for remote hosts unless the URL disables it. Local sockets stay plain.
  ...(raw && !isLocal && !/sslmode=disable/.test(raw)
    ? { ssl: { rejectUnauthorized: false } }
    : {}),
});

export async function sql(text: string, params: unknown[] = []) {
  return pool.query(text, params as never[]);
}

export async function one<T = Record<string, any>>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const res = await pool.query(text, params as never[]);
  return (res.rows[0] as T) ?? null;
}

export async function many<T = Record<string, any>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await pool.query(text, params as never[]);
  return res.rows as T[];
}

export function uuid() {
  return crypto.randomUUID();
}
