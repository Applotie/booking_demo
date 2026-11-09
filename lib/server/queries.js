// Read models for the pages. Reads never take the write lock.

import './runtime.js';
import { getDatabase } from './mongodb.js';
import { fromDoc } from './store.js';
import { COLLECTIONS } from '../storage-keys.js';
import { todayKey, addDaysToKey } from '../dates.js';
import { parseOccurrenceId } from '../schedule-service.js';

const HOLD_HISTORY_MS = 24 * 3600 * 1000;

async function find(db, name, filter, projection) {
  return (await db.collection(name).find(filter, { projection }).toArray()).map(fromDoc);
}

// Everything the operator's dashboard, lists and reports work with. Hold
// tokens are left out: they are only meaningful to the passenger who owns them.
export async function adminData() {
  const { db } = await getDatabase();
  const recentHolds = { expiresAt: { $gt: new Date(Date.now() - HOLD_HISTORY_MS).toISOString() } };
  const [routes, buses, trips, schedules, bookings, holds, expenses, maintenance, notifications] = await Promise.all([
    find(db, 'routes', {}),
    find(db, 'buses', {}),
    find(db, 'trips', {}),
    find(db, 'schedules', {}),
    find(db, 'bookings', {}, { holdToken: 0 }),
    find(db, 'holds', recentHolds, { holdToken: 0 }),
    find(db, 'expenses', {}),
    find(db, 'maintenance', {}),
    find(db, 'notifications', {}),
  ]);
  let storageBytes = null;
  try {
    storageBytes = (await db.stats()).dataSize ?? null;
  } catch {
    /* stats are informational only */
  }
  return { data: { routes, buses, trips, schedules, bookings, holds, expenses, maintenance, notifications }, storageBytes };
}

const empty = () => Object.fromEntries(COLLECTIONS.map((c) => [c, []]));

// What passengers need to search and book: upcoming trips, active repeating
// trips, and which seats are taken. Other passengers' names, phone numbers,
// booking ids and hold tokens are never included.
//
// `holdTokens` are the caller's own seat holds (from their browser tab); those
// holds, and bookings made from them, are returned in full so the booking
// pages can recognise them.
export async function publicData({ tripId = null, holdTokens = [] } = {}) {
  const { db } = await getDatabase();
  const data = empty();
  const now = new Date();
  const from = addDaysToKey(todayKey(now), -1);
  const hidden = { notes: 0 };

  const tripFilter = tripId ? { _id: tripId } : { departureAt: { $gte: from } };
  const occ = tripId ? parseOccurrenceId(tripId) : null;
  const [trips, schedules] = await Promise.all([find(db, 'trips', tripFilter, hidden), find(db, 'schedules', { status: 'Active' }, hidden)]);
  data.trips = trips;
  data.schedules = occ || !tripId ? schedules : schedules.filter((s) => trips.some((t) => t.scheduleId === s.id));

  const tripIds = trips.map((t) => t.id);
  const own = new Set(holdTokens);
  const holdQueries = [
    ...(tripIds.length ? [{ tripId: { $in: tripIds }, status: 'active', expiresAt: { $gt: now.toISOString() } }] : []),
    ...(holdTokens.length ? [{ holdToken: { $in: holdTokens } }] : []),
  ];
  const [bookings, holds] = await Promise.all([
    tripIds.length
      ? find(db, 'bookings', { tripId: { $in: tripIds }, bookingStatus: 'Confirmed' }, { tripId: 1, seatIds: 1, bookingStatus: 1, holdToken: 1 })
      : [],
    holdQueries.length ? find(db, 'holds', { $or: holdQueries }, { tripId: 1, seatIds: 1, status: 1, expiresAt: 1, holdToken: 1, bookingId: 1 }) : [],
  ]);
  data.bookings = bookings.map((b) =>
    own.has(b.holdToken) ? b : { tripId: b.tripId, seatIds: b.seatIds, bookingStatus: b.bookingStatus, holdToken: null }
  );
  data.holds = holds.map((h) => (own.has(h.holdToken) ? h : { tripId: h.tripId, seatIds: h.seatIds, status: h.status, expiresAt: h.expiresAt, holdToken: null }));
  return data;
}

// One booking (by its id or booking reference) and its WhatsApp messages, for
// the passenger's confirmation page.
export async function publicBooking(idOrReference) {
  const { db } = await getDatabase();
  const data = empty();
  const key = String(idOrReference).trim();
  const booking = await db.collection('bookings').findOne({ $or: [{ _id: key }, { bookingReference: key.toUpperCase() }] }, { projection: { holdToken: 0 } });
  if (!booking) return data;
  data.bookings = [fromDoc(booking)];
  data.notifications = await find(db, 'notifications', { bookingId: booking._id });
  return data;
}
