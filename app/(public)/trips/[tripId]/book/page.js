'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Timer, TriangleAlert, CircleCheck, Pencil } from 'lucide-react';
import TripHeader from '@/components/public/TripHeader';
import PassengerForm from '@/components/PassengerForm';
import BookingSummary from '@/components/BookingSummary';
import Button from '@/components/ui/Button';
import { Alert, EmptyState } from '@/components/ui/Misc';
import { useAppData, useNow } from '@/lib/hooks/use-app-data';
import { createBooking, createHold, getHoldByToken, validateBookingDetails, tripUnavailableReason } from '@/lib/booking-service';
import { sortSeatIds } from '@/lib/seat-service';
import { sessionSet, holdKey, flashKey } from '@/lib/session';
import { normalizeIndianMobile } from '@/lib/validators';
import { formatCountdown, formatINR } from '@/lib/formatters';
import { dateKeyOf, timeOf } from '@/lib/dates';

function Steps({ step }) {
  const items = ['Select seats', 'Passenger details', 'Review & confirm'];
  const current = step === 'details' ? 1 : 2;
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500" aria-label="Booking steps">
      {items.map((label, i) => (
        <li key={label} className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 ${i === current ? 'bg-ink text-white' : i < current ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200'}`} aria-current={i === current ? 'step' : undefined}>
            {i + 1}. {label}
          </span>
          {i < items.length - 1 ? <span aria-hidden="true">›</span> : null}
        </li>
      ))}
    </ol>
  );
}

