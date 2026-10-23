// Trip scheduling. A trip snapshots the route details, bus details, fare and
// seat layout at creation, so later edits to the route or bus never change
// existing trips or their bookings. Repeating trips (schedules) snapshot the
// same details and pass them on to each date when it is saved; see
// schedule-service.js.

import { readCollection, writeCollection, writeCollections, generateId, nowISO } from './storage.js';
import { parseLocalDateTime, toLocalDateTime, addMinutes, isDateKey, isLocalDateTime, isTimeOfDay, minutesOfDay, todayKey } from './dates.js';
import { cloneLayout, checkLayoutCompatibility, isValidLayout } from './seat-service.js';
import { validateAmount, toAmount, validateLocalDateTime, validateDateKey, isBlank, hasErrors, fail, cleanText } from './validators.js';
import { activeBookingsForTrip, cancelBookingsForTrip } from './booking-service.js';
import { findDailyConflict, findScheduleClash, scheduleArrivalTime, scheduleWeekdays, runsEveryDay, ALL_WEEKDAYS } from './schedule-service.js';
import { formatDateTime, formatTimeOfDay, formatWeekdays, formatDateLong } from './formatters.js';
import { SCHEDULE_STATUSES, MAX_TRIP_DATES } from './constants.js';

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

function repeatsMessage(busName, schedule) {
  const days = runsEveryDay(schedule) ? 'daily' : `every ${formatWeekdays(scheduleWeekdays(schedule))}`;
  return `${busName} already runs ${days} from ${formatTimeOfDay(schedule.departureTime)} to ${formatTimeOfDay(scheduleArrivalTime(schedule))} (${schedule.routeSnapshot.source} → ${schedule.routeSnapshot.destination}).`;
}

// Route and bus checks shared by one-off and repeating trips. Adds to `errors`.
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
    else if (daily) errors.departureAt = repeatsMessage(bus.name, daily.schedule);
  }

  return { errors, route, bus, arrivalAt, fare: toAmount(fareInput) };
}

function loadContext() {
  return { routes: readCollection('routes'), buses: readCollection('buses'), trips: readCollection('trips'), schedules: readCollection('schedules') };
}

function buildTrip({ route, bus, departureAt, arrivalAt, fare, notes }) {
  const t = nowISO();
  return {
    id: generateId('trp'),
    routeId: route.id,
    busId: bus.id,
    departureAt,
    arrivalAt,
    fare,
    routeSnapshot: routeSnapshotOf(route),
    busSnapshot: busSnapshotOf(bus),
    seatLayoutSnapshot: cloneLayout(bus.seatLayout),
    layoutSnapshotAt: t,
    status: 'Scheduled',
    notes: cleanText(notes, 300),
    cancellationReason: '',
    completedAt: null,
    cancelledAt: null,
    createdAt: t,
    updatedAt: t,
  };
}

export function createTrip(input, { now = Date.now() } = {}) {
  const ctx = loadContext();
  const { errors, route, bus, arrivalAt, fare } = resolveInput(input, ctx, { now });
  if (hasErrors(errors)) return fail(errors);
  const trip = buildTrip({ route, bus, departureAt: input.departureAt, arrivalAt, fare, notes: input.notes });
  writeCollection('trips', [...ctx.trips, trip]);
  return { ok: true, record: trip };
}

// Journey length from "HH:mm" departure and arrival times; an arrival at or
// before departure is the next day. Blank arrival falls back to the route
// duration. Adds to `errors`.
function journeyMinutes(input, route, errors) {
  if (!isTimeOfDay(input.departureTime)) errors.departureTime = isBlank(input.departureTime) ? 'Departure time is required.' : 'Departure time is not valid.';
  let minutes = route?.duration;
  if (!isBlank(input.arrivalTime)) {
    if (!isTimeOfDay(input.arrivalTime)) errors.arrivalTime = 'Arrival time is not valid.';
    else if (!errors.departureTime) minutes = (minutesOfDay(input.arrivalTime) - minutesOfDay(input.departureTime) + 1440) % 1440;
  }
  if (!errors.departureTime && !errors.arrivalTime && minutes !== undefined && !(minutes > 0)) {
    errors.arrivalTime = 'Arrival time must be different from departure time.';
  }
  return minutes;
}

