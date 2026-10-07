/** Direct port of src/app/api/admin/kyc/file/route.js; transport imports only. */
import { get } from '@vercel/blob';
import { requireAdmin, json, route } from '../http';
import { PERMISSIONS } from '../lib/rbac.js';
import { one } from '../db';


export const GET = route(async (req) => {
  const { response } = await requireAdmin(PERMISSIONS.KYC_REVIEW);
  if (response) return response;

  const pathname = req.nextUrl.searchParams.get('pathname');
  if (!pathname || !pathname.startsWith('kyc/')) return json({ error: 'Invalid file path.' }, 400);

  if (pathname.startsWith('kyc/db/')) {
    const match = /^kyc\/db\/([a-f0-9-]{36})\/(document-front|document-back|selfie)$/.exec(pathname);
    if (!match) return json({ error: 'Invalid file path.' }, 400);
    const row = await one('SELECT doc_front, doc_back, selfie FROM kyc_submissions WHERE id=$1', [match[1]]);
    const field = { 'document-front': 'doc_front', 'document-back': 'doc_back', selfie: 'selfie' }[match[2]];
    const data = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(row?.[field] || '');
    if (!data) return new Response('Not found', { status: 404 });
    return new Response(Buffer.from(data[2], 'base64'), { headers: {
      'Content-Type': data[1], 'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff',
    } });
  }

  const result = await get(pathname, {
    access: 'private',
    ifNoneMatch: req.headers.get('if-none-match') || undefined,
  });
  if (!result) return new Response('Not found', { status: 404 });
  if (result.statusCode === 304) {
    return new Response(null, {
      status: 304,
      headers: { ETag: result.blob.etag, 'Cache-Control': 'private, no-cache' },
    });
  }
  return new Response(result.stream, {
    headers: {
      'Content-Type': result.blob.contentType || 'application/octet-stream',
      ETag: result.blob.etag,
      'Cache-Control': 'private, no-cache',
      'Content-Disposition': 'inline',
    },
  });
});
