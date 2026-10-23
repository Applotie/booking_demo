'use client';

import { useState, useEffect, useMemo } from 'react';
import { Info, Plus, X } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Field, Input, Select, FormError, inputClasses } from '../ui/Field';
import { Alert } from '../ui/Misc';
import SeatMap from '../SeatMap';
import { useToast } from '../ui/Toast';
import { createTrip, createTrips, updateTrip, createSchedule, updateSchedule } from '@/lib/trip-service';
import { activeBookingsForTrip } from '@/lib/booking-service';
import { scheduleArrivalTime, scheduleFrequency, scheduleWeekdays, runsEveryDay, upcomingRunDates } from '@/lib/schedule-service';
import { parseLocalDateTime, toLocalDateTime, addMinutes, addDays, addDaysToKey, isDateKey, isLocalDateTime, isTimeOfDay, minutesOfDay, timeFromMinutes, todayKey, toDateKey } from '@/lib/dates';
import { formatINR, formatDuration, formatDateLong, formatWeekdays, pluralize } from '@/lib/formatters';
import { sellableSeatCount } from '@/lib/seat-service';
import { TRIP_FREQUENCIES, WEEKDAYS, MAX_TRIP_DATES } from '@/lib/constants';

function defaultDeparture() {
  const d = addDays(new Date(), 1);
  d.setHours(8, 0, 0, 0);
  return toLocalDateTime(d);
}

const FREQUENCY_HINTS = {
  Daily: 'Runs every day. Passengers can book any date from the start date.',
  Weekly: 'Runs every week on the days you pick. Passengers can book any of those days from the start date.',
  Custom: 'Runs only on the dates you pick. Each date is saved as its own trip.',
};

