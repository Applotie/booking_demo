// Repeating trips. A schedule repeats one route, bus, departure time and fare
// from its start date, either every day or on chosen days of the week
// (`weekdays`, 0 = Sunday as in Date#getDay). Each date has a fixed trip id, so a date can
// be shown and booked before it exists: the first seat hold on a date saves it
// as an ordinary trip (with `scheduleId`), and from then on it behaves exactly
// like a one-off trip (bookings, cancellation, completion, reports).
//
// This module is pure (no storage access) so that both trip-service and
// booking-service can use it.

import { nowISO } from './storage.js';
import { parseLocalDateTime, parseDateKey, toLocalDateTime, addMinutes, addDaysToKey, dateKeyOf, isDateKey, minutesOfDay, timeFromMinutes } from './dates.js';
import { cloneLayout } from './seat-service.js';

const DAY_MINUTES = 1440;
const OCCURRENCE_ID = /^(sch_[a-z0-9]+)-(\d{4}-\d{2}-\d{2})$/;
export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

// Schedules saved before weekly trips existed have no `weekdays` and run daily.
export function scheduleWeekdays(schedule) {
  return Array.isArray(schedule?.weekdays) && schedule.weekdays.length ? schedule.weekdays : ALL_WEEKDAYS;
}

export function runsEveryDay(schedule) {
  return scheduleWeekdays(schedule).length === 7;
}

// 'Daily' or 'Weekly' (see TRIP_FREQUENCIES).
export function scheduleFrequency(schedule) {
  return runsEveryDay(schedule) ? 'Daily' : 'Weekly';
}

export function weekdayOf(dateKey) {
  const d = parseDateKey(dateKey);
  return d ? d.getDay() : null;
}

// Whether the schedule's pattern includes `dateKey` (ignores its status).
export function runsOn(schedule, dateKey) {
  return dateKey >= schedule.startDate && scheduleWeekdays(schedule).includes(weekdayOf(dateKey));
}

// The first date on or after `fromKey` that the schedule runs.
export function nextRunDate(schedule, fromKey) {
  let date = fromKey > schedule.startDate ? fromKey : schedule.startDate;
  for (let i = 0; i < 7; i++, date = addDaysToKey(date, 1)) if (runsOn(schedule, date)) return date;
  return null;
}

// The next `count` dates the schedule runs, from `fromKey` on.
export function upcomingRunDates(schedule, fromKey, count) {
  const dates = [];
  for (let date = nextRunDate(schedule, fromKey); date && dates.length < count; date = nextRunDate(schedule, addDaysToKey(date, 1))) dates.push(date);
  return dates;
}

export function occurrenceId(scheduleId, dateKey) {
  return `${scheduleId}-${dateKey}`;
}

export function parseOccurrenceId(id) {
  const m = typeof id === 'string' ? OCCURRENCE_ID.exec(id) : null;
  return m && isDateKey(m[2]) ? { scheduleId: m[1], dateKey: m[2] } : null;
}

export function scheduleArrivalTime(schedule) {
  return timeFromMinutes(minutesOfDay(schedule.departureTime) + schedule.durationMinutes);
}

export function arrivesNextDay(schedule) {
  return minutesOfDay(schedule.departureTime) + schedule.durationMinutes >= DAY_MINUTES;
}

export function occurrenceTimes(schedule, dateKey) {
  const departureAt = `${dateKey}T${schedule.departureTime}`;
  return { departureAt, arrivalAt: toLocalDateTime(addMinutes(parseLocalDateTime(departureAt), schedule.durationMinutes)) };
}

// Whether the schedule offers `dateKey` as a date that is not saved yet.
function offersDate(schedule, dateKey) {
  return schedule.status === 'Active' && runsOn(schedule, dateKey);
}

