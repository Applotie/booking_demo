// Trip scheduling. A trip snapshots the route details, bus details, fare and
// seat layout at creation, so later edits to the route or bus never change
// existing trips or their bookings.

import { readCollection, writeCollection, writeCollections, generateId, nowISO } from './storage.js';
import { parseLocalDateTime, toLocalDateTime, addMinutes, isLocalDateTime } from './dates.js';
import { cloneLayout, checkLayoutCompatibility, isValidLayout } from './seat-service.js';
import { validateAmount, toAmount, validateLocalDateTime, isBlank, hasErrors, fail, cleanText } from './validators.js';
import { activeBookingsForTrip, cancelBookingsForTrip } from './booking-service.js';
import { formatDateTime } from './formatters.js';

export function routeSnapshotOf(route) {
  return { id: route.id, name: route.name, source: route.source, destination: route.destination, stops: [...(route.stops || [])], duration: route.duration };
}

export function busSnapshotOf(bus) {
  return { id: bus.id, name: bus.name, registrationNumber: bus.registrationNumber, type: bus.type };
}

export function findScheduleConflict(trips, { busId, departureAt, arrivalAt }, excludeId = null) {
  const start = parseLocalDateTime(departureAt)?.getTime();
  const end = parseLocalDateTime(arrivalAt)?.getTime();
  if (!start || !end) return null;
  return (
    trips.find((t) => {
      if (t.id === excludeId || t.busId !== busId || t.status === 'Cancelled') return false;
      const s = parseLocalDateTime(t.departureAt)?.getTime();
      const e = parseLocalDateTime(t.arrivalAt)?.getTime();
      return s < end && start < e;
    }) || null
  );
}

function resolveInput(input, { routes, buses, trips }, { existing = null, now = Date.now() } = {}) {
  const errors = {};
  const route = routes.find((r) => r.id === input.routeId);
  const bus = buses.find((b) => b.id === input.busId);

  if (!route) errors.routeId = 'Select a route.';
  else if (!route.isActive && route.id !== existing?.routeId) errors.routeId = 'This route is inactive. Activate it first.';

  if (!bus) errors.busId = 'Select a bus.';
  else if (bus.operationalStatus !== 'Active' && bus.id !== existing?.busId) {
    errors.busId = `This bus is ${bus.operationalStatus.toLowerCase()} and cannot be scheduled.`;
  } else if (!isValidLayout(bus.seatLayout)) errors.busId = 'This bus has no valid seating layout. Edit the bus first.';

  const depErr = validateLocalDateTime(input.departureAt, { label: 'Departure' });
  if (depErr) errors.departureAt = depErr;
  else if (parseLocalDateTime(input.departureAt).getTime() <= now) errors.departureAt = 'Departure must be in the future.';

  let arrivalAt = input.arrivalAt;
  if (isBlank(arrivalAt) && !depErr && route) {
    arrivalAt = toLocalDateTime(addMinutes(parseLocalDateTime(input.departureAt), route.duration));
  }
  if (!errors.departureAt) {
    const arrErr = validateLocalDateTime(arrivalAt, { label: 'Arrival' });
    if (arrErr) errors.arrivalAt = arrErr;
    else if (parseLocalDateTime(arrivalAt) <= parseLocalDateTime(input.departureAt)) errors.arrivalAt = 'Arrival must be after departure.';
  }

  const fareInput = isBlank(input.fare) && route ? String(route.defaultFare) : input.fare;
  const fareErr = validateAmount(fareInput, { allowZero: false, label: 'Fare' });
  if (fareErr) errors.fare = fareErr;

  if (!hasErrors(errors)) {
    const conflict = findScheduleConflict(trips, { busId: bus.id, departureAt: input.departureAt, arrivalAt }, existing?.id);
    if (conflict) {
      errors.departureAt = `${bus.name} is already scheduled from ${formatDateTime(conflict.departureAt)} to ${formatDateTime(conflict.arrivalAt)} (${conflict.routeSnapshot.source} → ${conflict.routeSnapshot.destination}).`;
    }
  }

  return { errors, route, bus, arrivalAt, fare: toAmount(fareInput) };
}

