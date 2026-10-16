'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, Search, BusFront, RotateCcw, ShieldCheck, Clock, Wallet } from 'lucide-react';
import TripCard from '../TripCard';
import Button from '../ui/Button';
import { inputClasses } from '../ui/Field';
import { EmptyState } from '../ui/Misc';
import { useAppData, useNow } from '@/lib/hooks/use-app-data';
import { isTripBookable, getSeatAvailability } from '@/lib/booking-service';
import { dateKeyOf, todayKey, parseLocalDateTime } from '@/lib/dates';
import { formatDateLong, pluralize } from '@/lib/formatters';

const TIME_SLOTS = [
  { value: '', label: 'Any time' },
  { value: 'morning', label: 'Morning (6 am – 12 pm)', from: 6, to: 12 },
  { value: 'afternoon', label: 'Afternoon (12 – 6 pm)', from: 12, to: 18 },
  { value: 'evening', label: 'Evening (6 – 11 pm)', from: 18, to: 23 },
  { value: 'night', label: 'Night (11 pm – 6 am)', from: 23, to: 6 },
];

const norm = (s) => String(s || '').trim().toLowerCase();

export default function TripSearch() {
  const { ready, data } = useAppData();
  const now = useNow(30000);
  const [query, setQuery] = useState({ from: '', to: '', date: '' });
  const [applied, setApplied] = useState({ from: '', to: '', date: '' });
  const [busType, setBusType] = useState('');
  const [slot, setSlot] = useState('');
  const [sort, setSort] = useState('departure');

  const bookable = useMemo(() => data.trips.filter((t) => isTripBookable(t, now)), [data.trips, now]);
  const cities = useMemo(() => [...new Set(bookable.flatMap((t) => [t.routeSnapshot.source, t.routeSnapshot.destination]))].sort(), [bookable]);
  const busTypes = useMemo(() => [...new Set(bookable.map((t) => t.busSnapshot.type))].sort(), [bookable]);

  const results = useMemo(() => {
    const s = TIME_SLOTS.find((x) => x.value === slot);
    return bookable
      .filter((t) => {
        if (applied.from && !norm(t.routeSnapshot.source).includes(norm(applied.from))) return false;
        if (applied.to && !norm(t.routeSnapshot.destination).includes(norm(applied.to))) return false;
        if (applied.date && dateKeyOf(t.departureAt) !== applied.date) return false;
        if (busType && t.busSnapshot.type !== busType) return false;
        if (s?.value) {
          const h = parseLocalDateTime(t.departureAt).getHours();
          const inSlot = s.from < s.to ? h >= s.from && h < s.to : h >= s.from || h < s.to;
          if (!inSlot) return false;
        }
        return true;
      })
      .map((t) => ({ trip: t, availability: getSeatAvailability(t, data, { now }) }))
      .sort((a, b) => {
        if (sort === 'fare') return a.trip.fare - b.trip.fare || a.trip.departureAt.localeCompare(b.trip.departureAt);
        if (sort === 'seats') return b.availability.available - a.availability.available;
        return a.trip.departureAt.localeCompare(b.trip.departureAt);
      });
  }, [bookable, applied, busType, slot, sort, data, now]);

  const submit = (e) => {
    e.preventDefault();
    setApplied(query);
  };
  const clear = () => {
    const empty = { from: '', to: '', date: '' };
    setQuery(empty);
    setApplied(empty);
    setBusType('');
    setSlot('');
  };
  const filtered = applied.from || applied.to || applied.date || busType || slot;

  return (
    <>
      <section className="bg-ink text-white">
        <div className="mx-auto max-w-6xl px-4 pb-8 pt-8 sm:px-6 sm:pt-10">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Book your bus seat in minutes</h1>
          <p className="mt-1 text-sm text-slate-300">Choose your exact seat. Pay the operator later — no online payment needed.</p>
          <form onSubmit={submit} className="mt-6 grid gap-2 rounded-2xl bg-white p-3 text-ink shadow-lg sm:grid-cols-[1fr_auto_1fr_minmax(0,0.8fr)_auto] sm:items-end sm:gap-3 sm:p-4">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">From</span>
              <input list="city-list" value={query.from} onChange={(e) => setQuery((q) => ({ ...q, from: e.target.value }))} placeholder="Leaving from" className={inputClasses(false, 'h-11')} />
            </label>
            <button
              type="button"
              onClick={() => setQuery((q) => ({ ...q, from: q.to, to: q.from }))}
              className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-slate-600 hover:bg-slate-50 sm:mb-1"
              aria-label="Swap source and destination"
            >
              <ArrowLeftRight size={16} />
            </button>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">To</span>
              <input list="city-list" value={query.to} onChange={(e) => setQuery((q) => ({ ...q, to: e.target.value }))} placeholder="Going to" className={inputClasses(false, 'h-11')} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Travel date</span>
              <input type="date" min={todayKey()} value={query.date} onChange={(e) => setQuery((q) => ({ ...q, date: e.target.value }))} className={inputClasses(false, 'h-11')} />
            </label>
            <Button type="submit" size="lg" icon={Search} className="h-11">
              Search
            </Button>
            <datalist id="city-list">
              {cities.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </form>
          <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-300">
            <li className="flex items-center gap-1.5">
              <ShieldCheck size={14} aria-hidden="true" /> Instant booking confirmation
            </li>
            <li className="flex items-center gap-1.5">
              <Clock size={14} aria-hidden="true" /> Seats held for 5 minutes while you book
            </li>
            <li className="flex items-center gap-1.5">
              <Wallet size={14} aria-hidden="true" /> Pay the operator later
            </li>
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {!ready ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl bg-slate-200/70" />
            ))}
          </div>
        ) : bookable.length === 0 ? (
          <EmptyState
            icon={BusFront}
            title="No trips are open for booking yet"
            description="The operator needs to create routes, buses and trips in the admin dashboard. Once a trip is scheduled it appears here."
            action={
              <Link href="/admin" className="text-sm font-medium text-brand-700 hover:underline">
                Go to operator admin →
              </Link>
            }
          />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {applied.from || applied.to ? `${applied.from || 'Any'} → ${applied.to || 'Any'}` : 'Available trips'}
                </h2>
                <p className="text-sm text-slate-500">
                  {pluralize(results.length, 'trip')} {applied.date ? `on ${formatDateLong(applied.date)}` : 'upcoming'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select aria-label="Bus type" value={busType} onChange={(e) => setBusType(e.target.value)} className={inputClasses(false, 'h-9 w-auto')}>
                  <option value="">All bus types</option>
                  {busTypes.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <select aria-label="Departure time" value={slot} onChange={(e) => setSlot(e.target.value)} className={inputClasses(false, 'h-9 w-auto')}>
                  {TIME_SLOTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value)} className={inputClasses(false, 'h-9 w-auto')}>
                  <option value="departure">Sort: Earliest departure</option>
                  <option value="fare">Sort: Lowest fare</option>
                  <option value="seats">Sort: Most seats</option>
                </select>
                {filtered ? (
                  <Button size="sm" variant="ghost" icon={RotateCcw} onClick={clear}>
                    Clear
                  </Button>
                ) : null}
              </div>
            </div>
            {results.length === 0 ? (
              <EmptyState icon={Search} title="No trips match your search" description="Try another date, remove a filter, or check the spelling of the city." action={<Button variant="secondary" onClick={clear}>Show all trips</Button>} />
            ) : (
              <div className="space-y-3">
                {results.map(({ trip, availability }) => (
                  <TripCard key={trip.id} trip={trip} availability={availability} />
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
