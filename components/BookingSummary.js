import { formatINR, formatDateLong, formatTime, formatPhone } from '@/lib/formatters';
import { sortSeatIds } from '@/lib/seat-service';
import { normalizeIndianMobile } from '@/lib/validators';
import { StatusBadge } from './ui/Badge';

/**
 * Journey + passenger + fare summary used for the final review and the
 * booking receipt. Accepts a booking-shaped object.
 */
export default function BookingSummary({ booking, showStatus = false }) {
  const r = booking.routeSnapshot;
  const seats = sortSeatIds(booking.seatIds);
  const phone = normalizeIndianMobile(booking.contactNumber);
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Route</dt>
          <dd className="mt-0.5 text-base font-semibold">
            {r.source} → {r.destination}
          </dd>
          {r.stops?.length ? <dd className="text-xs text-slate-500">via {r.stops.join(', ')}</dd> : null}
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Travel date</dt>
          <dd className="mt-0.5 font-medium">{formatDateLong(booking.departureAt)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Departure</dt>
          <dd className="mt-0.5 font-medium tabular">{formatTime(booking.departureAt)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Arrival (est.)</dt>
          <dd className="mt-0.5 font-medium tabular">{formatTime(booking.arrivalAt)}</dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Bus</dt>
          <dd className="mt-0.5">
            {booking.busSnapshot.name} <span className="text-slate-500">· {booking.busSnapshot.registrationNumber}</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Seats</dt>
          <dd className="mt-0.5 font-medium">{seats.join(', ')}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Contact</dt>
          <dd className="mt-0.5 tabular">{phone ? formatPhone(phone.national) : booking.contactNumber}</dd>
        </div>
      </dl>

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Seat</th>
              <th className="px-3 py-2 font-semibold">Passenger</th>
              <th className="px-3 py-2 font-semibold">Age</th>
              <th className="px-3 py-2 text-right font-semibold">Fare</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {seats.map((seatId) => {
              const p = booking.passengers.find((x) => x.seatId === seatId) || {};
              return (
                <tr key={seatId}>
                  <td className="px-3 py-2 font-medium">{seatId}</td>
                  <td className="px-3 py-2">
                    {p.name || '—'}
                    {p.gender ? <span className="text-xs text-slate-500"> · {p.gender}</span> : null}
                  </td>
                  <td className="px-3 py-2 tabular">{p.age || '—'}</td>
                  <td className="px-3 py-2 text-right tabular">{formatINR(booking.farePerSeat)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <dl className="space-y-1.5 rounded-lg bg-slate-50 p-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-600">Fare per seat</dt>
          <dd className="tabular">{formatINR(booking.farePerSeat)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-600">Number of seats</dt>
          <dd className="tabular">{seats.length}</dd>
        </div>
        <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
          <dt>Total fare</dt>
          <dd className="tabular">{formatINR(booking.totalFare)}</dd>
        </div>
        <div className="flex items-center justify-between pt-1">
          <dt className="text-slate-600">Payment</dt>
          <dd className="flex items-center gap-2">
            {showStatus ? <StatusBadge status={booking.paymentStatus} /> : null}
            <span className="font-medium">{booking.paymentStatus === 'Paid' ? 'Paid to operator' : 'Pay the operator later'}</span>
          </dd>
        </div>
      </dl>
    </div>
  );
}
