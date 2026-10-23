'use client';

import { useState, useEffect, useMemo } from 'react';
import { Info } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Field, Input, Select, FormError } from '../ui/Field';
import { Alert } from '../ui/Misc';
import SeatMap from '../SeatMap';
import { useToast } from '../ui/Toast';
import { createTrip, updateTrip, createSchedule, updateSchedule } from '@/lib/trip-service';
import { activeBookingsForTrip } from '@/lib/booking-service';
import { scheduleArrivalTime } from '@/lib/schedule-service';
import { parseLocalDateTime, toLocalDateTime, addMinutes, addDays, isLocalDateTime, isTimeOfDay, minutesOfDay, timeFromMinutes, todayKey } from '@/lib/dates';
import { formatINR, formatDuration, formatDateLong } from '@/lib/formatters';
import { sellableSeatCount } from '@/lib/seat-service';
import { TRIP_FREQUENCIES } from '@/lib/constants';

function defaultDeparture() {
  const d = addDays(new Date(), 1);
  d.setHours(8, 0, 0, 0);
  return toLocalDateTime(d);
}

// Pass `trip` to edit a one-off trip (or one date of a daily trip), `schedule`
// to edit a daily trip, or neither to add a new trip.
export default function TripForm({ open, trip, schedule, data, onClose }) {
  const [form, setForm] = useState({});
  const [arrivalTouched, setArrivalTouched] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const toast = useToast();

  const daily = form.frequency === 'Daily';
  const datedDaily = Boolean(trip?.scheduleId);
  const activeBookings = trip ? activeBookingsForTrip(trip.id, data.bookings).length : 0;
  const locked = activeBookings > 0 || datedDaily;

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setMessage('');
    if (schedule) {
      setForm({
        frequency: 'Daily',
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
      setForm({ frequency: 'Daily', routeId: '', busId: '', departureAt: defaultDeparture(), arrivalAt: '', departureTime: '08:00', arrivalTime: '', startDate: todayKey(), fare: '', notes: '' });
      setArrivalTouched(false);
    }
  }, [open, trip, schedule]);

  const route = data.routes.find((r) => r.id === form.routeId);
  const bus = data.buses.find((b) => b.id === form.busId);

  // Suggest arrival from the route duration until the admin edits it.
  useEffect(() => {
    if (!open || arrivalTouched || !route) return;
    if (daily) {
      if (!isTimeOfDay(form.departureTime)) return;
      const arrival = timeFromMinutes(minutesOfDay(form.departureTime) + route.duration);
      setForm((f) => (f.arrivalTime === arrival ? f : { ...f, arrivalTime: arrival }));
      return;
    }
    if (!isLocalDateTime(form.departureAt)) return;
    const arrival = toLocalDateTime(addMinutes(parseLocalDateTime(form.departureAt), route.duration));
    setForm((f) => (f.arrivalAt === arrival ? f : { ...f, arrivalAt: arrival }));
  }, [open, arrivalTouched, route, daily, form.departureAt, form.departureTime]);

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
    setForm((f) => ({ ...f, frequency }));
    setArrivalTouched(false);
    setErrors({});
    setMessage('');
  };

  const submit = (e) => {
    e.preventDefault();
    let result;
    if (schedule) result = updateSchedule(schedule.id, form);
    else if (trip) result = updateTrip(trip.id, form);
    else result = daily ? createSchedule(form) : createTrip(form);
    if (!result.ok) {
      setErrors(result.errors || {});
      setMessage(result.message);
      return;
    }
    toast.success(schedule ? 'Daily trip updated.' : trip ? 'Trip updated.' : daily ? 'Daily trip added. Passengers can book it for any date.' : 'Trip scheduled.');
    onClose(result.record);
  };

  // Daily journey length; an arrival at or before departure is the next day.
  const dailyMinutes =
    isTimeOfDay(form.departureTime) && isTimeOfDay(form.arrivalTime) ? (minutesOfDay(form.arrivalTime) - minutesOfDay(form.departureTime) + 1440) % 1440 : null;
  const nextDay = dailyMinutes !== null && minutesOfDay(form.arrivalTime) < minutesOfDay(form.departureTime);
  const dailyArrivalHint = dailyMinutes
    ? `${route && !arrivalTouched ? 'Estimated from route duration' : 'Journey'}: ${formatDuration(dailyMinutes)}${nextDay ? ' · arrives the next day' : ''}.`
    : undefined;

  const saved = schedule || trip;
  const previewLayout = saved && saved.busId === form.busId ? saved.seatLayoutSnapshot : bus?.seatLayout;

  return (
    <Modal
      open={open}
      onClose={() => onClose(null)}
      title={schedule ? 'Edit daily trip' : trip ? 'Edit trip' : 'Schedule trip'}
      description="The fare and seating layout are saved with the trip, so later route or bus edits do not change it."
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={() => onClose(null)}>
            Cancel
          </Button>
          <Button type="submit" form="trip-form">
            {saved ? 'Save changes' : daily ? 'Add daily trip' : 'Schedule trip'}
          </Button>
        </>
      }
    >
      <form id="trip-form" onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-4">
          <FormError message={message} />
          {datedDaily ? (
            <Alert tone="info" icon={Info}>
              This is the {formatDateLong(trip.departureAt)} departure of a daily trip. Its route, bus and times come from the daily trip. You can change
              the fare for this date only — existing bookings keep their fare.
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
          {!saved ? (
            <Field label="Frequency" hint={daily ? 'Runs every day. Passengers can book any date from the start date.' : 'Runs once, on the date you choose.'}>
              <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5" role="group" aria-label="Frequency">
                {TRIP_FREQUENCIES.map((f) => (
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
          {daily ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Departure time" required type="time" value={form.departureTime || ''} onChange={set('departureTime')} error={errors.departureTime} />
                <Input label="Arrival time" required type="time" value={form.arrivalTime || ''} onChange={setArrival('arrivalTime')} error={errors.arrivalTime} hint={dailyArrivalHint} />
              </div>
              <Input
                label="Starts on"
                required
                type="date"
                min={schedule ? undefined : todayKey()}
                value={form.startDate || ''}
                onChange={set('startDate')}
                error={errors.startDate}
                hint="Bookings open for every date from this day on."
              />
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
