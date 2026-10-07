/** Thin Express transport for verbatim legacy admin controllers.
 * Keeps their SQL, validation and permissions unchanged; Express owns JSON
 * parsing, so req.json()/readJson() never read an already-consumed stream.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { Readable } from 'node:stream';
import type { Request, Response as ExpressResponse, RequestHandler } from 'express';
import { ADMIN_COOKIE, getSessionUser, isStaff, logSecurity as writeSecurity } from '../lib/auth';
import { can } from '../lib/rbac';

const context = new AsyncLocalStorage<{ req: Request }>();
export const json = (data: unknown, status = 200) => Response.json(data, { status });
export const fail = (error: string, status = 400) => json({ error }, status);
export const readJson = (req: { json: () => Promise<any> }) => req.json();

export async function requireAdmin(permission: string | null = null) {
  const current = context.getStore();
  if (!current) throw new Error('Admin request context is missing.');
  const user = await getSessionUser(current.req, ADMIN_COOKIE);
  if (!user || !isStaff(user.role)) return { user: null, response: fail('Admin authentication required.', 401) };
  if (permission && !can(user.role, permission)) return { user: null, response: fail('Your role does not have permission to perform this action.', 403) };
  return { user, response: null };
}

export async function logSecurity(opts: Parameters<typeof writeSecurity>[0]) {
  return writeSecurity({ ...opts, req: context.getStore()?.req });
}

export function route(handler: (...args: any[]) => Promise<Response>): RequestHandler {
  return async (req: Request, res: ExpressResponse) => {
    await context.run({ req }, async () => {
      try {
        const headers = new Headers();
        for (const [name, value] of Object.entries(req.headers)) {
          if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
        }
        const url = new URL(req.originalUrl, 'http://localhost');
        const response = await handler({ url: url.href, nextUrl: url, headers, json: async () => req.body || {} }, { params: Promise.resolve(req.params) });
        res.status(response.status);
        response.headers.forEach((value, name) => res.setHeader(name, value));
        if (!response.body) { res.end(); return; }
        Readable.fromWeb(response.body as any).on('error', (err) => res.destroy(err)).pipe(res);
      } catch (err) {
        const error = err as Error & { status?: number };
        if (!res.headersSent) res.status(error.status || 500).json({ error: error.message });
        else res.destroy(error);
      }
    });
  };
}
