/** Re-export the legacy apiClient surface from the V2 legacyInfra shim.
 *
 * CONTRACT (differs from `lib/api.ts` — read before importing):
 *  - `api()` here THROWS an ApiRequestError on any !res.ok response (the error
 *    carries `.status`, `.data`, `.code`, `.hint`, `.fields`, `.detail`).
 *  - It does NOT add an `/api` prefix — callers pass the full path
 *    (e.g. `api('/api/admin/stats')`).
 */
export { api, money, fmtPrice, timeAgo, fmtDate } from "./legacyInfra";
export type { ApiRequestError, LiveEvent } from "./legacyInfra";
