// Central persistence interface used by the business services.
//
// The services are synchronous and collection-based: they read whole
// collections, decide, and write the changed collections back. On the server
// every API request runs those services inside a MongoDB "unit of work"
// (lib/server/store.js) that loads the collections it needs inside a
// transaction, captures the writes, and commits only the records that
// changed. MongoDB Atlas is the only source of truth; nothing here touches
// browser storage.
//
// Unit tests can install an in-memory backend with setStorageBackend().

import { COLLECTIONS } from './storage-keys.js';

export class StorageError extends Error {}

let activeBackend = null;

// Installs the backend used by readCollection/writeCollections. The server
// installs a per-request unit of work for the duration of one synchronous
// service call; tests install an in-memory backend.
export function setStorageBackend(backend) {
  activeBackend = backend;
}

export function getStorageBackend() {
  return activeBackend;
}

function backend() {
  if (!activeBackend) {
    throw new StorageError('Data can only be read or changed on the server.');
  }
  return activeBackend;
}

function assertCollection(name) {
  if (!COLLECTIONS.includes(name)) throw new StorageError(`Unknown collection "${name}"`);
}

export function readCollection(name) {
  assertCollection(name);
  return backend().read(name);
}

export function writeCollection(name, records) {
  writeCollections({ [name]: records });
}

// Writes several collections as one change. On the server they are committed
// in a single MongoDB transaction, so related records never end up
// half-written.
export function writeCollections(updates) {
  for (const [name, records] of Object.entries(updates)) {
    assertCollection(name);
    if (!Array.isArray(records)) throw new StorageError(`Refusing to write non-list data to "${name}"`);
  }
  backend().write(updates);
}

export function readAll() {
  const data = {};
  for (const name of COLLECTIONS) data[name] = readCollection(name);
  return data;
}

export function findById(name, id) {
  return readCollection(name).find((r) => r.id === id) || null;
}

// Simple in-memory backend for unit tests and scripts.
export function createInMemoryBackend(initial = {}) {
  const store = new Map(COLLECTIONS.map((c) => [c, structuredClone(initial[c] || [])]));
  return {
    read: (name) => structuredClone(store.get(name)),
    write: (updates) => {
      for (const [name, records] of Object.entries(updates)) store.set(name, structuredClone(records));
    },
    dump: () => Object.fromEntries([...store].map(([k, v]) => [k, structuredClone(v)])),
  };
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
