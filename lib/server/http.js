// Request parsing, input checks and error responses for the API routes.

import { DatabaseUnavailableError } from './mongodb.js';
import { ConflictError } from './store.js';

export class BadRequestError extends Error {
  constructor(message = 'Invalid request.', status = 400) {
    super(message);
    this.name = 'BadRequestError';
    this.status = status;
  }
}

export const NO_STORE = { 'Cache-Control': 'no-store' };

export function json(body, status = 200) {
  return Response.json(body, { status, headers: NO_STORE });
}

// Blocks cross-site writes: a browser always sends Origin on cross-site POSTs,
// and the JSON content type cannot be sent cross-site without a CORS preflight
// (which this app never approves).
function assertSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').split(',')[0].trim();
  let originHost = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    /* fall through */
  }
  if (!host || originHost !== host) throw new BadRequestError('Cross-site requests are not allowed.', 403);
}

// Reads a JSON body with a hard size limit.
export async function readJson(request, maxBytes, limits) {
  assertSameOrigin(request);
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new BadRequestError('Expected a JSON request body.', 415);
  const declared = Number(request.headers.get('content-length'));
  if (declared && declared > maxBytes) throw new BadRequestError('Request body is too large.', 413);
  const text = await request.text();
  if (Buffer.byteLength(text) > maxBytes) throw new BadRequestError('Request body is too large.', 413);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new BadRequestError('Request body is not valid JSON.');
  }
  assertSafeJson(body, limits);
  return body;
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Rejects operator-style keys ($where, $gt, a.b) and pathological nesting so
// user input can never be interpreted as a MongoDB query or update operator.
export function assertSafeJson(value, { maxDepth = 12, maxString = 20000, maxArray = 5000 } = {}) {
  let nodes = 0;
  const visit = (v, depth) => {
    if (++nodes > 200000) throw new BadRequestError('Request body is too complex.');
    if (depth > maxDepth) throw new BadRequestError('Request body is nested too deeply.');
    if (typeof v === 'string') {
      if (v.length > maxString) throw new BadRequestError('A text value is too long.');
      return;
    }
    if (v === null || typeof v === 'number' || typeof v === 'boolean') return;
    if (Array.isArray(v)) {
      if (v.length > maxArray) throw new BadRequestError('A list in the request is too long.');
      v.forEach((x) => visit(x, depth + 1));
      return;
    }
    if (typeof v === 'object') {
      for (const key of Object.keys(v)) {
        if (key.startsWith('$') || key.includes('.') || FORBIDDEN_KEYS.has(key)) throw new BadRequestError('Request contains a field name that is not allowed.');
        visit(v[key], depth + 1);
      }
      return;
    }
    throw new BadRequestError('Request contains an unsupported value.');
  };
  visit(value, 0);
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;

export function requireId(value, label = 'id') {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw new BadRequestError(`Invalid ${label}.`);
  return value;
}

export function optionalId(value, label) {
  return value == null || value === '' ? null : requireId(value, label);
}

export function requireObject(value, label = 'input') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestError(`Invalid ${label}.`);
  return value;
}

export function requireString(value, label, max = 200) {
  if (typeof value !== 'string' || value.length > max) throw new BadRequestError(`Invalid ${label}.`);
  return value;
}

export function optionalString(value, label, max = 200) {
  return value == null ? '' : requireString(value, label, max);
}

export function requireArray(value, label, max = 500) {
  if (!Array.isArray(value) || value.length > max) throw new BadRequestError(`Invalid ${label}.`);
  return value;
}

// Converts any thrown error into a safe response. Internal details are logged
// on the server and never sent to the browser.
export function errorResponse(err, context) {
  if (err instanceof BadRequestError) return json({ ok: false, message: err.message }, err.status);
  if (err instanceof ConflictError) return json({ ok: false, message: err.message, code: 'CONFLICT' }, 409);
  if (err instanceof DatabaseUnavailableError || isConnectionError(err)) {
    console.error(`[api] ${context}: database unavailable:`, err.cause?.message || err.message);
    return json({ ok: false, message: 'The service is temporarily unavailable. Please try again in a moment.', code: 'UNAVAILABLE' }, 503);
  }
  console.error(`[api] ${context}:`, err);
  return json({ ok: false, message: 'Something went wrong. Please try again.', code: 'SERVER_ERROR' }, 500);
}

function isConnectionError(err) {
  const name = err?.name || '';
  return /MongoServerSelectionError|MongoNetworkError|MongoNetworkTimeoutError|MongoTopologyClosedError|PoolClearedError/.test(name);
}
