// Booking rules: seat availability, temporary holds, booking creation,
// cancellation and payment status.
//
// IMPORTANT: localStorage has no atomic transactions. Every write here is a
// read-check-write within one synchronous call, which is safe inside a single
// tab and across tabs of the same browser in practice, but it is NOT a
// substitute for server-side transactional seat reservation when several
// devices book concurrently. See README "Known limitations".

import { readCollection, writeCollections, generateId, generateCode, nowISO } from './storage.js';
import { HOLD_DURATION_MS, MAX_SEATS_PER_BOOKING, PAYMENT_METHODS } from './constants.js';
import { parseLocalDateTime, dateKeyOf, timeOf } from './dates.js';
import { seatIdSet, blockedSet, sortSeatIds, sellableSeatCount } from './seat-service.js';
import { validatePersonName, validateInteger, validateIndianMobile, normalizeIndianMobile, cleanText, fail } from './validators.js';
import { prepareBookingConfirmation, prepareBookingCancellation } from './notifications/index.js';

const nowMs = (now) => (now instanceof Date ? now.getTime() : typeof now === 'number' ? now : Date.now());

// ---------------------------------------------------------------------------
// Trip bookability
// ---------------------------------------------------------------------------

export function isTripBookable(trip, now = Date.now()) {
  if (!trip || trip.status !== 'Scheduled') return false;
  const dep = parseLocalDateTime(trip.departureAt);
  return Boolean(dep) && dep.getTime() > nowMs(now);
}

export function tripUnavailableReason(trip, now = Date.now()) {
  if (!trip) return 'This trip does not exist.';
  if (trip.status === 'Cancelled') return 'This trip has been cancelled by the operator.';
  if (trip.status === 'Completed') return 'This trip has already been completed.';
  if (!isTripBookable(trip, now)) return 'This trip has already departed.';
  return null;
}

// ---------------------------------------------------------------------------
// Holds and availability
// ---------------------------------------------------------------------------

export function isHoldActive(hold, now = Date.now()) {
  return Boolean(hold) && hold.status === 'active' && new Date(hold.expiresAt).getTime() > nowMs(now);
}

export function activeBookingsForTrip(tripId, bookings) {
  return bookings.filter((b) => b.tripId === tripId && b.bookingStatus === 'Confirmed');
}

// Seat states for a trip. `holdToken` marks this visitor's own hold so their
// own seats are not shown as held by someone else.
export function getSeatAvailability(trip, { bookings, holds }, { now = Date.now(), holdToken = null } = {}) {
  const layout = trip?.seatLayoutSnapshot;
  const states = {};
  if (!layout) return { states, sellable: 0, booked: 0, held: 0, available: 0, ownHeld: [] };
  const blocked = blockedSet(layout);
  const bookedIds = new Set(activeBookingsForTrip(trip.id, bookings).flatMap((b) => b.seatIds));
  const heldIds = new Set();
  const ownHeld = [];
  for (const h of holds) {
    if (h.tripId !== trip.id || !isHoldActive(h, now)) continue;
    if (holdToken && h.holdToken === holdToken) ownHeld.push(...h.seatIds);
    else h.seatIds.forEach((id) => heldIds.add(id));
  }
  let booked = 0;
  let held = 0;
  let available = 0;
  for (const seat of layout.seats) {
    if (blocked.has(seat.id)) states[seat.id] = 'blocked';
    else if (bookedIds.has(seat.id)) {
      states[seat.id] = 'booked';
      booked++;
    } else if (heldIds.has(seat.id)) {
      states[seat.id] = 'held';
      held++;
    } else {
      states[seat.id] = 'available';
      available++;
    }
  }
  return { states, sellable: sellableSeatCount(layout), booked, held, available, ownHeld };
}

