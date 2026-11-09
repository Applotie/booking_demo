// Admin sign-in: username and password from the server environment
// (ADMIN_USERNAME / ADMIN_PASSWORD), checked by POST /api/auth/login, which
// then sets a signed, HttpOnly session cookie. The middleware and the admin
// API routes accept a request only with a valid, unexpired cookie.
//
// The cookie is signed with HMAC-SHA256. The key is ADMIN_SESSION_SECRET if
// set, otherwise it is derived from the admin username and password, so
// changing the password signs everyone out.
//
// Production: the admin area stays locked until ADMIN_USERNAME and
// ADMIN_PASSWORD are set. Development: without them the admin area is open, so
// local setup keeps working.
//
// Runs in both the Edge (middleware) and Node.js (route handlers) runtimes, so
// it only uses web-standard APIs.

export const SESSION_COOKIE = 'busops_admin_session';
export const SESSION_MAX_AGE = 8 * 60 * 60; // seconds

const encoder = new TextEncoder();

export function adminCredentials() {
  const username = process.env.ADMIN_USERNAME || '';
  const password = process.env.ADMIN_PASSWORD || '';
  return username && password ? { username, password } : null;
}

// Open access only in development and only when no credentials are configured.
export function adminAuthDisabled() {
  return !adminCredentials() && process.env.NODE_ENV !== 'production';
}

// Compares in time that does not depend on where the strings first differ.
function safeEqual(a, b) {
  const x = encoder.encode(String(a));
  const y = encoder.encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function credentialsMatch(username, password) {
  const expected = adminCredentials();
  if (!expected) return false;
  // Evaluate both so timing does not reveal which one was wrong.
  const userOk = safeEqual(username, expected.username);
  const passOk = safeEqual(password, expected.password);
  return userOk && passOk;
}

function toBase64Url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

async function signingKey() {
  const creds = adminCredentials();
  const secret = process.env.ADMIN_SESSION_SECRET || (creds ? `busops-admin:${creds.username}:${creds.password}` : '');
  if (!secret) return null;
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function createSessionToken(now = Date.now()) {
  const key = await signingKey();
  if (!key) throw new Error('Admin credentials are not configured.');
  const payload = toBase64Url(encoder.encode(JSON.stringify({ u: adminCredentials().username, iat: now, exp: now + SESSION_MAX_AGE * 1000 })));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
  return `${payload}.${toBase64Url(signature)}`;
}

export async function verifySessionToken(token, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 1000) return false;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) return false;
  try {
    const key = await signingKey();
    if (!key) return false;
    // crypto.subtle.verify compares in constant time.
    const valid = await crypto.subtle.verify('HMAC', key, fromBase64Url(signature), encoder.encode(payload));
    if (!valid) return false;
    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    return data.u === adminCredentials()?.username && typeof data.exp === 'number' && data.exp > now;
  } catch {
    return false;
  }
}

function readCookie(request, name) {
  if (request.cookies?.get) return request.cookies.get(name)?.value ?? null;
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

// 'ok' | 'disabled' (dev without credentials) | 'unconfigured' (production
// without credentials) | 'signed-out'
export async function adminSessionState(request) {
  if (adminAuthDisabled()) return 'disabled';
  if (!adminCredentials()) return 'unconfigured';
  return (await verifySessionToken(readCookie(request, SESSION_COOKIE))) ? 'ok' : 'signed-out';
}

// For admin API route handlers: null when allowed, otherwise a JSON error.
export async function requireAdmin(request) {
  const state = await adminSessionState(request);
  if (state === 'ok' || state === 'disabled') return null;
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (state === 'unconfigured') {
    return new Response(JSON.stringify({ ok: false, code: 'ADMIN_NOT_CONFIGURED', message: 'Admin sign-in is not configured on the server.' }), { status: 503, headers });
  }
  return new Response(JSON.stringify({ ok: false, code: 'UNAUTHENTICATED', message: 'Your admin session has ended. Please sign in again.' }), { status: 401, headers });
}

export function sessionCookieHeader(token, request) {
  const secure = process.env.NODE_ENV === 'production' || new URL(request.url).protocol === 'https:';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookieHeader(request) {
  const secure = process.env.NODE_ENV === 'production' || new URL(request.url).protocol === 'https:';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

// Only same-site admin paths are allowed as a post-login destination.
export function safeNextPath(value) {
  return typeof value === 'string' && /^\/admin(\/[A-Za-z0-9_\-/]*)?(\?[^\s]*)?$/.test(value) && !value.startsWith('/admin/login') ? value : '/admin';
}
