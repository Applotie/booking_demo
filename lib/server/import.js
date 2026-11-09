// One-time import of records from the old localStorage version of the app.
//
// - Only inserts. A record whose id is already in MongoDB is left untouched and
//   reported as "already imported", so running the import again (e.g. after a
//   partial failure) never duplicates or overwrites anything.
// - Each record is checked by the collection validator and unique indexes;
//   records that fail are reported individually and the rest still import.
// - Seat holds are not imported: they expire after five minutes.

import { getDatabase } from './mongodb.js';
import { toDoc } from './store.js';
import { BadRequestError, requireObject } from './http.js';

export const IMPORTABLE = ['routes', 'buses', 'trips', 'schedules', 'bookings', 'expenses', 'maintenance', 'notifications'];
const ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;
const MAX_RECORDS = 20000;

function reasonFor(err) {
  if (err?.code === 11000) return 'Conflicts with an existing record (duplicate name, registration number or reference).';
  if (err?.code === 121) return 'Does not match the expected record format.';
  return 'Could not be saved.';
}

export async function importLegacyData(body) {
  const input = requireObject(requireObject(body).collections, 'collections');
  const unknown = Object.keys(input).filter((k) => !IMPORTABLE.includes(k));
  if (unknown.length) throw new BadRequestError('Unknown collection in import.');
  let total = 0;
  for (const name of IMPORTABLE) {
    if (input[name] != null && !Array.isArray(input[name])) throw new BadRequestError(`"${name}" must be a list.`);
    total += input[name]?.length || 0;
  }
  if (total > MAX_RECORDS) throw new BadRequestError('Too many records to import at once.', 413);

  const { db } = await getDatabase();
  const now = new Date().toISOString();
  const results = {};
  for (const name of IMPORTABLE) {
    const records = input[name] || [];
    const summary = { total: records.length, inserted: 0, existing: 0, failed: [] };
    results[name] = summary;
    const seen = new Set();
    const ops = [];
    const opIds = [];
    for (const record of records) {
      const id = record && typeof record === 'object' && !Array.isArray(record) ? record.id : null;
      if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
        summary.failed.push({ id: typeof id === 'string' ? id.slice(0, 120) : null, reason: 'Missing or invalid id.' });
        continue;
      }
      if (seen.has(id)) {
        summary.existing++;
        continue;
      }
      seen.add(id);
      const doc = toDoc({ ...record, createdAt: typeof record.createdAt === 'string' ? record.createdAt : now, updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : now });
      ops.push({ updateOne: { filter: { _id: id }, update: { $setOnInsert: doc }, upsert: true } });
      opIds.push(id);
    }
    if (!ops.length) continue;
    try {
      const res = await db.collection(name).bulkWrite(ops, { ordered: false });
      summary.inserted = res.upsertedCount;
      summary.existing += res.matchedCount;
    } catch (err) {
      const writeErrors = err?.writeErrors ? [].concat(err.writeErrors) : null;
      if (!writeErrors || !err.result) throw err;
      summary.inserted = err.result.upsertedCount ?? err.result.nUpserted ?? 0;
      summary.existing += err.result.matchedCount ?? err.result.nMatched ?? 0;
      for (const we of writeErrors) summary.failed.push({ id: opIds[we.index], reason: reasonFor(we) });
    }
  }
  const complete = Object.values(results).every((r) => r.failed.length === 0 && r.inserted + r.existing === r.total);
  return { ok: true, complete, results };
}