// Seats from `seatIds` that cannot be reserved right now, with reasons.
function findSeatConflicts(trip, seatIds, bookings, holds, { now, holdToken }) {
  const layout = trip.seatLayoutSnapshot;
  const ids = seatIdSet(layout);
  const blocked = blockedSet(layout);
  const { states } = getSeatAvailability(trip, { bookings, holds }, { now, holdToken });
  const conflicts = [];
  for (const id of seatIds) {
    if (!ids.has(id)) conflicts.push({ seatId: id, reason: 'does not exist on this bus' });
    else if (blocked.has(id)) conflicts.push({ seatId: id, reason: 'is not available for booking' });
    else if (states[id] === 'booked') conflicts.push({ seatId: id, reason: 'has just been booked by another passenger' });
    else if (states[id] === 'held') conflicts.push({ seatId: id, reason: 'is being booked by another passenger' });
  }
  return conflicts;
}

function conflictMessage(conflicts) {
  const seats = sortSeatIds(conflicts.map((c) => c.seatId));
  return seats.length === 1
    ? `Seat ${seats[0]} ${conflicts[0].reason}. Please choose another seat.`
    : `Seats ${seats.join(', ')} are no longer available. Please choose other seats.`;
}

// Expire stale holds and drop old ones so storage does not grow forever.
function tidyHolds(holds, now) {
  const t = nowMs(now);
  return holds
    .map((h) => (h.status === 'active' && new Date(h.expiresAt).getTime() <= t ? { ...h, status: 'expired' } : h))
    .filter((h) => h.status === 'active' || t - new Date(h.expiresAt).getTime() < 24 * 3600 * 1000);
}

export function createHold({ tripId, seatIds, replaceToken = null }, { now = Date.now() } = {}) {
  const trips = readCollection('trips');
  const trip = trips.find((t) => t.id === tripId);
  const reason = tripUnavailableReason(trip, now);
  if (reason) return { ...fail({}, reason), code: 'TRIP_UNAVAILABLE' };

  const unique = sortSeatIds([...new Set(seatIds || [])]);
  if (!unique.length) return { ...fail({}, 'Select at least one seat.'), code: 'NO_SEATS' };
  if (unique.length > MAX_SEATS_PER_BOOKING) {
    return { ...fail({}, `You can book up to ${MAX_SEATS_PER_BOOKING} seats at a time.`), code: 'TOO_MANY_SEATS' };
  }

  const bookings = readCollection('bookings');
  let holds = tidyHolds(readCollection('holds'), now);
  // Replacing your own hold (e.g. changing seats) releases it first.
  if (replaceToken) holds = holds.map((h) => (h.holdToken === replaceToken && h.status === 'active' ? { ...h, status: 'released' } : h));

  const conflicts = findSeatConflicts(trip, unique, bookings, holds, { now, holdToken: null });
  if (conflicts.length) {
    writeCollections({ holds });
    return { ...fail({}, conflictMessage(conflicts)), code: 'SEATS_UNAVAILABLE', conflicts };
  }

  const t = nowMs(now);
  const hold = {
    id: generateId('hld'),
    tripId,
    seatIds: unique,
    holdToken: `${generateId('tok')}${generateCode(6)}`,
    createdAt: new Date(t).toISOString(),
    expiresAt: new Date(t + HOLD_DURATION_MS).toISOString(),
    status: 'active',
  };
  writeCollections({ holds: [...holds, hold] });
  return { ok: true, hold };
}

export function getHoldByToken(token, holds = readCollection('holds')) {
  return holds.find((h) => h.holdToken === token) || null;
}

export function releaseHold(token) {
  if (!token) return;
  const holds = readCollection('holds');
  if (!holds.some((h) => h.holdToken === token && h.status === 'active')) return;
  writeCollections({ holds: holds.map((h) => (h.holdToken === token && h.status === 'active' ? { ...h, status: 'released' } : h)) });
}

// ---------------------------------------------------------------------------
// Booking creation
// ---------------------------------------------------------------------------