function loadContext() {
  return { routes: readCollection('routes'), buses: readCollection('buses'), trips: readCollection('trips') };
}

export function createTrip(input, { now = Date.now() } = {}) {
  const ctx = loadContext();
  const { errors, route, bus, arrivalAt, fare } = resolveInput(input, ctx, { now });
  if (hasErrors(errors)) return fail(errors);
  const t = nowISO();
  const trip = {
    id: generateId('trp'),
    routeId: route.id,
    busId: bus.id,
    departureAt: input.departureAt,
    arrivalAt,
    fare,
    routeSnapshot: routeSnapshotOf(route),
    busSnapshot: busSnapshotOf(bus),
    seatLayoutSnapshot: cloneLayout(bus.seatLayout),
    layoutSnapshotAt: t,
    status: 'Scheduled',
    notes: cleanText(input.notes, 300),
    cancellationReason: '',
    completedAt: null,
    cancelledAt: null,
    createdAt: t,
    updatedAt: t,
  };
  writeCollection('trips', [...ctx.trips, trip]);
  return { ok: true, record: trip };
}

export function updateTrip(id, input, { now = Date.now() } = {}) {
  const ctx = loadContext();
  const existing = ctx.trips.find((t) => t.id === id);
  if (!existing) return fail({}, 'Trip not found.');
  if (existing.status !== 'Scheduled') return fail({}, `A ${existing.status.toLowerCase()} trip cannot be edited.`);

  const active = activeBookingsForTrip(id, readCollection('bookings'));
  if (active.length) {
    const changed =
      input.routeId !== existing.routeId ||
      input.busId !== existing.busId ||
      input.departureAt !== existing.departureAt ||
      (!isBlank(input.arrivalAt) && input.arrivalAt !== existing.arrivalAt);
    if (changed) {
      return fail(
        {},
        `This trip has ${active.length} active booking(s). Only the fare for new bookings can be changed. Cancel the trip (with its bookings) to reschedule.`
      );
    }
    const fareErr = validateAmount(input.fare, { allowZero: false, label: 'Fare' });
    if (fareErr) return fail({ fare: fareErr });
    // Existing bookings keep their own farePerSeat snapshot.
    const updated = { ...existing, fare: toAmount(input.fare), notes: cleanText(input.notes, 300), updatedAt: nowISO() };
    writeCollection('trips', ctx.trips.map((t) => (t.id === id ? updated : t)));
    return { ok: true, record: updated };
  }

  const { errors, route, bus, arrivalAt, fare } = resolveInput(input, ctx, { existing, now });
  if (hasErrors(errors)) return fail(errors);
  const updated = {
    ...existing,
    routeId: route.id,
    busId: bus.id,
    departureAt: input.departureAt,
    arrivalAt,
    fare,
    notes: cleanText(input.notes, 300),
    updatedAt: nowISO(),
  };
  if (route.id !== existing.routeId) updated.routeSnapshot = routeSnapshotOf(route);
  if (bus.id !== existing.busId) {
    updated.busSnapshot = busSnapshotOf(bus);
    updated.seatLayoutSnapshot = cloneLayout(bus.seatLayout);
    updated.layoutSnapshotAt = nowISO();
  }
  writeCollection('trips', ctx.trips.map((t) => (t.id === id ? updated : t)));
  return { ok: true, record: updated };
}

