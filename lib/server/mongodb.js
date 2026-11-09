// Server-only MongoDB Atlas connection. Never import this from client code.
//
// One MongoClient (with its own connection pool) is cached per server process
// on globalThis, so hot reloads in development and warm serverless
// invocations reuse it instead of opening new connections. A failed connection
// attempt is not cached, so the next request tries again.

import { MongoClient } from 'mongodb';
import { COLLECTIONS } from '../storage-keys.js';
import { COLLECTION_SCHEMAS, COLLECTION_INDEXES } from './schemas.js';

export const LOCK_COLLECTION = 'locks';
export const META_COLLECTION = 'meta';
const DEFAULT_DB_NAME = 'bus-booking';

export class DatabaseUnavailableError extends Error {
  constructor(message = 'The database is temporarily unavailable.', options) {
    super(message, options);
    this.name = 'DatabaseUnavailableError';
  }
}

const cache = globalThis.__busopsMongo || (globalThis.__busopsMongo = { client: null, clientPromise: null, initPromise: null });

function connectionString() {
  // MONGO_URI is the variable used by this project; MONGODB_URI is accepted as
  // the conventional alternative.
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    throw new DatabaseUnavailableError('MONGO_URI is not set. Add the MongoDB Atlas connection string to the server environment.');
  }
  return uri;
}

export function databaseName() {
  return process.env.MONGODB_DB || DEFAULT_DB_NAME;
}

async function getClient() {
  if (cache.client) return cache.client;
  if (!cache.clientPromise) {
    const client = new MongoClient(connectionString(), {
      appName: 'bus-booking',
      maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE) || 10,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    cache.clientPromise = client
      .connect()
      .then((connected) => {
        cache.client = connected;
        // If the driver closes the client (e.g. in tests), connect afresh next time.
        connected.on('close', () => {
          if (cache.client === connected) {
            cache.client = null;
            cache.clientPromise = null;
            cache.initPromise = null;
          }
        });
        return connected;
      })
      .catch((err) => {
        cache.clientPromise = null;
        throw new DatabaseUnavailableError(undefined, { cause: err });
      });
  }
  return cache.clientPromise;
}

// Creates collections, validators and indexes. Safe to run any number of
// times: existing collections only get their validator refreshed and
// createIndexes is a no-op for indexes that already exist.
async function initialize(db) {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const name of COLLECTIONS) {
    const validator = { $jsonSchema: COLLECTION_SCHEMAS[name] };
    const options = { validator, validationLevel: 'moderate', validationAction: 'error' };
    if (existing.has(name)) {
      await db.command({ collMod: name, ...options });
    } else {
      try {
        await db.createCollection(name, options);
      } catch (err) {
        // Another instance created it at the same moment.
        if (err?.codeName !== 'NamespaceExists') throw err;
        await db.command({ collMod: name, ...options });
      }
    }
    const indexes = COLLECTION_INDEXES[name] || [];
    if (indexes.length) await db.collection(name).createIndexes(indexes);
  }
  // The single write-lock document that serializes write transactions (see store.js).
  await db.collection(LOCK_COLLECTION).updateOne({ _id: 'writes' }, { $setOnInsert: { version: 0 } }, { upsert: true });
  await db
    .collection(META_COLLECTION)
    .updateOne({ _id: 'schema' }, { $set: { schemaVersion: 1, initializedAt: new Date() } }, { upsert: true });
}

// Returns the connected client and database, initializing the database once
// per process.
export async function getDatabase() {
  let client;
  try {
    client = await getClient();
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) throw err;
    throw new DatabaseUnavailableError(undefined, { cause: err });
  }
  const db = client.db(databaseName());
  if (!cache.initPromise) {
    cache.initPromise = initialize(db).catch((err) => {
      cache.initPromise = null;
      throw err;
    });
  }
  await cache.initPromise;
  return { client, db };
}

export async function closeDatabase() {
  const client = cache.client;
  cache.client = null;
  cache.clientPromise = null;
  cache.initPromise = null;
  if (client) await client.close();
}