// Specific dates: one ordinary trip per date in `input.dates`, all at the same
// departure and arrival times. Either every date is saved or none is; dates
// that cannot be scheduled are listed in `errors.dates`.
export function createTrips(input, { now = Date.now() } = {}) {
  const ctx = loadContext();
  const errors = {};
  const { route, bus } = pickRouteAndBus(input, ctx, null, errors);
  const minutes = journeyMinutes(input, route, errors);

  const dates = [...new Set(Array.isArray(input.dates) ? input.dates : [])].sort();
  if (!dates.length) errors.dates = 'Add at least one date.';
  else if (dates.length > MAX_TRIP_DATES) errors.dates = `Add up to ${MAX_TRIP_DATES} dates at a time.`;
  else if (!dates.every(isDateKey)) errors.dates = 'One of the dates is not valid.';

  const fareInput = isBlank(input.fare) && route ? String(route.defaultFare) : input.fare;
  const fareErr = validateAmount(fareInput, { allowZero: false, label: 'Fare' });
  if (fareErr) errors.fare = fareErr;
  if (hasErrors(errors)) return fail(errors);

  // Check each date as a one-off trip, against the dates added before it too.
  const created = [];
  const problems = [];
  for (const date of dates) {
    const departureAt = `${date}T${input.departureTime}`;
    const arrivalAt = toLocalDateTime(addMinutes(parseLocalDateTime(departureAt), minutes));
    const res = resolveInput({ ...input, departureAt, arrivalAt, fare: fareInput }, { ...ctx, trips: [...ctx.trips, ...created] }, { now });
    const problem = res.errors.departureAt || res.errors.arrivalAt;
    if (problem) problems.push(`${formatDateLong(date)}: ${problem}`);
    else created.push(buildTrip({ route, bus, departureAt, arrivalAt, fare: res.fare, notes: input.notes }));
  }
  if (problems.length) {
    return fail({ dates: problems.join('\n') }, `${problems.length} of ${dates.length} date(s) cannot be scheduled. Remove or change them and try again.`);
  }
  writeCollection('trips', [...ctx.trips, ...created]);
  return { ok: true, record: created[0], records: created };
}

