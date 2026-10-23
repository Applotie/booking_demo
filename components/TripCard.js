import Link from 'next/link';
import { Armchair, Bus, MapPin, Repeat } from 'lucide-react';
import { formatINR, formatTime, formatDuration, formatDateLong, formatWeekdays } from '@/lib/formatters';
import { runsEveryDay, scheduleWeekdays } from '@/lib/schedule-service';
import { buttonClasses } from './ui/Button';
import Badge from './ui/Badge';
import { tripDurationMinutes } from '@/lib/trip-service';
import { dateKeyOf } from '@/lib/dates';

export default function TripCard({ trip, schedule, availability }) {
  const r = trip.routeSnapshot;
  const sameDay = dateKeyOf(trip.departureAt) === dateKeyOf(trip.arrivalAt);
  const seatsLeft = availability.available;
  const soldOut = seatsLeft === 0;
  return (
    <article className="rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="font-medium text-slate-700">{formatDateLong(trip.departureAt)}</span>
            {trip.scheduleId ? (
              <Badge tone="brand" icon={Repeat}>
                {!schedule || runsEveryDay(schedule) ? 'Runs daily' : `Runs ${formatWeekdays(scheduleWeekdays(schedule))}`}
              </Badge>
            ) : null}
            <span className="flex items-center gap-1">
              <Bus size={13} aria-hidden="true" /> {trip.busSnapshot.name} · {trip.busSnapshot.type}
            </span>
          </div>
          <div className="flex items-center gap-3 sm:gap-5">
            <div>
              <div className="text-xl font-bold tabular text-ink">{formatTime(trip.departureAt)}</div>
              <div className="text-sm font-medium text-slate-700">{r.source}</div>
            </div>
            <div className="flex min-w-16 flex-1 flex-col items-center text-xs text-slate-500">
              <span>{formatDuration(tripDurationMinutes(trip))}</span>
              <span className="my-1 h-px w-full bg-slate-300" aria-hidden="true" />
              <span>{r.stops?.length ? `${r.stops.length} stop${r.stops.length > 1 ? 's' : ''}` : 'Direct'}</span>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold tabular text-ink">
                {formatTime(trip.arrivalAt)}
                {!sameDay ? <sup className="ml-0.5 text-[10px] font-medium text-brand-700">+1</sup> : null}
              </div>
              <div className="text-sm font-medium text-slate-700">{r.destination}</div>
            </div>
          </div>
          {r.stops?.length ? (
            <p className="mt-2 flex items-center gap-1 truncate text-xs text-slate-500">
              <MapPin size={12} aria-hidden="true" className="shrink-0" /> via {r.stops.join(', ')}
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3 sm:w-48 sm:flex-col sm:items-end sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
          <div className="sm:text-right">
            <div className="text-xs text-slate-500">Fare per seat</div>
            <div className="text-2xl font-bold tabular text-ink">{formatINR(trip.fare)}</div>
            <div className={`mt-0.5 flex items-center gap-1 text-xs font-medium sm:justify-end ${soldOut ? 'text-red-600' : seatsLeft <= 5 ? 'text-amber-700' : 'text-emerald-700'}`}>
              <Armchair size={13} aria-hidden="true" />
              {soldOut ? 'Sold out' : `${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} available`}
            </div>
          </div>
          {soldOut ? (
            <span className={buttonClasses({ variant: 'secondary', className: 'pointer-events-none opacity-60' })}>Sold out</span>
          ) : (
            <Link href={`/trips/${trip.id}`} className={buttonClasses({ variant: 'primary' })}>
              Select seats
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