export default function BookPage() {
  const { tripId } = useParams();
  const router = useRouter();
  const { ready, data } = useAppData();
  const now = useNow(1000);
  const [token, setToken] = useState(null);
  const [tokenRead, setTokenRead] = useState(false);
  const [step, setStep] = useState('details');
  const [form, setForm] = useState({ passengers: {}, contactName: '', contactNumber: '' });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null); // { message, conflict }
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('hold'));
    setTokenRead(true);
  }, []);

  const trip = data.trips.find((t) => t.id === tripId);
  const hold = token ? getHoldByToken(token, data.holds) : null;
  const booked = hold ? data.bookings.find((b) => b.holdToken === token) : null;

  // A hold that already produced a booking (e.g. back button after confirming).
  useEffect(() => {
    if (booked && !submittingRef.current) router.replace(`/booking/${booked.id}`);
  }, [booked, router]);

  if (!ready || !tokenRead) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6" aria-busy="true">
        <div className="h-28 animate-pulse rounded-xl bg-slate-200/70" />
        <div className="mt-4 h-96 animate-pulse rounded-xl bg-slate-200/70" />
      </div>
    );
  }

  const backToSeats = (
    <Button href={`/trips/${tripId}`} variant="secondary" icon={ArrowLeft}>
      Choose seats
    </Button>
  );

  if (!trip) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <EmptyState icon={TriangleAlert} title="Trip not found" action={<Button href="/" variant="secondary">All trips</Button>} />
      </div>
    );
  }
  if (!hold || hold.tripId !== tripId || hold.status === 'released') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <EmptyState icon={TriangleAlert} title="Seat selection not found" description="Your seat selection may have been changed or released. Please choose your seats again." action={backToSeats} />
      </div>
    );
  }
  if (booked) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-slate-600 sm:px-6" role="status">
        Booking confirmed — opening your booking…
      </div>
    );
  }

  const unavailable = tripUnavailableReason(trip, now);
  const seatIds = sortSeatIds(hold.seatIds);
  const remaining = new Date(hold.expiresAt).getTime() - now;
  const expired = hold.status !== 'active' || remaining <= 0;
  const passengers = seatIds.map((seatId) => ({ seatId, ...(form.passengers[seatId] || {}) }));
  const total = Math.round(trip.fare * seatIds.length * 100) / 100;

  const draftBooking = {
    routeSnapshot: trip.routeSnapshot,
    busSnapshot: trip.busSnapshot,
    departureAt: trip.departureAt,
    arrivalAt: trip.arrivalAt,
    travelDate: dateKeyOf(trip.departureAt),
    departureTime: timeOf(trip.departureAt),
    seatIds,
    passengers: passengers.map((p) => ({ ...p, name: (p.name || '').trim() })),
    contactNumber: normalizeIndianMobile(form.contactNumber)?.national || form.contactNumber,
    farePerSeat: trip.fare,
    totalFare: total,
    paymentStatus: 'Unpaid',
  };

  const review = (e) => {
    e.preventDefault();
    const errs = validateBookingDetails({ seatIds, passengers, contactNumber: form.contactNumber, contactName: form.contactName });
    setErrors(errs);
    if (Object.keys(errs).length) {
      setTimeout(() => document.querySelector('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setSubmitError(null);
    setStep('review');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const rehold = () => {
    const res = createHold({ tripId, seatIds, replaceToken: token });
    if (!res.ok) {
      setSubmitError({ message: res.message, conflict: res.code === 'SEATS_UNAVAILABLE' });
      return;
    }
    const next = res.hold.holdToken;
    sessionSet(holdKey(tripId), next);
    setToken(next);
    setSubmitError(null);
    window.history.replaceState(window.history.state, '', `/trips/${tripId}/book?hold=${encodeURIComponent(next)}`);
  };

  const confirm = () => {
    // Guards against double clicks; createBooking is also idempotent per hold.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    const res = createBooking({ holdToken: token, tripId, seatIds, passengers, contactNumber: form.contactNumber, contactName: form.contactName });
    if (res.ok) {
      sessionSet(holdKey(tripId), null);
      router.push(`/booking/${res.booking.id}`);
      return;
    }
    submittingRef.current = false;
    setSubmitting(false);
    if (res.code === 'INVALID') {
      setErrors(res.errors);
      setStep('details');
      return;
    }
    setSubmitError({ message: res.message, conflict: res.code === 'SEATS_UNAVAILABLE' });
  };

  const goChangeSeats = (message) => {
    if (message) sessionSet(flashKey, message);
    router.push(`/trips/${tripId}`);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 pt-6 sm:px-6">
      <Link href={`/trips/${tripId}`} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-ink">
        <ArrowLeft size={16} aria-hidden="true" /> Change seats
      </Link>
      <TripHeader trip={trip} />
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Steps step={step} />
        {!unavailable ? (
          <div
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium tabular ${expired ? 'bg-red-50 text-red-700' : remaining < 60000 ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700'}`}
            role="timer"
            aria-live="off"
          >
            <Timer size={15} aria-hidden="true" />
            {expired ? 'Seat hold expired' : `Seats held for ${formatCountdown(remaining)}`}
          </div>
        ) : null}
      </div>

      {unavailable ? (
        <Alert tone="danger" icon={TriangleAlert} className="mt-4" title="Booking closed">
          {unavailable}
        </Alert>
      ) : expired ? (
        <Alert
          tone="warning"
          icon={TriangleAlert}
          className="mt-4"
          title="Your seat hold has expired"
          action={
            <Button size="sm" variant="secondary" onClick={rehold}>
              Hold seats again
            </Button>
          }
        >
          Seats {seatIds.join(', ')} are no longer reserved for you and other passengers may book them. Hold them again, or confirm now — we recheck
          availability before booking.
        </Alert>
      ) : null}

      {submitError ? (
        <Alert
          tone="danger"
          icon={TriangleAlert}
          className="mt-4"
          title={submitError.conflict ? 'Some seats are no longer available' : 'Booking not completed'}
          action={
            submitError.conflict ? (
              <Button size="sm" variant="secondary" onClick={() => goChangeSeats(submitError.message)}>
                Choose other seats
              </Button>
            ) : null
          }
        >
          {submitError.message} Your details are kept.
        </Alert>
      ) : null}

      {!unavailable ? (
        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            {step === 'details' ? (
              <form onSubmit={review} noValidate>
                <PassengerForm seatIds={seatIds} value={form} onChange={setForm} errors={errors} />
                {Object.keys(errors).length ? <p className="mt-4 text-sm font-medium text-red-600">Please correct the highlighted fields.</p> : null}
                <div className="mt-6 flex flex-wrap justify-between gap-3">
                  <Button variant="secondary" onClick={() => goChangeSeats()} icon={ArrowLeft}>
                    Change seats
                  </Button>
                  <Button type="submit" size="lg">
                    Review booking
                  </Button>
                </div>
              </form>
            ) : (
              <div>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold">Review your booking</h2>
                  <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setStep('details')}>
                    Edit details
                  </Button>
                </div>
                <BookingSummary booking={draftBooking} />
                <p className="mt-4 text-xs text-slate-500">
                  By confirming, your seats are booked immediately. No online payment is taken — pay the operator later. A booking confirmation message
                  will be prepared for WhatsApp.
                </p>
                <div className="mt-5 flex flex-wrap justify-between gap-3">
                  <Button variant="secondary" onClick={() => setStep('details')} icon={ArrowLeft}>
                    Back
                  </Button>
                  <Button size="lg" variant="success" icon={CircleCheck} onClick={confirm} disabled={submitting}>
                    {submitting ? 'Confirming…' : 'Confirm Booking'}
                  </Button>
                </div>
              </div>
            )}
          </section>
          <aside>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-20">
              <h2 className="text-sm font-semibold">Fare summary</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Seats</dt>
                  <dd className="text-right font-medium">{seatIds.join(', ')}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Fare per seat</dt>
                  <dd className="tabular">{formatINR(trip.fare)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Passengers</dt>
                  <dd className="tabular">{seatIds.length}</dd>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular">{formatINR(total)}</dd>
                </div>
              </dl>
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Payment status: Pay the operator later.</p>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
