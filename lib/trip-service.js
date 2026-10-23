// Trip scheduling. A trip snapshots the route details, bus details, fare and
// seat layout at creation, so later edits to the route or bus never change
// existing trips or their bookings. Daily trips (schedules) snapshot the same
// details and pass them on to each date when it is saved; see
// schedule-service.js.

import { readCollection, writeCollection, writeCollections, generateId, nowISO } from './storage.js';
import { parseLocalDateTime, toLocalDateTime, addMinutes, isLocalDateTime, isTimeOfDay, minutesOfDay, todayKey } from './dates.js';
import { cloneLayout, checkLayoutCompatibility, isValidLayout } from './seat-service.js';
import { validateAmount, toAmount, validateLocalDateTime, validateDateKey, isBlank, hasErrors, fail, cleanText } from './validators.js';
import { activeBookingsForTrip, cancelBookingsForTrip } from './booking-service.js';
import { findDailyConflict, findScheduleClash, scheduleArrivalTime } from './schedule-service.js';
import { formatDateTime, formatTimeOfDay } from './formatters.js';
import { SCHEDULE_STATUSES } from './constants.js';

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

function busyMessage(busName, trip) {
  return `${busName} is already scheduled from ${formatDateTime(trip.departureAt)} to ${formatDateTime(trip.arrivalAt)} (${trip.routeSnapshot.source} → ${trip.routeSnapshot.destination}).`;
}

function runsDailyMessage(busName, schedule) {
  return `${busName} already runs daily from ${formatTimeOfDay(schedule.departureTime)} to ${formatTimeOfDay(scheduleArrivalTime(schedule))} (${schedule.routeSnapshot.source} → ${schedule.routeSnapshot.destination}).`;
}

// Route and bus checks shared by one-off and daily trips. Adds to `errors`.
function pickRouteAndBus(input, { routes, buses }, existing, errors) {
  const route = routes.find((r) => r.id === input.routeId);
  const bus = buses.find((b) => b.id === input.busId);

  if (!route) errors.routeId = 'Select a route.';
  else if (!route.isActive && route.id !== existing?.routeId) errors.routeId = 'This route is inactive. Activate it first.';

  if (!bus) errors.busId = 'Select a bus.';
  else if (bus.operationalStatus !== 'Active' && bus.id !== existing?.busId) {
    errors.busId = `This bus is ${bus.operationalStatus.toLowerCase()} and cannot be scheduled.`;
  } else if (!isValidLayout(bus.seatLayout)) errors.busId = 'This bus has no valid seating layout. Edit the bus first.';

  return { route, bus };
}

function resolveInput(input, { routes, buses, trips, schedules }, { existing = null, now = Date.now() } = {}) {
  const errors = {};
  const { route, bus } = pickRouteAndBus(input, { routes, buses }, existing, errors);

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
    const span = { busId: bus.id, departureAt: input.departureAt, arrivalAt };
    const conflict = findScheduleConflict(trips, span, existing?.id);
    const daily = conflict ? null : findDailyConflict(schedules, trips, span);
    if (conflict) errors.departureAt = busyMessage(bus.name, conflict);
    else if (daily) errors.departureAt = runsDailyMessage(bus.name, daily.schedule);
  }

  return { errors, route, bus, arrivalAt, fare: toAmount(fareInput) };
}

