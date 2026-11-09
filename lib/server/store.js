// Runs the app's synchronous business services against MongoDB.
//
// runWrite(fn) opens a transaction, takes the global write lock, loads the
// collections the service reads, runs `fn` synchronously with a storage
// backend bound to that snapshot, and then commits only the records that were
// added, changed or removed.
//
// Why a global write lock: services make decisions from what they read (seat
// availability, overlapping trips, duplicate salaries…). Every write
// transaction first increments one lock document, so two concurrent writes
// conflict and MongoDB retries the later one against fresh data. Writes are
// therefore serializable; reads never take the lock.
//
// Collections are loaded on demand: if a service reads a collection that has
// not been loaded yet, the run is aborted, the collection is loaded inside the
// same transaction and the service is run again. Nothing is written until the
// service has finished, so a rerun is side-effect free.

import './runtime.js';
import { setStorageBackend, getStorageBackend, nowISO } from '../storage.js';
import { COLLECTIONS } from '../storage-keys.js';
import { getDatabase, LOCK_COLLECTION } from './mongodb.js';

class NeedCollection extends Error {
  constructor(name) {
    super(`Collection "${name}" is not loaded`);
    this.collection = name;
  }
}

export class ConflictError extends Error {
  constructor(message = 'This change conflicts with another record. Refresh and try again.') {
    super(message);
    this.name = 'ConflictError';
  }
}

// Strips MongoDB's _id so services see exactly the records they always had.
export function fromDoc(doc) {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

export function toDoc(record) {
  return { _id: record.id, ...record };
}

const TRANSACTION_OPTIONS = {
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' },
  readPreference: 'primary',
};

// `scope` optionally limits what is loaded per collection: a MongoDB filter,
// or 'none' to load nothing (for collections the service only appends to).
// Records outside the scope are never changed or deleted by the commit.
export async function runWrite(fn, { scope = {} } = {}) {
  const { client, db } = await getDatabase();
  const session = client.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      // Take the write lock first, so concurrent writers conflict immediately.
      await db.collection(LOCK_COLLECTION).updateOne({ _id: 'writes' }, { $inc: { version: 1 } }, { session, upsert: true });

      const loaded = new Map(); // name -> { records, json: Map(id -> JSON) }
      const load = async (name) => {
        const filter = scope[name];
        const docs = filter === 'none' ? [] : await db.collection(name).find(filter || {}, { session }).toArray();
        const records = docs.map(fromDoc);
        loaded.set(name, { records, json: new Map(records.map((r) => [r.id, JSON.stringify(r)])) });
      };

      for (let attempt = 0; attempt <= COLLECTIONS.length; attempt++) {
        const pending = new Map();
        let missing = null;
        const previous = getStorageBackend();
        setStorageBackend({
          read(name) {
            if (pending.has(name)) return structuredClone(pending.get(name));
            if (!loaded.has(name)) throw new NeedCollection(name);
            return structuredClone(loaded.get(name).records);
          },
          write(updates) {
            for (const [name, records] of Object.entries(updates)) {
              if (!loaded.has(name)) throw new NeedCollection(name);
              pending.set(name, structuredClone(records));
            }
          },
        });
        try {
          result = fn();
        } catch (err) {
          if (!(err instanceof NeedCollection)) throw err;
          missing = err.collection;
        } finally {
          setStorageBackend(previous);
        }
        if (missing) {
          await load(missing);
          continue;
        }
        await commit(db, session, loaded, pending);
        return;
      }
      throw new Error('Could not load the data needed for this change.');
    }, TRANSACTION_OPTIONS);
  } catch (err) {
    if (err?.code === 11000) throw new ConflictError();
    throw err;
  } finally {
    await session.endSession();
  }
  return result;
}

function assertRecord(name, record, seen) {
  if (!record || typeof record !== 'object' || Array.isArray(record) || typeof record.id !== 'string' || !record.id) {
    throw new Error(`Refusing to save a malformed "${name}" record.`);
  }
  if (seen.has(record.id)) throw new Error(`Refusing to save duplicate "${name}" id ${record.id}.`);
  seen.add(record.id);
}

async function commit(db, session, loaded, pending) {
  const now = nowISO();
  for (const [name, records] of pending) {
    const original = loaded.get(name).json;
    const seen = new Set();
    const ops = [];
    for (const record of records) {
      assertRecord(name, record, seen);
      if (original.get(record.id) === JSON.stringify(record)) continue;
      const doc = toDoc({ ...record, createdAt: record.createdAt || now, updatedAt: now });
      ops.push({ replaceOne: { filter: { _id: record.id }, replacement: doc, upsert: true } });
    }
    for (const id of original.keys()) {
      if (!seen.has(id)) ops.push({ deleteOne: { filter: { _id: id } } });
    }
    if (ops.length) await db.collection(name).bulkWrite(ops, { session, ordered: true });
  }
}

// Plain reads (no lock, no transaction). `projection` follows MongoDB syntax.
export async function findRecords(name, filter = {}, { projection, sort } = {}) {
  const { db } = await getDatabase();
  const cursor = db.collection(name).find(filter, { projection, sort });
  return (await cursor.toArray()).map(fromDoc);
}