// Pass `trip` to edit a one-off trip (or one date of a repeating trip),
// `schedule` to edit a repeating trip, or neither to add new trips.
export default function TripForm({ open, trip, schedule, data, onClose }) {
  const [form, setForm] = useState({});
  const [arrivalTouched, setArrivalTouched] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const toast = useToast();

  // Daily and Weekly are repeating trips; new Specific dates trips take a list
  // of dates. Both use times of day. Editing a one-off trip uses date-times.
  const repeats = form.frequency === 'Daily' || form.frequency === 'Weekly';
  const multiDate = form.frequency === 'Custom' && !trip;
  const timesOnly = repeats || multiDate;
  const datedDaily = Boolean(trip?.scheduleId);
  const activeBookings = trip ? activeBookingsForTrip(trip.id, data.bookings).length : 0;
  const locked = activeBookings > 0 || datedDaily;

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setMessage('');
    if (schedule) {
      setForm({
        frequency: scheduleFrequency(schedule),
        weekdays: runsEveryDay(schedule) ? [] : [...scheduleWeekdays(schedule)],
        routeId: schedule.routeId,
        busId: schedule.busId,
        departureTime: schedule.departureTime,
        arrivalTime: scheduleArrivalTime(schedule),
        startDate: schedule.startDate,
        fare: String(schedule.fare),
        notes: schedule.notes || '',
      });
      setArrivalTouched(true);
    } else if (trip) {
      setForm({ frequency: 'Custom', routeId: trip.routeId, busId: trip.busId, departureAt: trip.departureAt, arrivalAt: trip.arrivalAt, fare: String(trip.fare), notes: trip.notes || '' });
      setArrivalTouched(true);
    } else {
      setForm({
        frequency: 'Daily',
        weekdays: [],
        dates: [],
        dateDraft: toDateKey(addDays(new Date(), 1)),
        routeId: '',
        busId: '',
        departureAt: defaultDeparture(),
        arrivalAt: '',
        departureTime: '08:00',
        arrivalTime: '',
        startDate: todayKey(),
        fare: '',
        notes: '',
      });
      setArrivalTouched(false);
    }
  }, [open, trip, schedule]);

  const route = data.routes.find((r) => r.id === form.routeId);
  const bus = data.buses.find((b) => b.id === form.busId);

  // Suggest arrival from the route duration until the admin edits it.
  useEffect(() => {
    if (!open || arrivalTouched || !route) return;
    if (timesOnly) {
      if (!isTimeOfDay(form.departureTime)) return;
      const arrival = timeFromMinutes(minutesOfDay(form.departureTime) + route.duration);
      setForm((f) => (f.arrivalTime === arrival ? f : { ...f, arrivalTime: arrival }));
      return;
    }
    if (!isLocalDateTime(form.departureAt)) return;
    const arrival = toLocalDateTime(addMinutes(parseLocalDateTime(form.departureAt), route.duration));
    setForm((f) => (f.arrivalAt === arrival ? f : { ...f, arrivalAt: arrival }));
  }, [open, arrivalTouched, route, timesOnly, form.departureAt, form.departureTime]);

  const routeOptions = useMemo(() => {
    const currentRouteId = (trip || schedule)?.routeId;
    return data.routes
      .filter((r) => r.isActive || r.id === currentRouteId)
      .map((r) => ({ value: r.id, label: `${r.name} (${r.source} → ${r.destination})${r.isActive ? '' : ' – inactive'}` }));
  }, [data.routes, trip, schedule]);
  const busOptions = useMemo(() => {
    const currentBusId = (trip || schedule)?.busId;
    return data.buses
      .filter((b) => b.operationalStatus === 'Active' || b.id === currentBusId)
      .map((b) => ({ value: b.id, label: `${b.name} · ${b.registrationNumber} · ${b.capacity} seats (${b.seatLayout?.arrangement})` }));
  }, [data.buses, trip, schedule]);
  // A repeating trip can switch between Daily and Weekly, but not to dates.
  const frequencyOptions = schedule ? TRIP_FREQUENCIES.filter((f) => f.value !== 'Custom') : TRIP_FREQUENCIES;

  const onRoute = (e) => {
    const next = data.routes.find((r) => r.id === e.target.value);
    setForm((f) => {
      const prev = data.routes.find((r) => r.id === f.routeId);
      const fareUntouched = !f.fare || (prev && Number(f.fare) === prev.defaultFare);
      return { ...f, routeId: e.target.value, fare: next && fareUntouched ? String(next.defaultFare) : f.fare };
    });
  };

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const setArrival = (field) => (e) => {
    setArrivalTouched(true);
    set(field)(e);
  };
  const setFrequency = (frequency) => {
    // Times of day carry over between Daily, Weekly and Specific dates.
    setForm((f) => ({ ...f, frequency }));
    setErrors({});
    setMessage('');
  };
  const toggleWeekday = (day) => {
    setForm((f) => ({ ...f, weekdays: f.weekdays.includes(day) ? f.weekdays.filter((d) => d !== day) : [...f.weekdays, day] }));
    setErrors((e) => ({ ...e, weekdays: undefined }));
  };
  const addDate = () => {
    const date = form.dateDraft;
    if (!isDateKey(date)) return setErrors((e) => ({ ...e, dates: 'Choose a valid date to add.' }));
    if (date < todayKey()) return setErrors((e) => ({ ...e, dates: 'Pick today or a later date.' }));
    if (form.dates.length >= MAX_TRIP_DATES && !form.dates.includes(date)) return setErrors((e) => ({ ...e, dates: `Add up to ${MAX_TRIP_DATES} dates at a time.` }));
    setForm((f) => ({ ...f, dates: f.dates.includes(date) ? f.dates : [...f.dates, date].sort(), dateDraft: addDaysToKey(date, 1) }));
    setErrors((e) => ({ ...e, dates: undefined }));
  };
  const removeDate = (date) => setForm((f) => ({ ...f, dates: f.dates.filter((d) => d !== date) }));

  const submit = (e) => {
    e.preventDefault();
    let result;
    if (schedule) result = updateSchedule(schedule.id, form);
    else if (trip) result = updateTrip(trip.id, form);
    else if (repeats) result = createSchedule(form);
    else result = createTrips(form);
    if (!result.ok) {
      setErrors(result.errors || {});
      setMessage(result.message);
      return;
    }
    toast.success(
      schedule
        ? 'Repeating trip updated.'
        : trip
          ? 'Trip updated.'
          : repeats
            ? `Repeating trip added (${formatWeekdays(result.record.weekdays)}). Passengers can book any date it runs.`
            : `${pluralize(result.records.length, 'trip')} scheduled.`
    );
    onClose(result.record);
  };

  // Journey length from times of day; an arrival at or before departure is the next day.
  const dailyMinutes =
    isTimeOfDay(form.departureTime) && isTimeOfDay(form.arrivalTime) ? (minutesOfDay(form.arrivalTime) - minutesOfDay(form.departureTime) + 1440) % 1440 : null;
  const nextDay = dailyMinutes !== null && minutesOfDay(form.arrivalTime) < minutesOfDay(form.departureTime);
  const dailyArrivalHint = dailyMinutes
    ? `${route && !arrivalTouched ? 'Estimated from route duration' : 'Journey'}: ${formatDuration(dailyMinutes)}${nextDay ? ' · arrives the next day' : ''}.`
    : undefined;

  // The next few dates a weekly trip runs, so the pattern is easy to check.
  const weeklyPreview =
    form.frequency === 'Weekly' && form.weekdays?.length && isDateKey(form.startDate)
      ? upcomingRunDates({ startDate: form.startDate, weekdays: form.weekdays }, todayKey(), 3).map((d) => formatDateLong(d))
      : [];

  const saved = schedule || trip;
  const previewLayout = saved && saved.busId === form.busId ? saved.seatLayoutSnapshot : bus?.seatLayout;

  return (
    <Modal
      open={open}
      onClose={() => onClose(null)}
      title={schedule ? 'Edit repeating trip' : trip ? 'Edit trip' : 'Schedule trip'}
      description="The fare and seating layout are saved with the trip, so later route or bus edits do not change it."
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={() => onClose(null)}>
            Cancel
          </Button>
          <Button type="submit" form="trip-form">
            {saved ? 'Save changes' : repeats ? 'Add repeating trip' : form.dates?.length > 1 ? `Schedule ${form.dates.length} trips` : 'Schedule trip'}
          </Button>
        </>
      }
    >
      <form id="trip-form" onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-4">
          <FormError message={message} />
          {datedDaily ? (
            <Alert tone="info" icon={Info}>
              This is the {formatDateLong(trip.departureAt)} departure of a repeating trip. Its route, bus and times come from the repeating trip. You can
              change the fare for this date only — existing bookings keep their fare.
            </Alert>
          ) : locked ? (
            <Alert tone="warning" icon={Info}>
              This trip has {activeBookings} active booking(s). Route, bus and times are locked so passengers are not moved. You can still change the fare
              for new bookings — existing bookings keep their fare.
            </Alert>
          ) : null}
          {schedule ? (
            <Alert tone="info" icon={Info}>
              Changes apply to every date that has no bookings yet. Dates that already have bookings keep their saved details; edit or cancel those in the
              trips list.
            </Alert>
          ) : null}
          {!trip ? (
            <Field label="Frequency" hint={FREQUENCY_HINTS[form.frequency]}>
              <div className="inline-flex flex-wrap rounded-lg border border-slate-300 bg-white p-0.5" role="group" aria-label="Frequency">
                {frequencyOptions.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    aria-pressed={form.frequency === f.value}
                    onClick={() => setFrequency(f.value)}
                    className={`rounded-md px-4 py-1.5 text-sm font-medium ${form.frequency === f.value ? 'bg-ink text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </Field>
          ) : null}
          {routeOptions.length === 0 ? <Alert tone="warning">No active routes. Create or activate a route first.</Alert> : null}
          {busOptions.length === 0 ? <Alert tone="warning">No active buses. Add a bus or set one to Active first.</Alert> : null}
          <Select label="Route" required value={form.routeId || ''} onChange={onRoute} options={routeOptions} placeholder="Select route" error={errors.routeId} disabled={locked} />
          <Select label="Bus" required value={form.busId || ''} onChange={set('busId')} options={busOptions} placeholder="Select bus" error={errors.busId} disabled={locked} />
          {form.frequency === 'Weekly' ? (
            <Field
              label="Runs on"
              required
              error={errors.weekdays}
              hint={weeklyPreview.length ? `Next departures: ${weeklyPreview.join(' · ')}` : 'Pick the days of the week this bus runs.'}
            >
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days of the week">
                {WEEKDAYS.map((d) => {
                  const on = form.weekdays?.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      aria-pressed={on}
                      aria-label={d.label}
                      onClick={() => toggleWeekday(d.value)}
                      className={`h-9 w-12 rounded-lg border text-sm font-medium ${on ? 'border-ink bg-ink text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'}`}
                    >
                      {d.short}
                    </button>
                  );
                })}
              </div>
            </Field>
          ) : null}
          {multiDate ? (
            <Field label="Dates" required error={errors.dates} hint={form.dates?.length ? `${pluralize(form.dates.length, 'date')} selected.` : 'Add each date this bus runs.'}>
              <div className="flex gap-2">
                <input
                  type="date"
                  aria-label="Date to add"
                  min={todayKey()}
                  value={form.dateDraft || ''}
                  onChange={set('dateDraft')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addDate();
                    }
                  }}
                  className={inputClasses(Boolean(errors.dates), 'h-10 w-auto')}
                />
                <Button variant="secondary" icon={Plus} onClick={addDate}>
                  Add date
                </Button>
              </div>
              {form.dates?.length ? (
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Selected dates">
                  {form.dates.map((d) => (
                    <li key={d} className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 py-0.5 pl-3 pr-1 text-sm text-slate-700">
                      {formatDateLong(d)}
                      <button type="button" onClick={() => removeDate(d)} className="rounded-full p-0.5 text-slate-500 hover:bg-slate-200 hover:text-ink" aria-label={`Remove ${formatDateLong(d)}`}>
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Field>
          ) : null}
          {timesOnly ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Departure time" required type="time" value={form.departureTime || ''} onChange={set('departureTime')} error={errors.departureTime} />
                <Input label="Arrival time" required type="time" value={form.arrivalTime || ''} onChange={setArrival('arrivalTime')} error={errors.arrivalTime} hint={dailyArrivalHint} />
              </div>
              {repeats ? (
                <Input
                  label="Starts on"
                  required
                  type="date"
                  min={schedule ? undefined : todayKey()}
                  value={form.startDate || ''}
                  onChange={set('startDate')}
                  error={errors.startDate}
                  hint={form.frequency === 'Weekly' ? 'Bookings open for every chosen day from this date on.' : 'Bookings open for every date from this day on.'}
                />
              ) : null}
            </>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Departure" required type="datetime-local" value={form.departureAt || ''} onChange={set('departureAt')} error={errors.departureAt} disabled={locked} />
              <Input
                label="Arrival"
                required
                type="datetime-local"
                value={form.arrivalAt || ''}
                onChange={setArrival('arrivalAt')}
                error={errors.arrivalAt}
                disabled={locked}
                hint={route && !arrivalTouched ? `Estimated from route duration (${formatDuration(route.duration)}).` : undefined}
              />
            </div>
          )}
          <Input
            label="Fare per seat (₹)"
            required
            type="number"
            inputMode="decimal"
            min="1"
            step="0.01"
            value={form.fare || ''}
            onChange={set('fare')}
            error={errors.fare}
            hint={route ? `Route default: ${formatINR(route.defaultFare)}` : 'Defaults to the route fare.'}
          />
          <Input label="Notes (internal)" value={form.notes || ''} onChange={set('notes')} placeholder="Optional" />
        </div>
        <div className="min-w-0">
          <div className="mb-2 text-sm font-medium text-slate-700">Seating layout {saved ? 'saved with this trip' : 'to be saved'}</div>
          {previewLayout ? (
            <>
              <SeatMap layout={previewLayout} mode="view" />
              <p className="mt-2 text-center text-xs text-slate-500">
                {previewLayout.capacity} seats · {previewLayout.arrangement} · {sellableSeatCount(previewLayout)} bookable
              </p>
            </>
          ) : (
            <div className="flex h-40 w-56 items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 px-4 text-center text-sm text-slate-500">Select a bus to preview its layout.</div>
          )}
        </div>
      </form>
    </Modal>
  );
}
