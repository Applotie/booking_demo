import { adminCredentials, adminAuthDisabled, credentialsMatch, createSessionToken, sessionCookieHeader } from '@/lib/server/admin-auth';
import { clientIp, retryAfterSeconds, recordFailure, recordSuccess } from '@/lib/server/login-limiter';
import { readJson, json, errorResponse, BadRequestError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { username, password } -> sets the admin session cookie.
export async function POST(request) {
  try {
    if (adminAuthDisabled()) return json({ ok: true, disabled: true });
    if (!adminCredentials()) {
      return json({ ok: false, code: 'ADMIN_NOT_CONFIGURED', message: 'Admin sign-in is not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD on the server.' }, 503);
    }
    const ip = clientIp(request);
    const wait = retryAfterSeconds(ip);
    if (wait) {
      const minutes = Math.ceil(wait / 60);
      const res = json({ ok: false, code: 'TOO_MANY_ATTEMPTS', message: `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.` }, 429);
      res.headers.set('Retry-After', String(wait));
      return res;
    }

    const body = await readJson(request, 4 * 1024);
    const username = typeof body?.username === 'string' ? body.username : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!username || !password) throw new BadRequestError('Enter your username and password.');

    if (!credentialsMatch(username, password)) {
      recordFailure(ip);
      // A short pause makes automated guessing slower still.
      await new Promise((r) => setTimeout(r, 400));
      return json({ ok: false, code: 'INVALID_CREDENTIALS', message: 'Incorrect username or password.' }, 401);
    }

    recordSuccess(ip);
    const res = json({ ok: true });
    res.headers.append('Set-Cookie', sessionCookieHeader(await createSessionToken(), request));
    return res;
  } catch (err) {
    return errorResponse(err, 'admin login');
  }
}
