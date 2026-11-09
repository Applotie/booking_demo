// Slows down password guessing: after MAX_FAILURES wrong attempts from one IP
// address within WINDOW_MS, further attempts are refused until the window
// passes. Kept in this server process's memory, so on hosts that run several
// instances each instance counts separately.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const attempts = globalThis.__busopsLoginAttempts || (globalThis.__busopsLoginAttempts = new Map());

export function clientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  return (forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'local').trim();
}

function entry(ip, now) {
  const e = attempts.get(ip);
  if (!e || now - e.first > WINDOW_MS) return null;
  return e;
}

// Seconds until the IP may try again, or 0 if it may try now.
export function retryAfterSeconds(ip, now = Date.now()) {
  const e = entry(ip, now);
  return e && e.count >= MAX_FAILURES ? Math.ceil((e.first + WINDOW_MS - now) / 1000) : 0;
}

export function recordFailure(ip, now = Date.now()) {
  const e = entry(ip, now) || { first: now, count: 0 };
  e.count++;
  attempts.set(ip, e);
  if (attempts.size > 10000) {
    for (const [key, value] of attempts) if (now - value.first > WINDOW_MS) attempts.delete(key);
  }
}

export function recordSuccess(ip) {
  attempts.delete(ip);
}