export function updateTrip(id, input, { now = Date.now() } = {}) {
  const ctx = loadContext();
  const existing = ctx.trips.find((t) => t.id === id);
  if (!existing) return fail({}, 'Trip not found.');
  if (existing.status !== 'Scheduled') return fail({}, `A ${existing.status.toLowerCase()} trip cannot be edited.`);

  const active = activeBookingsForTrip(id, readCollection('bookings'));
  // A date of a repeating trip keeps the repeating trip's route, bus and times so that
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
          ? 'This is one date of a repeating trip. Only its fare can be changed here. Edit the repeating trip to change the route, bus or times.'
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
// Repeating trips (schedules)
// ---------------------------------------------------------------------------

// Daily runs on every day; Weekly on `input.weekdays` (Date#getDay numbers).
// Picking all seven days makes a daily trip.
function pickWeekdays(input, errors) {
  if (input.frequency !== 'Weekly') return ALL_WEEKDAYS;
  const days = [...new Set(Array.isArray(input.weekdays) ? input.weekdays.map(Number) : [])].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  if (!days.length) errors.weekdays = 'Pick at least one day of the week.';
  return days;
}

function resolveScheduleInput(input, ctx, { existing = null, now = Date.now() } = {}) {
  const errors = {};
  const { route, bus } = pickRouteAndBus(input, ctx, existing, errors);
  const weekdays = pickWeekdays(input, errors);

  const durationMinutes = journeyMinutes(input, route, errors);
  if (!errors.arrivalTime && durationMinutes >= 1440) errors.arrivalTime = 'A repeating trip must arrive within 24 hours.';

  const dateErr = validateDateKey(input.startDate, { label: 'Start date' });
  if (dateErr) errors.startDate = dateErr;
  else if (input.startDate !== existing?.startDate && input.startDate < todayKey(new Date(now))) errors.startDate = 'Start date cannot be in the past.';

  const fareInput = isBlank(input.fare) && route ? String(route.defaultFare) : input.fare;
  const fareErr = validateAmount(fareInput, { allowZero: false, label: 'Fare' });
  if (fareErr) errors.fare = fareErr;

  // A paused repeating trip is checked again when it is resumed.
  if (!hasErrors(errors) && (existing?.status ?? 'Active') === 'Active') {
    const candidate = { id: existing?.id, busId: bus.id, departureTime: input.departureTime, durationMinutes, startDate: input.startDate, weekdays, status: 'Active' };
    const clash = findScheduleClash(candidate, ctx, { now });
    if (clash) errors.departureTime = clashMessage(bus.name, clash);
  }

  return { errors, route, bus, weekdays, durationMinutes, fare: toAmount(fareInput) };
}

function clashMessage(busName, { schedule, trip }) {
  return schedule ? repeatsMessage(busName, schedule) : busyMessage(busName, trip);
}

// Saved dates of a repeating trip that never had a booking (only a seat hold)
// are dropped when the repeating trip changes, so they are rebuilt from the new
// details. Dates with bookings, and cancelled or completed dates, are kept.
function dropUnbookedDates(trips, scheduleId) {
  const booked = new Set(readCollection('bookings').map((b) => b.tripId));
  return trips.filter((t) => !(t.scheduleId === scheduleId && t.status === 'Scheduled' && !booked.has(t.id)));
}

export function createSchedule(input, { now = Date.now() } = {}) {
  const ctx = loadContext();
  const { errors, route, bus, weekdays, durationMinutes, fare } = resolveScheduleInput(input, ctx, { now });
  if (hasErrors(errors)) return fail(errors);
  const t = nowISO();
  const schedule = {
    id: generateId('sch'),
    routeId: route.id,
    busId: bus.id,
    weekdays,
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
  if (!existing) return fail({}, 'Repeating trip not found.');
  // Validate against the trips that will remain, so a hold-only date of this
  // repeating trip does not block moving it.
  ctx.trips = dropUnbookedDates(ctx.trips, id);
  const { errors, route, bus, weekdays, durationMinutes, fare } = resolveScheduleInput(input, ctx, { existing, now });
  if (hasErrors(errors)) return fail(errors);
  const t = nowISO();
  const updated = {
    ...existing,
    routeId: route.id,
    busId: bus.id,
    weekdays,
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
  if (!existing) return fail({}, 'Repeating trip not found.');
  if (existing.status === status) return { ok: true, record: existing };
  if (status === 'Active') {
    const clash = findScheduleClash({ ...existing, status }, ctx, { now });
    if (clash) return fail({}, `Not resumed. ${clashMessage(existing.busSnapshot.name, clash)}`);
  }
  const updated = { ...existing, status, updatedAt: nowISO() };
  writeCollection('schedules', ctx.schedules.map((s) => (s.id === id ? updated : s)));
  return { ok: true, record: updated };
}

// Copies the bus's current layout onto the repeating trip. Saved dates with
// bookings keep their own layout (use syncTripLayout on those).
export function syncScheduleLayout(id) {
  const schedules = readCollection('schedules');
  const schedule = schedules.find((s) => s.id === id);
  if (!schedule) return fail({}, 'Repeating trip not found.');
  const bus = readCollection('buses').find((b) => b.id === schedule.busId);
  if (!bus || !isValidLayout(bus.seatLayout)) return fail({}, 'The bus no longer has a valid layout.');
  const t = nowISO();
  const updated = { ...schedule, seatLayoutSnapshot: cloneLayout(bus.seatLayout), busSnapshot: busSnapshotOf(bus), layoutSnapshotAt: t, updatedAt: t };
  writeCollections({ schedules: schedules.map((s) => (s.id === id ? updated : s)), trips: dropUnbookedDates(readCollection('trips'), id) });
  return { ok: true, record: updated };
}

export function deleteSchedule(id) {
  const schedules = readCollection('schedules');
  if (!schedules.some((s) => s.id === id)) return fail({}, 'Repeating trip not found.');
  const trips = readCollection('trips');
  const dated = new Set(trips.filter((t) => t.scheduleId === id).map((t) => t.id));
  if (readCollection('bookings').some((b) => dated.has(b.tripId))) {
    return fail({}, 'This repeating trip has booking history and cannot be deleted. Pause it instead.');
  }
  writeCollections({ schedules: schedules.filter((s) => s.id !== id), trips: trips.filter((t) => !dated.has(t.id)) });
  return { ok: true };
}