export function validateBookingDetails({ seatIds, passengers, contactNumber, contactName }) {
  const errors = {};
  const passengerErrors = {};
  const bySeat = new Map((passengers || []).map((p) => [p.seatId, p]));
  for (const seatId of seatIds) {
    const p = bySeat.get(seatId) || {};
    const e = {};
    const nameErr = validatePersonName(p.name, { label: 'Passenger name' });
    if (nameErr) e.name = nameErr;
    const ageErr = validateInteger(p.age, { min: 1, max: 120, label: 'Age' });
    if (ageErr) e.age = ageErr;
    if (Object.keys(e).length) passengerErrors[seatId] = e;
  }
  if (Object.keys(passengerErrors).length) errors.passengers = passengerErrors;
  const phoneErr = validateIndianMobile(contactNumber, { label: 'Contact number' });
  if (phoneErr) errors.contactNumber = phoneErr;
  if (contactName) {
    const nErr = validatePersonName(contactName, { label: 'Contact name' });
    if (nErr) errors.contactName = nErr;
  }
  return errors;
}

function uniqueReference(bookings) {
  const used = new Set(bookings.map((b) => b.bookingReference));
  for (let i = 0; i < 50; i++) {
    const ref = `BK${generateCode(6)}`;
    if (!used.has(ref)) return ref;
  }
  return `BK${generateCode(10)}`;
}

/**
 * Creates a confirmed, unpaid booking.
 * Idempotent per hold token: repeat calls with the same token return the
 * booking already created instead of creating a duplicate.
 */
