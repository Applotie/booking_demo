'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, TriangleAlert, X, ArrowRight, Repeat } from 'lucide-react';
import SeatMap, { SeatLegend } from '@/components/SeatMap';
import TripHeader from '@/components/public/TripHeader';
import Button from '@/components/ui/Button';
import { inputClasses } from '@/components/ui/Field';
import { Alert, EmptyState } from '@/components/ui/Misc';
import { useAppData, useNow } from '@/lib/hooks/use-app-data';
import { getSeatAvailability, createHold, getHoldByToken, isHoldActive, tripUnavailableReason } from '@/lib/booking-service';
import { resolveTrip, occurrenceId, runsEveryDay, scheduleWeekdays, upcomingRunDates } from '@/lib/schedule-service';
import { sortSeatIds } from '@/lib/seat-service';
import { sessionGet, sessionSet, holdKey, flashKey } from '@/lib/session';
import { dateKeyOf, todayKey } from '@/lib/dates';
import { formatINR, formatDateLong, formatWeekdays } from '@/lib/formatters';
import { MAX_SEATS_PER_BOOKING } from '@/lib/constants';

export default function TripSeatsPage() {
  const { tripId } = useParams();
  const router = useRouter();
  const { ready, data } = useAppData();
  const now = useNow(1000);
  const [selected, setSelected] = useState([]);
  const [ownToken, setOwnToken] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const restored = useRef(false);

  // Dates of a daily trip can be viewed before they are saved; the first
  // seat hold saves them under this same id.
  const trip = useMemo(() => resolveTrip(tripId, data), [tripId, data]);
  const schedule = trip?.scheduleId ? data.schedules.find((s) => s.id === trip.scheduleId && s.status === 'Active') : null;

  // Restore this tab's own active hold (e.g. when returning to change seats).
  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    const token = sessionGet(holdKey(tripId));
    const hold = token ? getHoldByToken(token, data.holds) : null;
    if (hold && hold.tripId === tripId && isHoldActive(hold)) {
      setOwnToken(token);
      setSelected(hold.seatIds);
    } else if (token) {
      sessionSet(holdKey(tripId), null);
    }
    const flash = sessionGet(flashKey);
    if (flash) {
      setNotice(flash);
      sessionSet(flashKey, null);
    }
  }, [ready, tripId, data.holds]);

  const availability = useMemo(() => (trip ? getSeatAvailability(trip, data, { now, holdToken: ownToken }) : null), [trip, data, now, ownToken]);

  // If someone else books or holds a seat we had selected, drop it and say so.
  useEffect(() => {
    if (!availability) return;
    const lost = selected.filter((id) => availability.states[id] !== 'available');
    if (lost.length) {
      setSelected((s) => s.filter((id) => !lost.includes(id)));
      setNotice(`Seat${lost.length > 1 ? 's' : ''} ${sortSeatIds(lost).join(', ')} ${lost.length > 1 ? 'were' : 'was'} just taken by another passenger. Please choose another seat.`);
    }
  }, [availability, selected]);

  if (!ready) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6" aria-busy="true">
        <div className="h-28 animate-pulse rounded-xl bg-slate-200/70" />
        <div className="mt-4 h-96 animate-pulse rounded-xl bg-slate-200/70" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <EmptyState icon={TriangleAlert} title="Trip not found" description="This trip does not exist in this browser. It may have been removed by the operator." action={<Button href="/" variant="secondary" icon={ArrowLeft}>Back to all trips</Button>} />
      </div>
    );
  }

  const unavailable = tripUnavailableReason(trip, now);
  const firstDate = schedule && (schedule.startDate > todayKey() ? schedule.startDate : todayKey());
  const sorted = sortSeatIds(selected);
  const total = Math.round(trip.fare * selected.length * 100) / 100;

  const toggleSeat = (seatId, state) => {
    setNotice('');
    if (state === 'selected') {
      setSelected((s) => s.filter((id) => id !== seatId));
      return;
    }
    if (state !== 'available') return;
    if (selected.length >= MAX_SEATS_PER_BOOKING) {
      setNotice(`You can book up to ${MAX_SEATS_PER_BOOKING} seats in one booking.`);
      return;
    }
    setSelected((s) => [...s, seatId]);
  };

  const proceed = () => {
    if (busy || !selected.length) return;
    setBusy(true);
    const res = createHold({ tripId, seatIds: selected, replaceToken: ownToken });
    if (!res.ok) {
      setBusy(false);
      setNotice(res.message);
      if (res.conflicts) setSelected((s) => s.filter((id) => !res.conflicts.some((c) => c.seatId === id)));
      return;
    }
    sessionSet(holdKey(tripId), res.hold.holdToken);
    setOwnToken(res.hold.holdToken);
    router.push(`/trips/${tripId}/book?hold=${encodeURIComponent(res.hold.holdToken)}`);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:pb-10">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-ink">
        <ArrowLeft size={16} aria-hidden="true" /> All trips
      </Link>
      <TripHeader trip={trip} />

      {schedule ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <Repeat size={16} className="text-brand-700" aria-hidden="true" />
            {runsEveryDay(schedule) ? 'This bus runs daily' : `This bus runs every ${formatWeekdays(scheduleWeekdays(schedule))}`}
          </span>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Travel date
            {runsEveryDay(schedule) ? (
              <input
                type="date"
                min={firstDate}
                value={dateKeyOf(trip.departureAt)}
                onChange={(e) => e.target.value >= firstDate && router.push(`/trips/${occurrenceId(schedule.id, e.target.value)}`)}
                className={inputClasses(false, 'h-9 w-auto')}
              />
            ) : (
              // Only the days it runs can be picked, so list them.
              <select
                value={dateKeyOf(trip.departureAt)}
                onChange={(e) => router.push(`/trips/${occurrenceId(schedule.id, e.target.value)}`)}
                className={inputClasses(false, 'h-9 w-auto pr-8')}
              >
                {[...new Set([dateKeyOf(trip.departureAt), ...upcomingRunDates(schedule, firstDate, 26)])].sort().map((d) => (
                  <option key={d} value={d}>
                    {formatDateLong(d)}
                  </option>
                ))}
              </select>
            )}
          </label>
        </div>
      ) : null}

      {unavailable ? (
        <Alert tone="warning" icon={TriangleAlert} className="mt-4" title="Booking closed">
          {unavailable}{' '}
          <Link href="/" className="font-medium underline">
            See other trips
          </Link>
        </Alert>
      ) : (
        <>
          <ol className="mt-5 flex items-center gap-2 text-xs font-medium text-slate-500" aria-label="Booking steps">
            <li className="rounded-full bg-ink px-2.5 py-1 text-white">1. Select seats</li>
            <li aria-hidden="true">›</li>
            <li className="rounded-full bg-slate-200 px-2.5 py-1">2. Passenger details</li>
            <li aria-hidden="true">›</li>
            <li className="rounded-full bg-slate-200 px-2.5 py-1">3. Confirm</li>
          </ol>

          {notice ? (
            <Alert
              tone="warning"
              icon={TriangleAlert}
              className="mt-4"
              action={
                <button type="button" onClick={() => setNotice('')} aria-label="Dismiss" className="text-amber-800">
                  <X size={16} />
                </button>
              }
            >
              {notice}
            </Alert>
          ) : null}

          <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby="seat-heading">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="seat-heading" className="text-base font-semibold">
                  Choose your seats
                </h2>
                <span className="text-sm text-slate-500">
                  <strong className="text-emerald-700">{availability.available}</strong> of {availability.sellable} seats available
                </span>
              </div>
              <SeatMap layout={trip.seatLayoutSnapshot} states={availability.states} selected={selected} onSeatClick={toggleSeat} mode="book" />
              <SeatLegend className="mt-5 justify-center" />
            </section>

            <aside className="hidden lg:block">
              <div className="sticky top-20 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-base font-semibold">Your selection</h2>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Seats</dt>
                    <dd className="text-right font-medium">{sorted.length ? sorted.join(', ') : '—'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Fare per seat</dt>
                    <dd className="tabular">{formatINR(trip.fare)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Passengers</dt>
                    <dd className="tabular">{selected.length}</dd>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-semibold">
                    <dt>Total fare</dt>
                    <dd className="tabular">{formatINR(total)}</dd>
                  </div>
                </dl>
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Payment: pay the operator later. No online payment.</p>
                <Button block size="lg" className="mt-4" onClick={proceed} disabled={!selected.length || busy} icon={ArrowRight}>
                  {busy ? 'Holding seats…' : 'Continue'}
                </Button>
                <p className="mt-2 text-center text-xs text-slate-500">Seats are held for 5 minutes while you enter details.</p>
              </div>
            </aside>
          </div>

          {/* Mobile summary bar */}
          <div className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] lg:hidden">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-xs text-slate-500">
                  {sorted.length ? `Seats ${sorted.join(', ')} · ${formatINR(trip.fare)} each` : 'Tap seats to select'}
                </div>
                <div className="text-lg font-bold tabular">{formatINR(total)}</div>
              </div>
              <Button size="lg" onClick={proceed} disabled={!selected.length || busy}>
                {busy ? 'Holding…' : `Continue${selected.length ? ` (${selected.length})` : ''}`}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
