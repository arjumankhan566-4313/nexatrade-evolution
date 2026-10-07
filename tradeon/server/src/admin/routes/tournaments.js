/** Direct port of src/app/api/admin/tournaments/route.js; transport imports only. */
import { requireAdmin, json, fail, route } from '../http';
import { logSecurity } from '../http';
import { createTournament, listTournaments } from '../lib/tournaments.js';
import { PERMISSIONS } from '../lib/rbac.js';


export const GET = route(async () => {
  const { response } = await requireAdmin(PERMISSIONS.TOURNAMENTS_MANAGE);
  if (response) return response;
  return json({ tournaments: await listTournaments({}) });
});

/** CREATE a tournament — appears instantly in every player's lobby. */
export const POST = route(async (req) => {
  const { user, response } = await requireAdmin(PERMISSIONS.TOURNAMENTS_MANAGE);
  if (response) return response;
  const body = await req.json().catch(() => ({}));
  if (!String(body.name || '').trim()) return fail('Tournament name is required.');
  const tournament = await createTournament(body);
  await logSecurity({ req, userId: user.id, email: user.email, event: 'TOURNAMENT_CREATED', severity: 'WARNING', meta: { name: body.name } });
  return json({ tournament }, 201);
});
