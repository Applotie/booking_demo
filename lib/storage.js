// Central persistence layer. All reads and writes of application data go
// through this module. It is deliberately synchronous and collection-based so
// that it can later be swapped for an API-backed implementation.

import { KEYS, COLLECTIONS, SCHEMA_VERSION, STORAGE_PREFIX, CHANGE_EVENT } from './storage-keys.js';

function createMemoryBackend() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
  };
}

const memoryBackend = createMemoryBackend();
let backendOverride = null;

export function isBrowser() {
  return typeof window !== 'undefined';
}

// Used by unit tests to run services without a browser.
export function setStorageBackend(backend) {
  backendOverride = backend;
}

export function createInMemoryBackend() {
  return createMemoryBackend();
}

function backend() {
  if (backendOverride) return backendOverride;
  if (isBrowser()) {
    try {
      return window.localStorage;
    } catch {
      return memoryBackend;
    }
  }
  return memoryBackend;
}

export class StorageError extends Error {}

function emitChange(collection) {
  if (!isBrowser()) return;
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { collection } }));
  } catch {
    // CustomEvent unavailable – listeners will pick up changes on next load.
  }
}

// ---------------------------------------------------------------------------
// Meta + storage issues
// ---------------------------------------------------------------------------

export function readMeta() {
  try {
    const raw = backend().getItem(KEYS.meta);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeMeta(meta) {
  try {
    backend().setItem(KEYS.meta, JSON.stringify(meta));
  } catch {
    // Meta is advisory; ignore quota failures here.
  }
}

function recordIssue(message) {
  const meta = readMeta() || { schemaVersion: SCHEMA_VERSION, createdAt: new Date().toISOString() };
  const issues = Array.isArray(meta.issues) ? meta.issues : [];
  issues.push({ message, at: new Date().toISOString() });
  meta.issues = issues.slice(-20);
  writeMeta(meta);
}

export function getStorageIssues() {
  const meta = readMeta();
  return meta && Array.isArray(meta.issues) ? meta.issues : [];
}

export function clearStorageIssues() {
  const meta = readMeta();
  if (!meta) return;
  meta.issues = [];
  writeMeta(meta);
  emitChange('meta');
}

// Moves an unreadable value aside so the app can keep working, without
// destroying the original text.
function quarantine(name, raw, reason) {
  const backupKey = `${STORAGE_PREFIX}:backup:${name}:${Date.now()}`;
  try {
    backend().setItem(backupKey, raw);
    backend().setItem(KEYS[name], '[]');
  } catch {
    // If we cannot back it up we leave it in place and simply read as empty.
    return;
  }
  recordIssue(`Stored "${name}" data was unreadable (${reason}). The original was backed up to "${backupKey}".`);
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

function assertCollection(name) {
  if (!COLLECTIONS.includes(name)) throw new StorageError(`Unknown collection "${name}"`);
}

export function readCollection(name) {
  assertCollection(name);
  let raw;
  try {
    raw = backend().getItem(KEYS[name]);
  } catch {
    return [];
  }
  if (raw == null || raw === '') return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    quarantine(name, raw, 'invalid JSON');
    return [];
  }
  if (!Array.isArray(parsed)) {
    quarantine(name, raw, 'expected a list');
    return [];
  }
  const valid = parsed.filter((r) => r && typeof r === 'object' && !Array.isArray(r) && typeof r.id === 'string' && r.id);
  if (valid.length !== parsed.length) {
    recordIssue(`${parsed.length - valid.length} malformed "${name}" record(s) were ignored.`);
  }
  return valid;
}

export function writeCollection(name, records) {
  assertCollection(name);
  if (!Array.isArray(records)) throw new StorageError(`Refusing to write non-list data to "${name}"`);
  try {
    backend().setItem(KEYS[name], JSON.stringify(records));
  } catch (err) {
    const quota = err && (err.name === 'QuotaExceededError' || err.code === 22);
    throw new StorageError(
      quota
        ? 'Browser storage is full. Remove old records or reset demo data, then try again.'
        : 'Could not save to browser storage. Check that site storage is enabled.'
    );
  }
  emitChange(name);
}

// Writes several collections then emits once per collection. Used when one
// action must update related records (e.g. maintenance + linked expense).
export function writeCollections(updates) {
  const names = Object.keys(updates);
  const previous = {};
  for (const name of names) {
    assertCollection(name);
    try {
      previous[name] = backend().getItem(KEYS[name]);
    } catch {
      previous[name] = null;
    }
  }
  try {
    for (const name of names) {
      backend().setItem(KEYS[name], JSON.stringify(updates[name]));
    }
  } catch (err) {
    // Best-effort rollback so related records do not end up half-written.
    for (const name of names) {
      try {
        if (previous[name] == null) backend().removeItem(KEYS[name]);
        else backend().setItem(KEYS[name], previous[name]);
      } catch {
        /* ignore */
      }
    }
    const quota = err && (err.name === 'QuotaExceededError' || err.code === 22);
    throw new StorageError(quota ? 'Browser storage is full. Nothing was saved.' : 'Could not save to browser storage. Nothing was saved.');
  }
  names.forEach(emitChange);
}

export function readAll() {
  const data = {};
  for (const name of COLLECTIONS) data[name] = readCollection(name);
  return data;
}

export function findById(name, id) {
  return readCollection(name).find((r) => r.id === id) || null;
}

// ---------------------------------------------------------------------------
// IDs and timestamps
// ---------------------------------------------------------------------------

function randomChars(length, alphabet) {
  const out = [];
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const bytes = new Uint32Array(length);
    cryptoObj.getRandomValues(bytes);
    for (let i = 0; i < length; i++) out.push(alphabet[bytes[i] % alphabet.length]);
  } else {
    for (let i = 0; i < length; i++) out.push(alphabet[Math.floor(Math.random() * alphabet.length)]);
  }
  return out.join('');
}

export function generateId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${randomChars(8, 'abcdefghijklmnopqrstuvwxyz0123456789')}`;
}

export function generateCode(length) {
  // No 0/O/1/I to keep references easy to read over the phone.
  return randomChars(length, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
}

export function nowISO() {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Schema + lifecycle
// ---------------------------------------------------------------------------

const MIGRATIONS = {
  // Example for future versions:
  // 2: () => { const trips = readCollection('trips'); ...; writeCollection('trips', trips); },
};

// Called once on the client after hydration. It never writes empty
// collections, so existing data is never overwritten on startup.
export function ensureSchema() {
  if (!isBrowser() && !backendOverride) return;
  const meta = readMeta();
  if (!meta) {
    writeMeta({ schemaVersion: SCHEMA_VERSION, createdAt: nowISO(), issues: [] });
    return;
  }
  const current = Number(meta.schemaVersion) || 1;
  if (current > SCHEMA_VERSION) {
    recordIssue(`Stored data uses a newer schema (v${current}) than this app (v${SCHEMA_VERSION}). Some features may not work.`);
    return;
  }
  for (let v = current + 1; v <= SCHEMA_VERSION; v++) {
    if (MIGRATIONS[v]) MIGRATIONS[v]();
  }
  if (current !== SCHEMA_VERSION) writeMeta({ ...meta, schemaVersion: SCHEMA_VERSION, migratedAt: nowISO() });
}

export function resetAllData() {
  const b = backend();
  const keys = [];
  for (let i = 0; i < b.length; i++) {
    const key = b.key(i);
    if (key && key.startsWith(`${STORAGE_PREFIX}:`)) keys.push(key);
  }
  keys.forEach((k) => b.removeItem(k));
  writeMeta({ schemaVersion: SCHEMA_VERSION, createdAt: nowISO(), issues: [] });
  COLLECTIONS.forEach(emitChange);
}

export function getStorageUsage() {
  const b = backend();
  let bytes = 0;
  for (let i = 0; i < b.length; i++) {
    const key = b.key(i);
    if (key && key.startsWith(`${STORAGE_PREFIX}:`)) bytes += (key.length + (b.getItem(key) || '').length) * 2;
  }
  return bytes;
}

// Subscribe to changes from this tab (custom event) and other tabs (storage
// event). Returns an unsubscribe function.
export function subscribe(listener) {
  if (!isBrowser()) return () => {};
  const onCustom = (e) => listener(e.detail?.collection ?? null);
  const onStorage = (e) => {
    if (e.key === null || (typeof e.key === 'string' && e.key.startsWith(`${STORAGE_PREFIX}:`))) listener(null);
  };
  window.addEventListener(CHANGE_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}