// The trip for one date of a schedule, in the same shape as a saved trip.
export function buildOccurrenceTrip(schedule, dateKey) {
  const t = nowISO();
  return {
    id: occurrenceId(schedule.id, dateKey),
    scheduleId: schedule.id,
    routeId: schedule.routeId,
    busId: schedule.busId,
    ...occurrenceTimes(schedule, dateKey),
    fare: schedule.fare,
    routeSnapshot: { ...schedule.routeSnapshot, stops: [...(schedule.routeSnapshot.stops || [])] },
    busSnapshot: { ...schedule.busSnapshot },
    seatLayoutSnapshot: cloneLayout(schedule.seatLayoutSnapshot),
    layoutSnapshotAt: schedule.layoutSnapshotAt,
    status: 'Scheduled',
    notes: schedule.notes,
    cancellationReason: '',
    completedAt: null,
    cancelledAt: null,
    createdAt: t,
    updatedAt: t,
  };
}

// A saved trip, or the not-yet-saved date of a repeating trip that `id` names.
// Returns null if neither exists (unknown id, paused schedule, before start,
// or a day of the week it does not run).
export function resolveTrip(id, { trips, schedules = [] }) {
  const saved = trips.find((t) => t.id === id);
  if (saved) return saved;
  const occ = parseOccurrenceId(id);
  const schedule = occ && schedules.find((s) => s.id === occ.scheduleId);
  return schedule && offersDate(schedule, occ.dateKey) ? buildOccurrenceTrip(schedule, occ.dateKey) : null;
}

// ---------------------------------------------------------------------------
// Bus overlap checks
// ---------------------------------------------------------------------------

// A schedule's run on `dateKey` in ms, or null if that date is not offered or
// is already saved (saved dates are checked as ordinary trips).
function unsavedRun(schedule, dateKey, trips) {
  if (!offersDate(schedule, dateKey) || trips.some((t) => t.id === occurrenceId(schedule.id, dateKey))) return null;
  const { departureAt, arrivalAt } = occurrenceTimes(schedule, dateKey);
  return { departureAt, arrivalAt, start: parseLocalDateTime(departureAt).getTime(), end: parseLocalDateTime(arrivalAt).getTime() };
}

// The first repeating run on `busId` that overlaps [departureAt, arrivalAt).
export function findDailyConflict(schedules, trips, { busId, departureAt, arrivalAt }) {
  const start = parseLocalDateTime(departureAt)?.getTime();
  const end = parseLocalDateTime(arrivalAt)?.getTime();
  if (!start || !end) return null;
  const last = dateKeyOf(arrivalAt);
  for (const schedule of schedules) {
    if (schedule.busId !== busId) continue;
    // Runs are shorter than a day, so one that starts the day before can still be on the road.
    for (let d = addDaysToKey(dateKeyOf(departureAt), -1); d <= last; d = addDaysToKey(d, 1)) {
      const run = unsavedRun(schedule, d, trips);
      if (run && run.start < end && start < run.end) return { schedule, ...run };
    }
  }
  return null;
}

// Whether two schedules' runs can overlap: an overlapping time of day on a day
// both run, including a run of `b` that starts the day before or after `a`'s.
function windowsOverlap(a, b) {
  const as = minutesOfDay(a.departureTime);
  const bs = minutesOfDay(b.departureTime);
  const bDays = new Set(scheduleWeekdays(b));
  return [-1, 0, 1].some(
    (k) =>
      as < bs + k * DAY_MINUTES + b.durationMinutes &&
      bs + k * DAY_MINUTES < as + a.durationMinutes &&
      scheduleWeekdays(a).some((d) => bDays.has((d + k + 7) % 7))
  );
}

// What an active repeating trip would clash with on its bus: another active
// repeating trip at an overlapping time on a shared day ({ schedule }), or a
// trip that has not finished and overlaps one of its unsaved dates ({ trip }).
export function findScheduleClash(candidate, { schedules, trips }, { now = Date.now() } = {}) {
  const schedule = schedules.find((s) => s.id !== candidate.id && s.busId === candidate.busId && s.status === 'Active' && windowsOverlap(candidate, s));
  if (schedule) return { schedule };
  const trip = trips.find(
    (t) =>
      t.busId === candidate.busId &&
      t.status !== 'Cancelled' &&
      (parseLocalDateTime(t.arrivalAt)?.getTime() || 0) > now &&
      findDailyConflict([candidate], trips, t)
  );
  return trip ? { trip } : null;
}
