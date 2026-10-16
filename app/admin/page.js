'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Bus,
  Route as RouteIcon,
  CalendarClock,
  Ticket,
  Receipt,
  Wrench,
  Plus,
  IndianRupee,
  Wallet,
  Hourglass,
  CircleCheck,
  Armchair,
  TrendingUp,
  ArrowRight,
  Check,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { PageHeader, Loading, StatCard, Alert } from '@/components/ui/Misc';
import DateRangeFilter, { resolveRange, describeRange } from '@/components/DateRangeFilter';
import { BasisSelect } from '@/components/FinancialSummary';
import ReminderList from '@/components/admin/ReminderList';
import { useAppData } from '@/lib/hooks/use-app-data';
import { computeDashboard, tripStats } from '@/lib/reporting-service';
import { formatINR, formatDateTime, formatPercent, formatTime, formatDate } from '@/lib/formatters';
import { REVENUE_BASES } from '@/lib/constants';

function GettingStarted({ data }) {
  const steps = [
    { done: data.routes.length > 0, label: 'Create a route', desc: 'Source, destination, stops and default fare.', href: '/admin/routes?new=1' },
    { done: data.buses.length > 0, label: 'Add a bus', desc: 'Registration, seating layout and staff.', href: '/admin/buses?new=1' },
    { done: data.trips.length > 0, label: 'Schedule a trip', desc: 'Pick a route, bus, date and fare.', href: '/admin/trips?new=1' },
    { done: data.bookings.length > 0, label: 'Take a test booking', desc: 'Book a seat on the public site.', href: '/' },
  ];
  if (steps.every((s) => s.done)) return null;
  return (
    <Card title="Get started" description="No sample data is created — the app only shows what you enter.">
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.label}>
            <Link href={s.href} className={`flex h-full gap-3 rounded-lg border p-3 transition-colors ${s.done ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 hover:border-brand-300 hover:bg-brand-50'}`}>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${s.done ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {s.done ? <Check size={14} /> : i + 1}
              </span>
              <span>
                <span className="block text-sm font-semibold">{s.label}</span>
                <span className="block text-xs text-slate-500">{s.desc}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export default function DashboardPage() {
  const { ready, data, issues } = useAppData();
  const [range, setRange] = useState({ preset: 'month', from: '', to: '' });
  const [basis, setBasis] = useState('confirmed');
  const resolved = resolveRange(range);
  const dash = useMemo(() => computeDashboard(data, { range: resolved, basis }), [data, resolved, basis]);

  if (!ready) return <Loading />;
  const f = dash.financials;
  const recentBookings = [...data.bookings].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Live figures calculated from the records saved in this browser."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={Plus} href="/admin/routes?new=1">
              Route
            </Button>
            <Button size="sm" variant="secondary" icon={Plus} href="/admin/buses?new=1">
              Bus
            </Button>
            <Button size="sm" variant="secondary" icon={Plus} href="/admin/trips?new=1">
              Trip
            </Button>
            <Button size="sm" variant="secondary" icon={Plus} href="/admin/expenses?new=1">
              Expense
            </Button>
            <Button size="sm" variant="secondary" icon={Plus} href="/admin/maintenance?new=1">
              Maintenance
            </Button>
          </div>
        }
      />

      {issues.length ? (
        <Alert tone="warning" title="Storage problem detected">
          Some stored data could not be read and was set aside. Open “Data & storage” in the sidebar for details.
        </Alert>
      ) : null}

      <GettingStarted data={data} />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Fleet & schedule</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Total buses" value={dash.fleet.total} icon={Bus} href="/admin/buses" />
          <StatCard label="Active buses" value={dash.fleet.active} tone="success" icon={CircleCheck} />
          <StatCard label="Under maintenance" value={dash.fleet.maintenance} tone={dash.fleet.maintenance ? 'warning' : 'neutral'} icon={Wrench} />
          <StatCard label="Active routes" value={dash.routes.active} hint={`${dash.routes.total} total`} icon={RouteIcon} href="/admin/routes" />
          <StatCard label="Upcoming trips" value={dash.upcomingTrips.length} hint="Scheduled, not yet departed" icon={CalendarClock} href="/admin/trips" />
          <StatCard label="Completed trips" value={f.trips.completed} hint={describeRange(range)} icon={Check} />
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Bookings & money · {describeRange(range)}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <BasisSelect value={basis} onChange={setBasis} />
            <DateRangeFilter value={range} onChange={setRange} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <StatCard label="Confirmed bookings" value={f.bookings.confirmedCount} hint={`${f.bookings.cancelledCount} cancelled (excluded)`} icon={Ticket} href="/admin/bookings" />
          <StatCard label="Seats booked" value={f.bookings.seatsBooked} hint={`Occupancy ${formatPercent(f.occupancy.rate)}`} icon={Armchair} />
          <StatCard label="Booking value" value={formatINR(f.bookings.bookingValue)} hint="Confirmed bookings, not cash received" icon={IndianRupee} />
          <StatCard label="Received from passengers" value={formatINR(f.bookings.paidAmount)} tone="success" icon={Wallet} />
          <StatCard label="Outstanding payments" value={formatINR(f.bookings.unpaidAmount)} tone={f.bookings.unpaidAmount ? 'warning' : 'neutral'} icon={Hourglass} />
          <StatCard label="Recorded expenses" value={formatINR(f.expenses.total)} hint={`${formatINR(f.expenses.paid)} paid`} icon={Receipt} href="/admin/expenses" />
          <StatCard label="Pending expenses" value={formatINR(f.expenses.pending)} tone={f.expenses.pending ? 'warning' : 'neutral'} icon={Hourglass} />
          <StatCard
            label="Recorded operating result"
            value={f.result.hasData ? formatINR(f.result.operatingResult) : '—'}
            tone={!f.result.hasData ? 'neutral' : f.result.operatingResult >= 0 ? 'success' : 'danger'}
            hint={f.result.hasData ? `${REVENUE_BASES[basis].short} revenue − recorded expenses` : 'No bookings or expenses in this period'}
            icon={TrendingUp}
            href="/admin/reports"
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Upcoming trips"
          actions={
            <Link href="/admin/trips" className="text-sm font-medium text-brand-700 hover:underline">
              All trips
            </Link>
          }
          bodyClassName="p-0"
        >
          {dash.upcomingTrips.length ? (
            <ul className="divide-y divide-slate-100">
              {dash.upcomingTrips.slice(0, 6).map((t) => {
                const s = tripStats(t, data.bookings);
                return (
                  <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium">
                        {t.routeSnapshot.source} → {t.routeSnapshot.destination}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatDate(t.departureAt)} · {formatTime(t.departureAt)} · {t.busSnapshot.name}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="tabular font-medium">
                        {s.seatsBooked}/{s.sellable} seats
                      </div>
                      <div className="text-xs text-slate-500">{formatINR(s.bookingValue)}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-6 text-sm text-slate-500">No upcoming trips scheduled.</p>
          )}
        </Card>

        <Card
          title="Maintenance & document reminders"
          actions={
            <Link href="/admin/maintenance" className="text-sm font-medium text-brand-700 hover:underline">
              Maintenance
            </Link>
          }
        >
          <ReminderList reminders={dash.reminders} limit={6} />
        </Card>
      </div>

      <Card
        title="Recent bookings"
        actions={
          <Link href="/admin/bookings" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
            All bookings <ArrowRight size={14} />
          </Link>
        }
        bodyClassName="p-0"
      >
        {recentBookings.length ? (
          <ul className="divide-y divide-slate-100">
            {recentBookings.map((b) => (
              <li key={b.id}>
                <Link href={`/admin/bookings?open=${b.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-slate-50">
                  <div className="min-w-0">
                    <span className="font-mono font-semibold text-brand-700">{b.bookingReference}</span>
                    <span className="ml-2 text-slate-600">
                      {b.routeSnapshot.source} → {b.routeSnapshot.destination}
                    </span>
                    <div className="text-xs text-slate-500">
                      {b.passengers.length} passenger(s) · {formatDateTime(b.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="tabular font-medium">{formatINR(b.totalFare)}</span>
                    <StatusBadge status={b.bookingStatus} />
                    <StatusBadge status={b.paymentStatus} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-sm text-slate-500">No bookings yet.</p>
        )}
      </Card>
    </div>
  );
}
