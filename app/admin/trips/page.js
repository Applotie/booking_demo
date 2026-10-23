'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Pencil, CircleCheck, Undo2, Ban, RefreshCw, Ticket, ExternalLink, Trash2, CalendarClock, Pause, Play, Repeat } from 'lucide-react';
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
import { setTripStatus, syncTripLayout, deleteTrip, isLayoutOutOfDate, setScheduleStatus, syncScheduleLayout, deleteSchedule } from '@/lib/trip-service';
import { nextBookableTrip } from '@/lib/booking-service';
import { scheduleArrivalTime, arrivesNextDay, scheduleFrequency, scheduleWeekdays } from '@/lib/schedule-service';
import { tripStats } from '@/lib/reporting-service';
import { parseLocalDateTime, todayKey } from '@/lib/dates';
import { formatINR, formatDateLong, formatTime, formatTimeOfDay, formatPercent, formatWeekdays } from '@/lib/formatters';
import { TRIP_STATUSES, TRIP_FREQUENCIES } from '@/lib/constants';

export default function TripsPage() {
  const { ready, data } = useAppData();
  const toast = useToast();
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new, { trip } or { schedule }
  const [cancelling, setCancelling] = useState(null);
  const [confirm, setConfirm] = useState(null); // { kind, trip } or { kind, schedule }
  const [filters, setFilters] = useState({ when: 'upcoming', status: '', busId: '', routeId: '', frequency: '' });
  const newParam = useQueryParam('new', { consume: true });

  useEffect(() => {
    if (newParam === '1') setEditing(null);
  }, [newParam]);

  const rows = useMemo(() => {
    const now = Date.now();
    // A date of a repeating trip takes its frequency from that trip; a deleted
    // one is assumed daily, as before weekly trips existed.
    const frequencyOf = (t) => {
      if (!t.scheduleId) return 'Custom';
      const s = data.schedules.find((x) => x.id === t.scheduleId);
      return s ? scheduleFrequency(s) : 'Daily';
    };
    return data.trips
      .filter((t) => {
        const dep = parseLocalDateTime(t.departureAt)?.getTime() || 0;
        if (filters.when === 'upcoming' && dep <= now) return false;
        if (filters.when === 'past' && dep > now) return false;
        if (filters.status && t.status !== filters.status) return false;
        if (filters.busId && t.busId !== filters.busId) return false;
        if (filters.routeId && t.routeId !== filters.routeId) return false;
        if (filters.frequency && filters.frequency !== frequencyOf(t)) return false;
        return true;
      })
      .sort((a, b) => (filters.when === 'past' ? b.departureAt.localeCompare(a.departureAt) : a.departureAt.localeCompare(b.departureAt)))
      .map((t) => ({ ...t, stats: tripStats(t, data.bookings), bus: data.buses.find((b) => b.id === t.busId), frequency: frequencyOf(t) }));
  }, [data, filters]);

  const scheduleRows = useMemo(() => {
    const now = Date.now();
    return [...data.schedules]
      .sort((a, b) => a.departureTime.localeCompare(b.departureTime))
      .map((s) => {
        const dated = new Set(data.trips.filter((t) => t.scheduleId === s.id).map((t) => t.id));
        return {
          ...s,
          bus: data.buses.find((b) => b.id === s.busId),
          next: s.status === 'Active' ? nextBookableTrip(s, data.trips, { now }) : null,
          hasBookings: data.bookings.some((b) => dated.has(b.tripId)),
        };
      });
  }, [data]);

  if (!ready) return <Loading />;

  const canSchedule = data.routes.some((r) => r.isActive) && data.buses.some((b) => b.operationalStatus === 'Active');
  const setFilter = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const today = todayKey();

  const runConfirm = () => {
    const { kind, trip, schedule } = confirm;
    let res;
    if (kind === 'complete') res = setTripStatus(trip.id, 'Completed');
    else if (kind === 'reopen') res = setTripStatus(trip.id, 'Scheduled');
    else if (kind === 'sync') res = syncTripLayout(trip.id);
    else if (kind === 'delete') res = deleteTrip(trip.id);
    else if (kind === 'pause') res = setScheduleStatus(schedule.id, 'Paused');
    else if (kind === 'resume') res = setScheduleStatus(schedule.id, 'Active');
    else if (kind === 'syncSchedule') res = syncScheduleLayout(schedule.id);
    else if (kind === 'deleteSchedule') res = deleteSchedule(schedule.id);
    if (res.ok) {
      toast.success(
        {
          complete: 'Trip marked completed.',
          reopen: 'Trip reopened.',
          sync: 'Trip seat layout updated from the bus.',
          delete: 'Trip deleted.',
          pause: 'Repeating trip paused.',
          resume: 'Repeating trip resumed.',
          syncSchedule: 'Repeating trip seat layout updated from the bus.',
          deleteSchedule: 'Repeating trip deleted.',
        }[kind]
      );
    } else toast.error(res.message);
    setConfirm(null);
  };

  const scheduleColumns = [
    {
      key: 'when',
      header: 'Departs',
      render: (s) => (
        <div className="whitespace-nowrap">
          <div className="font-medium tabular">
            {formatTimeOfDay(s.departureTime)} → {formatTimeOfDay(scheduleArrivalTime(s))}
            {arrivesNextDay(s) ? <sup className="ml-0.5 text-[10px] font-medium text-brand-700">+1</sup> : null}
          </div>
          <div className="text-xs text-slate-500">{formatWeekdays(scheduleWeekdays(s))}{s.startDate > today ? ` from ${formatDateLong(s.startDate)}` : ''}</div>
        </div>
      ),
    },
    {
      key: 'route',
      header: 'Route',
      render: (s) => (
        <div>
          <div className="font-medium">
            {s.routeSnapshot.source} → {s.routeSnapshot.destination}
          </div>
          <div className="text-xs text-slate-500">{s.routeSnapshot.name}</div>
        </div>
      ),
    },
    {
      key: 'bus',
      header: 'Bus',
      hideBelow: 'md',
      render: (s) => (
        <Link href={`/admin/buses/${s.busId}`} className="hover:text-brand-700">
          <div>{s.busSnapshot.name}</div>
          <div className="font-mono text-xs text-slate-500">{s.busSnapshot.registrationNumber}</div>
        </Link>
      ),
    },
    { key: 'fare', header: 'Fare', align: 'right', render: (s) => <span className="tabular">{formatINR(s.fare)}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (s) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={s.status} />
          {isLayoutOutOfDate(s, s.bus) ? <Badge tone="info">Bus layout changed</Badge> : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (s) => (
        <div className="flex flex-wrap justify-end gap-0.5">
          <IconButton icon={Pencil} label="Edit repeating trip" onClick={() => setEditing({ schedule: s })} />
          {s.status === 'Active' ? (
            <IconButton icon={Pause} label="Pause repeating trip" onClick={() => setConfirm({ kind: 'pause', schedule: s })} />
          ) : (
            <IconButton icon={Play} label="Resume repeating trip" onClick={() => setConfirm({ kind: 'resume', schedule: s })} />
          )}
          {isLayoutOutOfDate(s, s.bus) ? <IconButton icon={RefreshCw} label="Apply current bus layout" onClick={() => setConfirm({ kind: 'syncSchedule', schedule: s })} /> : null}
          {s.next ? (
            <Link href={`/trips/${s.next.id}`} target="_blank" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100" title="Open public booking page" aria-label="Open public booking page">
              <ExternalLink size={16} />
            </Link>
          ) : null}
          {!s.hasBookings ? <IconButton icon={Trash2} label="Delete repeating trip" variant="danger-ghost" onClick={() => setConfirm({ kind: 'deleteSchedule', schedule: s })} /> : null}
        </div>
      ),
    },
  ];

  const columns = [
    {
      key: 'when',
      header: 'Departure',
      render: (t) => (
        <div className="whitespace-nowrap">
          <div className="flex items-center gap-1.5 font-medium">
            {formatDateLong(t.departureAt)}
            {t.scheduleId ? (
              <Badge tone="brand" icon={Repeat}>
                {t.frequency === 'Weekly' ? 'Weekly' : 'Daily'}
              </Badge>
            ) : null}
          </div>
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
              <IconButton icon={Pencil} label="Edit trip" onClick={() => setEditing({ trip: t })} />
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
          {/* A deleted date of a repeating trip would simply be offered again, so dates are cancelled instead. */}
          {t.stats.confirmedCount + t.stats.cancelledCount === 0 && t.status !== 'Completed' && !t.scheduleId ? (
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
        (parseLocalDateTime(confirm.trip?.departureAt)?.getTime() || 0) > Date.now()
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
    pause: {
      title: 'Pause repeating trip?',
      message: 'Passengers can no longer book new dates. Dates that already have bookings still run — cancel them in the trips list if needed.',
      label: 'Pause',
      tone: 'primary',
    },
    resume: { title: 'Resume repeating trip?', message: 'Passengers can book any date it runs again.', label: 'Resume', tone: 'primary' },
    syncSchedule: {
      title: 'Apply current bus layout?',
      message: 'Dates without bookings will use the bus’s current seating layout. Dates that already have bookings keep their saved layout.',
      label: 'Apply layout',
      tone: 'primary',
    },
    deleteSchedule: { title: 'Delete repeating trip?', message: 'This repeating trip has never had bookings and will be permanently removed.', label: 'Delete repeating trip', tone: 'danger' },
  }[confirm.kind];

  return (
    <>
      <PageHeader
        title="Trips"
        description="Repeating and one-off departures. Each trip keeps its own fare and seat layout."
        actions={
          <Button icon={Plus} onClick={() => setEditing(null)} disabled={!canSchedule} title={canSchedule ? undefined : 'Needs an active route and an active bus'}>
            Schedule trip
          </Button>
        }
      />
      {data.schedules.length > 0 ? (
        <Card
          title="Repeating trips"
          description="Run daily or on chosen days of the week. Passengers can book any date they run; a date appears in the list below once it has a booking."
          className="mb-6"
          bodyClassName="p-0"
        >
          <DataTable columns={scheduleColumns} rows={scheduleRows} />
        </Card>
      ) : null}
      {data.trips.length === 0 && data.schedules.length === 0 ? (
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
            <select aria-label="Frequency" value={filters.frequency} onChange={setFilter('frequency')} className={inputClasses(false, 'h-9 w-auto')}>
              <option value="">All frequencies</option>
              {TRIP_FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <DataTable
            columns={columns}
            rows={rows}
            emptyMessage={data.trips.length ? 'No trips match these filters.' : 'No dated trips yet. Dates of repeating trips appear here once they have a booking.'}
          />
        </Card>
      )}

      <TripForm open={editing !== undefined} trip={editing?.trip || null} schedule={editing?.schedule || null} data={data} onClose={() => setEditing(undefined)} />
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
