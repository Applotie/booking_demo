import { clearSessionCookieHeader } from '@/lib/server/admin-auth';
import { json, errorResponse, readJson } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST {} -> removes the admin session cookie.
export async function POST(request) {
  try {
    await readJson(request, 1024); // same-origin + JSON checks, so other sites cannot sign the admin out
    const res = json({ ok: true });
    res.headers.append('Set-Cookie', clearSessionCookieHeader(request));
    return res;
  } catch (err) {
    return errorResponse(err, 'admin logout');
  }
}