// Explicitly copies the bus's current layout onto a trip. Refused if any
// booked seat would be moved, removed or blocked.
export function syncTripLayout(id) {
  const trips = readCollection('trips');
  const trip = trips.find((t) => t.id === id);
  if (!trip) return fail({}, 'Trip not found.');
  if (trip.status !== 'Scheduled') return fail({}, 'Only scheduled trips can be updated.');
  const bus = readCollection('buses').find((b) => b.id === trip.busId);
  if (!bus || !isValidLayout(bus.seatLayout)) return fail({}, 'The bus no longer has a valid layout.');
  const booked = activeBookingsForTrip(id, readCollection('bookings')).flatMap((b) => b.seatIds);
  const check = checkLayoutCompatibility(trip.seatLayoutSnapshot, bus.seatLayout, booked);
  if (!check.ok) return fail({}, `Layout not updated. ${check.reason}`);
  const updated = { ...trip, seatLayoutSnapshot: cloneLayout(bus.seatLayout), busSnapshot: busSnapshotOf(bus), layoutSnapshotAt: nowISO(), updatedAt: nowISO() };
  writeCollection('trips', trips.map((t) => (t.id === id ? updated : t)));
  return { ok: true, record: updated };
}

export function isLayoutOutOfDate(trip, bus) {
  if (!trip || !bus?.seatLayout) return false;
  return JSON.stringify(trip.seatLayoutSnapshot) !== JSON.stringify(bus.seatLayout);
}

export function setTripStatus(id, status) {
  const trips = readCollection('trips');
  const trip = trips.find((t) => t.id === id);
  if (!trip) return fail({}, 'Trip not found.');
  if (status === 'Completed') {
    if (trip.status !== 'Scheduled') return fail({}, 'Only scheduled trips can be marked completed.');
  } else if (status === 'Scheduled') {
    if (trip.status !== 'Completed') return fail({}, 'Only completed trips can be reopened.');
  } else {
    return fail({}, 'Use cancelTrip to cancel a trip.');
  }
  const t = nowISO();
  const updated = { ...trip, status, completedAt: status === 'Completed' ? t : null, updatedAt: t };
  writeCollection('trips', trips.map((x) => (x.id === id ? updated : x)));
  return { ok: true, record: updated };
}

// Cancelling a trip with active bookings requires `cancelBookings: true`,
// which cancels every booking (keeping history) and records a cancellation
// notification for each passenger.
export function cancelTrip(id, { reason = '', cancelBookings = false } = {}) {
  const trips = readCollection('trips');
  const trip = trips.find((t) => t.id === id);
  if (!trip) return fail({}, 'Trip not found.');
  if (trip.status === 'Cancelled') return fail({}, 'This trip is already cancelled.');
  if (trip.status === 'Completed') return fail({}, 'A completed trip cannot be cancelled.');
  const active = activeBookingsForTrip(id, readCollection('bookings'));
  if (active.length && !cancelBookings) {
    return { ...fail({}, `This trip has ${active.length} active booking(s). Confirm that they should be cancelled too.`), code: 'HAS_BOOKINGS', activeCount: active.length };
  }
  const t = nowISO();
  const cleanReason = cleanText(reason, 200) || 'Trip cancelled by operator';
  const updatedTrip = { ...trip, status: 'Cancelled', cancellationReason: cleanReason, cancelledAt: t, updatedAt: t };
  const updates = { trips: trips.map((x) => (x.id === id ? updatedTrip : x)) };
  let cancelled = 0;
  if (active.length) {
    const result = cancelBookingsForTrip(id, { reason: cleanReason, by: 'operator' });
    updates.bookings = result.bookings;
    updates.notifications = result.notifications;
    cancelled = result.count;
  }
  writeCollections(updates);
  return { ok: true, record: updatedTrip, cancelledBookings: cancelled };
}

export function deleteTrip(id) {
  const trips = readCollection('trips');
  if (!trips.some((t) => t.id === id)) return fail({}, 'Trip not found.');
  const any = readCollection('bookings').some((b) => b.tripId === id);
  if (any) return fail({}, 'This trip has booking history and cannot be deleted. Cancel it instead.');
  writeCollection('trips', trips.filter((t) => t.id !== id));
  return { ok: true };
}

export function tripDurationMinutes(trip) {
  if (!isLocalDateTime(trip?.departureAt) || !isLocalDateTime(trip?.arrivalAt)) return null;
  return Math.round((parseLocalDateTime(trip.arrivalAt) - parseLocalDateTime(trip.departureAt)) / 60000);
}
