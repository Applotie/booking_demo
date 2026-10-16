'use client';

import { useMemo, useState, useEffect } from 'react';
import { Search, Ticket, RotateCcw, X } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import DataTable from '@/components/DataTable';
import { PageHeader, EmptyState, Loading, StatCard } from '@/components/ui/Misc';
import { inputClasses } from '@/components/ui/Field';
import BookingDetails from '@/components/admin/BookingDetails';
import { useAppData, useQueryParam } from '@/lib/hooks/use-app-data';
import { summarizeBookings } from '@/lib/reporting-service';
import { normalizeIndianMobile } from '@/lib/validators';
import { sortSeatIds } from '@/lib/seat-service';
import { formatINR, formatDate, formatTime, formatDateTime, formatPhone, pluralize } from '@/lib/formatters';
import { BOOKING_STATUSES, PAYMENT_STATUSES } from '@/lib/constants';

const EMPTY_FILTERS = { q: '', busId: '', routeId: '', travelDate: '', bookingStatus: '', paymentStatus: '', tripId: '' };

export default function BookingsPage() {
  const { ready, data } = useAppData();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [openId, setOpenId] = useState(null);
  const tripParam = useQueryParam('trip');
  const openParam = useQueryParam('open');

  useEffect(() => {
    if (tripParam) setFilters((f) => ({ ...f, tripId: tripParam }));
  }, [tripParam]);
  useEffect(() => {
    if (openParam) setOpenId(openParam);
  }, [openParam]);

  const rows = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const qDigits = normalizeIndianMobile(filters.q)?.national || filters.q.replace(/\D/g, '');
    return data.bookings
      .filter((b) => {
        if (filters.tripId && b.tripId !== filters.tripId) return false;
        if (filters.busId && b.busId !== filters.busId) return false;
        if (filters.routeId && b.routeId !== filters.routeId) return false;
        if (filters.travelDate && b.travelDate !== filters.travelDate) return false;
        if (filters.bookingStatus && b.bookingStatus !== filters.bookingStatus) return false;
        if (filters.paymentStatus && b.paymentStatus !== filters.paymentStatus) return false;
        if (q) {
          const refMatch = b.bookingReference.toLowerCase().includes(q);
          const phoneMatch = qDigits.length >= 3 && b.contactNumber.includes(qDigits);
          const nameMatch = b.passengers.some((p) => p.name.toLowerCase().includes(q)) || (b.contactName || '').toLowerCase().includes(q);
          if (!refMatch && !phoneMatch && !nameMatch) return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [data.bookings, filters]);

  if (!ready) return <Loading />;

  const summary = summarizeBookings(rows);
  const open = openId ? data.bookings.find((b) => b.id === openId) : null;
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const anyFilter = Object.values(filters).some(Boolean);
  const tripFilter = filters.tripId ? data.trips.find((t) => t.id === filters.tripId) : null;

  const columns = [
    {
      key: 'ref',
      header: 'Booking',
      render: (b) => (
        <div>
          <button type="button" onClick={() => setOpenId(b.id)} className="font-mono font-semibold text-brand-700 hover:underline">
            {b.bookingReference}
          </button>
          <div className="text-xs text-slate-500">{formatDateTime(b.createdAt)}</div>
        </div>
      ),
    },
    {
      key: 'trip',
      header: 'Trip',
      render: (b) => (
        <div>
          <div className="font-medium">
            {b.routeSnapshot.source} → {b.routeSnapshot.destination}
          </div>
          <div className="text-xs text-slate-500">
            {formatDate(b.travelDate)} · {formatTime(b.departureAt)} · {b.busSnapshot.name}
          </div>
        </div>
      ),
    },
    {
      key: 'passengers',
      header: 'Passengers',
      hideBelow: 'md',
      render: (b) => (
        <div className="max-w-56">
          <div className="truncate">{b.passengers.map((p) => p.name).join(', ')}</div>
          <div className="text-xs text-slate-500">
            {pluralize(b.passengers.length, 'passenger')} · Seats {sortSeatIds(b.seatIds).join(', ')}
          </div>
        </div>
      ),
    },
    { key: 'contact', header: 'Contact', hideBelow: 'lg', render: (b) => <span className="whitespace-nowrap tabular">{formatPhone(b.contactNumber)}</span> },
    { key: 'total', header: 'Total', align: 'right', render: (b) => <span className={`tabular ${b.bookingStatus === 'Cancelled' ? 'text-slate-400 line-through' : ''}`}>{formatINR(b.totalFare)}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (b) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={b.bookingStatus} />
          <StatusBadge status={b.paymentStatus} />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Bookings" description="Passenger bookings with payment status and WhatsApp messages. Cancelled bookings stay in history." />
      {data.bookings.length === 0 ? (
        <EmptyState icon={Ticket} title="No bookings yet" description="Bookings appear here as soon as passengers confirm them on the public site." action={<Button href="/" variant="secondary">Open public site</Button>} />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Confirmed bookings" value={summary.confirmedCount} hint={`${summary.seatsBooked} seats · ${summary.cancelledCount} cancelled`} />
            <StatCard label="Booking value" value={formatINR(summary.bookingValue)} hint="Confirmed bookings only" />
            <StatCard label="Received" value={formatINR(summary.paidAmount)} tone="success" />
            <StatCard label="Outstanding" value={formatINR(summary.unpaidAmount)} tone={summary.unpaidAmount > 0 ? 'warning' : 'neutral'} />
          </div>
          <Card bodyClassName="p-0">
            <div className="space-y-2 border-b border-slate-100 p-3">
              <div className="flex flex-wrap gap-2">
                <div className="relative min-w-56 flex-1">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <input aria-label="Search bookings" placeholder="Booking ID, mobile number or passenger name" value={filters.q} onChange={set('q')} className={inputClasses(false, 'h-9 pl-9')} />
                </div>
                <input type="date" aria-label="Travel date" value={filters.travelDate} onChange={set('travelDate')} className={inputClasses(false, 'h-9 w-auto')} />
              </div>
              <div className="flex flex-wrap gap-2">
                <select aria-label="Bus" value={filters.busId} onChange={set('busId')} className={inputClasses(false, 'h-9 w-auto')}>
                  <option value="">All buses</option>
                  {data.buses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <select aria-label="Route" value={filters.routeId} onChange={set('routeId')} className={inputClasses(false, 'h-9 w-auto')}>
                  <option value="">All routes</option>
                  {data.routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <select aria-label="Booking status" value={filters.bookingStatus} onChange={set('bookingStatus')} className={inputClasses(false, 'h-9 w-auto')}>
                  <option value="">Any booking status</option>
                  {BOOKING_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <select aria-label="Payment status" value={filters.paymentStatus} onChange={set('paymentStatus')} className={inputClasses(false, 'h-9 w-auto')}>
                  <option value="">Any payment status</option>
                  {PAYMENT_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                {anyFilter ? (
                  <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setFilters(EMPTY_FILTERS)} className="h-9">
                    Reset
                  </Button>
                ) : null}
              </div>
              {tripFilter ? (
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs">
                  Trip: {tripFilter.routeSnapshot.source} → {tripFilter.routeSnapshot.destination}, {formatDateTime(tripFilter.departureAt)}
                  <button type="button" onClick={() => setFilters((f) => ({ ...f, tripId: '' }))} aria-label="Remove trip filter">
                    <X size={12} />
                  </button>
                </div>
              ) : null}
            </div>
            <DataTable columns={columns} rows={rows} onRowClick={(b) => setOpenId(b.id)} emptyMessage="No bookings match these filters." />
          </Card>
        </>
      )}
      {open ? <BookingDetails booking={open} notifications={data.notifications} onClose={() => setOpenId(null)} /> : null}
    </>
  );
}