function loadContext() {
  return { routes: readCollection('routes'), buses: readCollection('buses'), trips: readCollection('trips'), schedules: readCollection('schedules') };
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
  // A date of a daily trip keeps the daily trip's route, bus and times so that
  // its id (schedule + date) always matches its departure date.
  if (active.length || existing.scheduleId) {
    const changed =
      input.routeId !== existing.routeId ||
      input.busId !== existing.busId ||
      input.departureAt !== existing.departureAt ||
      (!isBlank(input.arrivalAt) && input.arrivalAt !== existing.arrivalAt);
    if (changed) {
      return fail(
        {},
        existing.scheduleId
          ? 'This is one date of a daily trip. Only its fare can be changed here. Edit the daily trip to change the route, bus or times.'
          : `This trip has ${active.length} active booking(s). Only the fare for new bookings can be changed. Cancel the trip (with its bookings) to reschedule.`
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

// ---------------------------------------------------------------------------
// Daily trips (schedules)
// ---------------------------------------------------------------------------

function resolveScheduleInput(input, ctx, { existing = null, now = Date.now() } = {}) {
  const errors = {};
  const { route, bus } = pickRouteAndBus(input, ctx, existing, errors);

  if (!isTimeOfDay(input.departureTime)) errors.departureTime = isBlank(input.departureTime) ? 'Departure time is required.' : 'Departure time is not valid.';

  // Arrival is a time of day; one at or before departure means the next day.
  let durationMinutes = route?.duration;
  if (!isBlank(input.arrivalTime)) {
    if (!isTimeOfDay(input.arrivalTime)) errors.arrivalTime = 'Arrival time is not valid.';
    else if (!errors.departureTime) durationMinutes = (minutesOfDay(input.arrivalTime) - minutesOfDay(input.departureTime) + 1440) % 1440;
  }
  if (!errors.departureTime && !errors.arrivalTime && durationMinutes !== undefined) {
    if (!(durationMinutes > 0)) errors.arrivalTime = 'Arrival time must be different from departure time.';
    else if (durationMinutes >= 1440) errors.arrivalTime = 'A daily trip must arrive within 24 hours.';
  }

  const dateErr = validateDateKey(input.startDate, { label: 'Start date' });
  if (dateErr) errors.startDate = dateErr;
  else if (input.startDate !== existing?.startDate && input.startDate < todayKey(new Date(now))) errors.startDate = 'Start date cannot be in the past.';

  const fareInput = isBlank(input.fare) && route ? String(route.defaultFare) : input.fare;
  const fareErr = validateAmount(fareInput, { allowZero: false, label: 'Fare' });
  if (fareErr) errors.fare = fareErr;

  // A paused daily trip is checked again when it is resumed.
  if (!hasErrors(errors) && (existing?.status ?? 'Active') === 'Active') {
    const candidate = { id: existing?.id, busId: bus.id, departureTime: input.departureTime, durationMinutes, startDate: input.startDate, status: 'Active' };
    const clash = findScheduleClash(candidate, ctx, { now });
    if (clash) errors.departureTime = clashMessage(bus.name, clash);
  }

  return { errors, route, bus, durationMinutes, fare: toAmount(fareInput) };
}

function clashMessage(busName, { schedule, trip }) {
  return schedule ? runsDailyMessage(busName, schedule) : busyMessage(busName, trip);
}

// Saved dates of a daily trip that never had a booking (only a seat hold) are
// dropped when the daily trip changes, so they are rebuilt from the new
// details. Dates with bookings, and cancelled or completed dates, are kept.
function dropUnbookedDates(trips, scheduleId) {
  const booked = new Set(readCollection('bookings').map((b) => b.tripId));
  return trips.filter((t) => !(t.scheduleId === scheduleId && t.status === 'Scheduled' && !booked.has(t.id)));
}

export function createSchedule(input, { now = Date.now() } = {}) {
  const ctx = loadContext();
  const { errors, route, bus, durationMinutes, fare } = resolveScheduleInput(input, ctx, { now });
  if (hasErrors(errors)) return fail(errors);
  const t = nowISO();
  const schedule = {
    id: generateId('sch'),
    routeId: route.id,
    busId: bus.id,
    departureTime: input.departureTime,
    durationMinutes,
    startDate: input.startDate,
    fare,
    routeSnapshot: routeSnapshotOf(route),
    busSnapshot: busSnapshotOf(bus),
    seatLayoutSnapshot: cloneLayout(bus.seatLayout),
    layoutSnapshotAt: t,
    status: 'Active',
    notes: cleanText(input.notes, 300),
    createdAt: t,
    updatedAt: t,
  };
  writeCollection('schedules', [...ctx.schedules, schedule]);
  return { ok: true, record: schedule };
}

// Changes apply to every date without bookings. Dates that already have
// bookings keep the details they were booked with.
export function updateSchedule(id, input, { now = Date.now() } = {}) {
  const ctx = loadContext();
  const existing = ctx.schedules.find((s) => s.id === id);
  if (!existing) return fail({}, 'Daily trip not found.');
  // Validate against the trips that will remain, so a hold-only date of this
  // daily trip does not block moving it.
  ctx.trips = dropUnbookedDates(ctx.trips, id);
  const { errors, route, bus, durationMinutes, fare } = resolveScheduleInput(input, ctx, { existing, now });
  if (hasErrors(errors)) return fail(errors);
  const t = nowISO();
  const updated = {
    ...existing,
    routeId: route.id,
    busId: bus.id,
    departureTime: input.departureTime,
    durationMinutes,
    startDate: input.startDate,
    fare,
    notes: cleanText(input.notes, 300),
    updatedAt: t,
  };
  if (route.id !== existing.routeId) updated.routeSnapshot = routeSnapshotOf(route);
  if (bus.id !== existing.busId) {
    updated.busSnapshot = busSnapshotOf(bus);
    updated.seatLayoutSnapshot = cloneLayout(bus.seatLayout);
    updated.layoutSnapshotAt = t;
  }
  writeCollections({ schedules: ctx.schedules.map((s) => (s.id === id ? updated : s)), trips: ctx.trips });
  return { ok: true, record: updated };
}

// Pausing stops new dates from being offered. Dates that are already saved
// (with bookings) still run; cancel them individually if needed.
export function setScheduleStatus(id, status, { now = Date.now() } = {}) {
  if (!SCHEDULE_STATUSES.includes(status)) return fail({}, 'Invalid status.');
  const ctx = loadContext();
  const existing = ctx.schedules.find((s) => s.id === id);
  if (!existing) return fail({}, 'Daily trip not found.');
  if (existing.status === status) return { ok: true, record: existing };
  if (status === 'Active') {
    const clash = findScheduleClash({ ...existing, status }, ctx, { now });
    if (clash) return fail({}, `Not resumed. ${clashMessage(existing.busSnapshot.name, clash)}`);
  }
  const updated = { ...existing, status, updatedAt: nowISO() };
  writeCollection('schedules', ctx.schedules.map((s) => (s.id === id ? updated : s)));
  return { ok: true, record: updated };
}

// Copies the bus's current layout onto the daily trip. Saved dates with
// bookings keep their own layout (use syncTripLayout on those).
export function syncScheduleLayout(id) {
  const schedules = readCollection('schedules');
  const schedule = schedules.find((s) => s.id === id);
  if (!schedule) return fail({}, 'Daily trip not found.');
  const bus = readCollection('buses').find((b) => b.id === schedule.busId);
  if (!bus || !isValidLayout(bus.seatLayout)) return fail({}, 'The bus no longer has a valid layout.');
  const t = nowISO();
  const updated = { ...schedule, seatLayoutSnapshot: cloneLayout(bus.seatLayout), busSnapshot: busSnapshotOf(bus), layoutSnapshotAt: t, updatedAt: t };
  writeCollections({ schedules: schedules.map((s) => (s.id === id ? updated : s)), trips: dropUnbookedDates(readCollection('trips'), id) });
  return { ok: true, record: updated };
}

export function deleteSchedule(id) {
  const schedules = readCollection('schedules');
  if (!schedules.some((s) => s.id === id)) return fail({}, 'Daily trip not found.');
  const trips = readCollection('trips');
  const dated = new Set(trips.filter((t) => t.scheduleId === id).map((t) => t.id));
  if (readCollection('bookings').some((b) => dated.has(b.tripId))) {
    return fail({}, 'This daily trip has booking history and cannot be deleted. Pause it instead.');
  }
  writeCollections({ schedules: schedules.filter((s) => s.id !== id), trips: trips.filter((t) => !dated.has(t.id)) });
  return { ok: true };
}
