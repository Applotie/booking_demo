'use client';

import { useState, useEffect, useMemo } from 'react';
import { Info } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Input, Select, FormError } from '../ui/Field';
import { Alert } from '../ui/Misc';
import SeatMap from '../SeatMap';
import { useToast } from '../ui/Toast';
import { createTrip, updateTrip } from '@/lib/trip-service';
import { activeBookingsForTrip } from '@/lib/booking-service';
import { parseLocalDateTime, toLocalDateTime, addMinutes, addDays, isLocalDateTime } from '@/lib/dates';
import { formatINR, formatDuration } from '@/lib/formatters';
import { sellableSeatCount } from '@/lib/seat-service';

function defaultDeparture() {
  const d = addDays(new Date(), 1);
  d.setHours(8, 0, 0, 0);
  return toLocalDateTime(d);
}

export default function TripForm({ open, trip, data, onClose }) {
  const [form, setForm] = useState({});
  const [arrivalTouched, setArrivalTouched] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const toast = useToast();

  const activeBookings = trip ? activeBookingsForTrip(trip.id, data.bookings).length : 0;
  const locked = activeBookings > 0;

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setMessage('');
    if (trip) {
      setForm({ routeId: trip.routeId, busId: trip.busId, departureAt: trip.departureAt, arrivalAt: trip.arrivalAt, fare: String(trip.fare), notes: trip.notes || '' });
      setArrivalTouched(true);
    } else {
      setForm({ routeId: '', busId: '', departureAt: defaultDeparture(), arrivalAt: '', fare: '', notes: '' });
      setArrivalTouched(false);
    }
  }, [open, trip]);

  const route = data.routes.find((r) => r.id === form.routeId);
  const bus = data.buses.find((b) => b.id === form.busId);

  // Suggest arrival from the route duration until the admin edits it.
  useEffect(() => {
    if (!open || arrivalTouched || !route || !isLocalDateTime(form.departureAt)) return;
    const arrival = toLocalDateTime(addMinutes(parseLocalDateTime(form.departureAt), route.duration));
    setForm((f) => (f.arrivalAt === arrival ? f : { ...f, arrivalAt: arrival }));
  }, [open, arrivalTouched, route, form.departureAt]);

  const routeOptions = useMemo(
    () =>
      data.routes
        .filter((r) => r.isActive || r.id === trip?.routeId)
        .map((r) => ({ value: r.id, label: `${r.name} (${r.source} → ${r.destination})${r.isActive ? '' : ' – inactive'}` })),
    [data.routes, trip]
  );
  const busOptions = useMemo(
    () =>
      data.buses
        .filter((b) => b.operationalStatus === 'Active' || b.id === trip?.busId)
        .map((b) => ({ value: b.id, label: `${b.name} · ${b.registrationNumber} · ${b.capacity} seats (${b.seatLayout?.arrangement})` })),
    [data.buses, trip]
  );

  const onRoute = (e) => {
    const next = data.routes.find((r) => r.id === e.target.value);
    setForm((f) => {
      const prev = data.routes.find((r) => r.id === f.routeId);
      const fareUntouched = !f.fare || (prev && Number(f.fare) === prev.defaultFare);
      return { ...f, routeId: e.target.value, fare: next && fareUntouched ? String(next.defaultFare) : f.fare };
    });
  };

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    const result = trip ? updateTrip(trip.id, form) : createTrip(form);
    if (!result.ok) {
      setErrors(result.errors || {});
      setMessage(result.message);
      return;
    }
    toast.success(trip ? 'Trip updated.' : 'Trip scheduled.');
    onClose(result.record);
  };

  const previewLayout = trip && trip.busId === form.busId ? trip.seatLayoutSnapshot : bus?.seatLayout;

  return (
    <Modal
      open={open}
      onClose={() => onClose(null)}
      title={trip ? 'Edit trip' : 'Schedule trip'}
      description="The fare and seating layout are saved with the trip, so later route or bus edits do not change it."
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={() => onClose(null)}>
            Cancel
          </Button>
          <Button type="submit" form="trip-form">
            {trip ? 'Save changes' : 'Schedule trip'}
          </Button>
        </>
      }
    >
      <form id="trip-form" onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-4">
          <FormError message={message} />
          {locked ? (
            <Alert tone="warning" icon={Info}>
              This trip has {activeBookings} active booking(s). Route, bus and times are locked so passengers are not moved. You can still change the fare
              for new bookings — existing bookings keep their fare.
            </Alert>
          ) : null}
          {routeOptions.length === 0 ? <Alert tone="warning">No active routes. Create or activate a route first.</Alert> : null}
          {busOptions.length === 0 ? <Alert tone="warning">No active buses. Add a bus or set one to Active first.</Alert> : null}
          <Select label="Route" required value={form.routeId || ''} onChange={onRoute} options={routeOptions} placeholder="Select route" error={errors.routeId} disabled={locked} />
          <Select label="Bus" required value={form.busId || ''} onChange={set('busId')} options={busOptions} placeholder="Select bus" error={errors.busId} disabled={locked} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Departure" required type="datetime-local" value={form.departureAt || ''} onChange={set('departureAt')} error={errors.departureAt} disabled={locked} />
            <Input
              label="Arrival"
              required
              type="datetime-local"
              value={form.arrivalAt || ''}
              onChange={(e) => {
                setArrivalTouched(true);
                set('arrivalAt')(e);
              }}
              error={errors.arrivalAt}
              disabled={locked}
              hint={route && !arrivalTouched ? `Estimated from route duration (${formatDuration(route.duration)}).` : undefined}
            />
          </div>
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
          <div className="mb-2 text-sm font-medium text-slate-700">Seating layout {trip ? 'saved with this trip' : 'to be saved'}</div>
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