export function createBooking(input, { now = Date.now() } = {}) {
  const { holdToken, tripId } = input;
  const bookings = readCollection('bookings');

  if (holdToken) {
    const existing = bookings.find((b) => b.holdToken === holdToken);
    if (existing) return { ok: true, booking: existing, duplicate: true };
  }

  const trips = readCollection('trips');
  const trip = trips.find((t) => t.id === tripId);
  const reason = tripUnavailableReason(trip, now);
  if (reason) return { ...fail({}, reason), code: 'TRIP_UNAVAILABLE' };

  const seatIds = sortSeatIds([...new Set(input.seatIds || [])]);
  if (!seatIds.length) return { ...fail({}, 'Select at least one seat.'), code: 'NO_SEATS' };
  if (seatIds.length > MAX_SEATS_PER_BOOKING) {
    return { ...fail({}, `You can book up to ${MAX_SEATS_PER_BOOKING} seats at a time.`), code: 'TOO_MANY_SEATS' };
  }

  const errors = validateBookingDetails({ ...input, seatIds });
  if (Object.keys(errors).length) return { ...fail(errors), code: 'INVALID' };

  // Final revalidation. Our own hold is excluded; expired holds never block.
  let holds = tidyHolds(readCollection('holds'), now);
  const ownHold = holdToken ? holds.find((h) => h.holdToken === holdToken) : null;
  const conflicts = findSeatConflicts(trip, seatIds, bookings, holds, { now, holdToken });
  if (conflicts.length) {
    return { ...fail({}, conflictMessage(conflicts)), code: 'SEATS_UNAVAILABLE', conflicts };
  }

  const contact = normalizeIndianMobile(input.contactNumber);
  const bySeat = new Map(input.passengers.map((p) => [p.seatId, p]));
  const passengers = seatIds.map((seatId) => {
    const p = bySeat.get(seatId);
    return {
      seatId,
      name: cleanText(p.name, 80),
      age: Number(p.age),
      gender: ['Male', 'Female', 'Other'].includes(p.gender) ? p.gender : '',
    };
  });
  const farePerSeat = Number(trip.fare);
  const timestamp = new Date(nowMs(now)).toISOString();
  const booking = {
    id: generateId('bkg'),
    bookingReference: uniqueReference(bookings),
    tripId: trip.id,
    routeId: trip.routeId,
    busId: trip.busId,
    routeSnapshot: { ...trip.routeSnapshot },
    busSnapshot: { ...trip.busSnapshot },
    travelDate: dateKeyOf(trip.departureAt),
    departureTime: timeOf(trip.departureAt),
    departureAt: trip.departureAt,
    arrivalAt: trip.arrivalAt,
    seatIds,
    passengers,
    contactName: cleanText(input.contactName, 80),
    contactNumber: contact.national,
    farePerSeat,
    totalFare: Math.round(farePerSeat * seatIds.length * 100) / 100,
    bookingStatus: 'Confirmed',
    paymentStatus: 'Unpaid',
    paymentMethod: '',
    paidAt: null,
    holdToken: holdToken || null,
    notificationStatus: 'pending',
    notificationId: null,
    cancelledAt: null,
    cancellationReason: '',
    cancelledBy: '',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const notification = prepareBookingConfirmation(booking);
  booking.notificationStatus = notification.status;
  booking.notificationId = notification.id;

  if (ownHold) {
    holds = holds.map((h) => (h.holdToken === holdToken ? { ...h, status: 'converted', bookingId: booking.id } : h));
  }
  writeCollections({
    bookings: [...bookings, booking],
    holds,
    notifications: [...readCollection('notifications'), notification],
  });
  return { ok: true, booking, notification };
}

export function findBooking(idOrReference, bookings = readCollection('bookings')) {
  if (!idOrReference) return null;
  const key = String(idOrReference).trim();
  const upper = key.toUpperCase();
  return bookings.find((b) => b.id === key || b.bookingReference === upper) || null;
}

// ---------------------------------------------------------------------------
// Cancellation and payment
// ---------------------------------------------------------------------------

function cancelledCopy(booking, { reason, by }) {
  const t = nowISO();
  return {
    ...booking,
    bookingStatus: 'Cancelled',
    cancelledAt: t,
    cancellationReason: cleanText(reason, 200),
    cancelledBy: by,
    updatedAt: t,
  };
}

// Cancelling keeps the record (history) and frees its seats, because seat
// availability only counts Confirmed bookings.
export function cancelBooking(id, { reason = '', by = 'operator' } = {}) {
  const bookings = readCollection('bookings');
  const existing = bookings.find((b) => b.id === id);
  if (!existing) return fail({}, 'Booking not found.');
  if (existing.bookingStatus === 'Cancelled') return fail({}, 'This booking is already cancelled.');
  const updated = cancelledCopy(existing, { reason, by });
  const notification = prepareBookingCancellation(updated);
  writeCollections({
    bookings: bookings.map((b) => (b.id === id ? updated : b)),
    notifications: [...readCollection('notifications'), notification],
  });
  return { ok: true, record: updated, notification };
}

export function cancelBookingsForTrip(tripId, { reason, by = 'operator' }) {
  const bookings = readCollection('bookings');
  const notifications = readCollection('notifications');
  const created = [];
  const next = bookings.map((b) => {
    if (b.tripId !== tripId || b.bookingStatus !== 'Confirmed') return b;
    const updated = cancelledCopy(b, { reason, by });
    created.push(prepareBookingCancellation(updated));
    return updated;
  });
  return { bookings: next, notifications: [...notifications, ...created], count: created.length };
}

export function setBookingPayment(id, paymentStatus, { method = '' } = {}) {
  if (!['Paid', 'Unpaid'].includes(paymentStatus)) return fail({}, 'Invalid payment status.');
  const bookings = readCollection('bookings');
  const existing = bookings.find((b) => b.id === id);
  if (!existing) return fail({}, 'Booking not found.');
  if (existing.bookingStatus === 'Cancelled' && paymentStatus === 'Paid') {
    return fail({}, 'A cancelled booking cannot be marked as paid.');
  }
  const t = nowISO();
  // Payment status never changes bookingStatus.
  const updated = {
    ...existing,
    paymentStatus,
    paymentMethod: paymentStatus === 'Paid' ? (PAYMENT_METHODS.includes(method) ? method : 'Cash') : '',
    paidAt: paymentStatus === 'Paid' ? t : null,
    updatedAt: t,
  };
  writeCollections({ bookings: bookings.map((b) => (b.id === id ? updated : b)) });
  return { ok: true, record: updated };
}
