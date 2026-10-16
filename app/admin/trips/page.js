'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Pencil, CircleCheck, Undo2, Ban, RefreshCw, Ticket, ExternalLink, Trash2, CalendarClock } from 'lucide-react';
import Button, { IconButton } from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge, { StatusBadge } from '@/components/ui/Badge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DataTable from '@/components/DataTable';
import { PageHeader, EmptyState, Loading } from '@/components/ui/Misc';
import { inputClasses } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import TripForm from '@/components/admin/TripForm';
import CancelTripDialog from '@/components/admin/CancelTripDialog';
import { useAppData, useQueryParam } from '@/lib/hooks/use-app-data';
import { setTripStatus, syncTripLayout, deleteTrip, isLayoutOutOfDate } from '@/lib/trip-service';
import { tripStats } from '@/lib/reporting-service';
import { parseLocalDateTime } from '@/lib/dates';
import { formatINR, formatDateLong, formatTime, formatPercent } from '@/lib/formatters';
import { TRIP_STATUSES } from '@/lib/constants';

export default function TripsPage() {
  const { ready, data } = useAppData();
  const toast = useToast();
  const [editing, setEditing] = useState(undefined);
  const [cancelling, setCancelling] = useState(null);
  const [confirm, setConfirm] = useState(null); // { kind, trip }
  const [filters, setFilters] = useState({ when: 'upcoming', status: '', busId: '', routeId: '' });
  const newParam = useQueryParam('new', { consume: true });

  useEffect(() => {
    if (newParam === '1') setEditing(null);
  }, [newParam]);

  const rows = useMemo(() => {
    const now = Date.now();
    return data.trips
      .filter((t) => {
        const dep = parseLocalDateTime(t.departureAt)?.getTime() || 0;
        if (filters.when === 'upcoming' && dep <= now) return false;
        if (filters.when === 'past' && dep > now) return false;
        if (filters.status && t.status !== filters.status) return false;
        if (filters.busId && t.busId !== filters.busId) return false;
        if (filters.routeId && t.routeId !== filters.routeId) return false;
        return true;
      })
      .sort((a, b) => (filters.when === 'past' ? b.departureAt.localeCompare(a.departureAt) : a.departureAt.localeCompare(b.departureAt)))
      .map((t) => ({ ...t, stats: tripStats(t, data.bookings), bus: data.buses.find((b) => b.id === t.busId) }));
  }, [data, filters]);

  if (!ready) return <Loading />;

  const canSchedule = data.routes.some((r) => r.isActive) && data.buses.some((b) => b.operationalStatus === 'Active');
  const setFilter = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  const runConfirm = () => {
    const { kind, trip } = confirm;
    let res;
    if (kind === 'complete') res = setTripStatus(trip.id, 'Completed');
    else if (kind === 'reopen') res = setTripStatus(trip.id, 'Scheduled');
    else if (kind === 'sync') res = syncTripLayout(trip.id);
    else if (kind === 'delete') res = deleteTrip(trip.id);
    if (res.ok) toast.success({ complete: 'Trip marked completed.', reopen: 'Trip reopened.', sync: 'Trip seat layout updated from the bus.', delete: 'Trip deleted.' }[kind]);
    else toast.error(res.message);
    setConfirm(null);
  };

  const columns = [
    {
      key: 'when',
      header: 'Departure',
      render: (t) => (
        <div className="whitespace-nowrap">
          <div className="font-medium">{formatDateLong(t.departureAt)}</div>
          <div className="text-xs text-slate-500">
            {formatTime(t.departureAt)} → {formatTime(t.arrivalAt)}
          </div>
        </div>
      ),
    },
    {
      key: 'route',
      header: 'Route',
      render: (t) => (
        <div>
          <div className="font-medium">
            {t.routeSnapshot.source} → {t.routeSnapshot.destination}
          </div>
          <div className="text-xs text-slate-500">{t.routeSnapshot.name}</div>
        </div>
      ),
    },
    {
      key: 'bus',
      header: 'Bus',
      hideBelow: 'md',
      render: (t) => (
        <Link href={`/admin/buses/${t.busId}`} className="hover:text-brand-700">
          <div>{t.busSnapshot.name}</div>
          <div className="font-mono text-xs text-slate-500">{t.busSnapshot.registrationNumber}</div>
        </Link>
      ),
    },
    { key: 'fare', header: 'Fare', align: 'right', render: (t) => <span className="tabular">{formatINR(t.fare)}</span> },
    {
      key: 'seats',
      header: 'Booked',
      align: 'right',
      render: (t) => (
        <div className="tabular">
          <div>
            {t.stats.seatsBooked}/{t.stats.sellable}
          </div>
          <div className="text-xs text-slate-500">{formatPercent(t.stats.occupancy, 0)}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={t.status} />
          {t.status === 'Scheduled' && isLayoutOutOfDate(t, t.bus) ? <Badge tone="info">Bus layout changed</Badge> : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (t) => (
        <div className="flex flex-wrap justify-end gap-0.5">
          {t.status === 'Scheduled' ? (
            <>
              <IconButton icon={Pencil} label="Edit trip" onClick={() => setEditing(t)} />
              <IconButton icon={CircleCheck} label="Mark completed" onClick={() => setConfirm({ kind: 'complete', trip: t })} />
              {isLayoutOutOfDate(t, t.bus) ? <IconButton icon={RefreshCw} label="Apply current bus layout" onClick={() => setConfirm({ kind: 'sync', trip: t })} /> : null}
              <IconButton icon={Ban} label="Cancel trip" variant="danger-ghost" onClick={() => setCancelling(t)} />
            </>
          ) : null}
          {t.status === 'Completed' ? <IconButton icon={Undo2} label="Reopen trip" onClick={() => setConfirm({ kind: 'reopen', trip: t })} /> : null}
          <Link href={`/admin/bookings?trip=${t.id}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100" title="View bookings" aria-label="View bookings">
            <Ticket size={16} />
          </Link>
          {t.status === 'Scheduled' ? (
            <Link href={`/trips/${t.id}`} target="_blank" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100" title="Open public booking page" aria-label="Open public booking page">
              <ExternalLink size={16} />
            </Link>
          ) : null}
          {t.stats.confirmedCount + t.stats.cancelledCount === 0 && t.status !== 'Completed' ? (
            <IconButton icon={Trash2} label="Delete trip" variant="danger-ghost" onClick={() => setConfirm({ kind: 'delete', trip: t })} />
          ) : null}
        </div>
      ),
    },
  ];

  const confirmCopy = confirm && {
    complete: {
      title: 'Mark trip as completed?',
      message:
        (parseLocalDateTime(confirm.trip.departureAt)?.getTime() || 0) > Date.now()
          ? 'This trip has not departed yet. Completed trips stop accepting bookings and count towards completed-trip revenue.'
          : 'Completed trips stop accepting bookings and count towards completed-trip revenue.',
      label: 'Mark completed',
      tone: 'primary',
    },
    reopen: { title: 'Reopen trip?', message: 'The trip returns to Scheduled. If it has not departed, passengers can book it again.', label: 'Reopen', tone: 'primary' },
    sync: {
      title: 'Apply current bus layout?',
      message: 'The trip will use the bus’s current seating layout. This is refused automatically if any booked seat would be moved, removed or blocked.',
      label: 'Apply layout',
      tone: 'primary',
    },
    delete: { title: 'Delete trip?', message: 'This trip has never had bookings and will be permanently removed.', label: 'Delete trip', tone: 'danger' },
  }[confirm.kind];

  return (
    <>
      <PageHeader
        title="Trips"
        description="Scheduled departures. Each trip keeps its own fare and seat layout."
        actions={
          <Button icon={Plus} onClick={() => setEditing(null)} disabled={!canSchedule} title={canSchedule ? undefined : 'Needs an active route and an active bus'}>
            Schedule trip
          </Button>
        }
      />
      {data.trips.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No trips scheduled"
          description={canSchedule ? 'Schedule a departure on one of your routes.' : 'You need at least one active route and one active bus before scheduling trips.'}
          action={
            canSchedule ? (
              <Button icon={Plus} onClick={() => setEditing(null)}>
                Schedule trip
              </Button>
            ) : (
              <>
                <Button variant="secondary" href="/admin/routes?new=1">
                  Create route
                </Button>
                <Button variant="secondary" href="/admin/buses?new=1">
                  Add bus
                </Button>
              </>
            )
          }
        />
      ) : (
        <Card bodyClassName="p-0">
          <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
            <div className="flex rounded-lg border border-slate-300 bg-white p-0.5" role="group" aria-label="Time filter">
              {[
                ['upcoming', 'Upcoming'],
                ['past', 'Past'],
                ['all', 'All'],
              ].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={filters.when === v}
                  onClick={() => setFilters((f) => ({ ...f, when: v }))}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${filters.when === v ? 'bg-ink text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <select aria-label="Status" value={filters.status} onChange={setFilter('status')} className={inputClasses(false, 'h-9 w-auto')}>
              <option value="">All statuses</option>
              {TRIP_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select aria-label="Bus" value={filters.busId} onChange={setFilter('busId')} className={inputClasses(false, 'h-9 w-auto')}>
              <option value="">All buses</option>
              {data.buses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <select aria-label="Route" value={filters.routeId} onChange={setFilter('routeId')} className={inputClasses(false, 'h-9 w-auto')}>
              <option value="">All routes</option>
              {data.routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <DataTable columns={columns} rows={rows} emptyMessage="No trips match these filters." />
        </Card>
      )}

      <TripForm open={editing !== undefined} trip={editing} data={data} onClose={() => setEditing(undefined)} />
      {cancelling ? <CancelTripDialog trip={cancelling} bookings={data.bookings} onClose={() => setCancelling(null)} /> : null}
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirmCopy?.title}
        message={confirmCopy?.message}
        confirmLabel={confirmCopy?.label}
        tone={confirmCopy?.tone}
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirm}
      />
    </>
  );
}
