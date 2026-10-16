import { Bus, MapPin, Clock } from 'lucide-react';
import { formatDateLong, formatTime, formatDuration } from '@/lib/formatters';
import { tripDurationMinutes } from '@/lib/trip-service';

export default function TripHeader({ trip }) {
  const r = trip.routeSnapshot;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-brand-700">{formatDateLong(trip.departureAt)}</div>
          <h1 className="mt-1 text-xl font-bold text-ink sm:text-2xl">
            {r.source} → {r.destination}
          </h1>
          <p className="text-sm text-slate-500">{r.name}</p>
        </div>
        <div className="text-right text-sm">
          <div className="font-semibold tabular">
            {formatTime(trip.departureAt)} – {formatTime(trip.arrivalAt)}
          </div>
          <div className="flex items-center justify-end gap-1 text-slate-500">
            <Clock size={13} aria-hidden="true" /> {formatDuration(tripDurationMinutes(trip))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 pt-3 text-sm text-slate-600">
        <span className="flex items-center gap-1.5">
          <Bus size={15} aria-hidden="true" /> {trip.busSnapshot.name} · {trip.busSnapshot.type}
        </span>
        {r.stops?.length ? (
          <span className="flex items-center gap-1.5">
            <MapPin size={15} aria-hidden="true" /> via {r.stops.join(', ')}
          </span>
        ) : null}
      </div>
    </div>
  );
}
