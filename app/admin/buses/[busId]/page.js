'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Pencil, Plus, Users, TriangleAlert, Wrench } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge, { StatusBadge } from '@/components/ui/Badge';
import DataTable from '@/components/DataTable';
import { PageHeader, Loading, StatCard, Tabs, KeyValue, EmptyState } from '@/components/ui/Misc';
import { inputClasses } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import SeatMap from '@/components/SeatMap';
import BusForm from '@/components/admin/BusForm';
import ExpenseForm from '@/components/ExpenseForm';
import SalaryBatchForm from '@/components/SalaryBatchForm';
import MaintenanceForm from '@/components/MaintenanceForm';
import BookingDetails from '@/components/admin/BookingDetails';
import ReminderList from '@/components/admin/ReminderList';
import FinancialSummary, { BasisSelect } from '@/components/FinancialSummary';
import DateRangeFilter, { resolveRange, describeRange } from '@/components/DateRangeFilter';
import { GroupedBars, HorizontalBars } from '@/components/Charts';
import { useAppData } from '@/lib/hooks/use-app-data';
import { setBusStatus } from '@/lib/bus-service';
import { computeFinancials, tripStats, monthlySeries, categoryRows } from '@/lib/reporting-service';
import { getReminders, getServiceStatus, getDocumentStatus } from '@/lib/maintenance-service';
import { isSalaryCategory } from '@/lib/expense-service';
import { sellableSeatCount, sortSeatIds } from '@/lib/seat-service';
import { parseLocalDateTime } from '@/lib/dates';
import { formatINR, formatDate, formatTime, formatKm, formatPercent, formatPhone, formatMonth, formatDateLong } from '@/lib/formatters';
import { BUS_STATUSES, categoryLabel } from '@/lib/constants';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'staff', label: 'Staff & documents' },
  { id: 'trips', label: 'Trips & bookings' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'financial', label: 'Financial summary' },
];

const DOC_TONE = { expired: 'danger', due_soon: 'warning', ok: 'success', missing: 'neutral' };

export default function BusProfilePage() {
  const { busId } = useParams();
  const { ready, data } = useAppData();
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [range, setRange] = useState({ preset: 'all', from: '', to: '', month: '' });
  const [basis, setBasis] = useState('confirmed');
  const [modal, setModal] = useState(null); // { kind, record }
  const [openBooking, setOpenBooking] = useState(null);
  const resolved = resolveRange(range);

  const bus = data.buses.find((b) => b.id === busId);
  const f = useMemo(() => (bus ? computeFinancials(data, { busId, range: resolved, basis }) : null), [bus, data, busId, resolved, basis]);
  const series = useMemo(() => (bus ? monthlySeries(data, { busId, months: 6, basis }) : []), [bus, data, busId, basis]);

  if (!ready) return <Loading />;
  if (!bus) {
    return <EmptyState icon={TriangleAlert} title="Bus not found" description="This bus does not exist in this browser." action={<Button href="/admin/buses" variant="secondary" icon={ArrowLeft}>All buses</Button>} />;
  }

  const now = Date.now();
  const allTrips = data.trips.filter((t) => t.busId === bus.id);
  const upcoming = allTrips.filter((t) => t.status === 'Scheduled' && parseLocalDateTime(t.departureAt) > now).sort((a, b) => a.departureAt.localeCompare(b.departureAt));
  const svc = getServiceStatus(bus, data.maintenance);
  const docs = getDocumentStatus(bus);
  const reminders = getReminders({ buses: [bus], maintenance: data.maintenance });
  const { trips, bookings, expenses } = f.scope;
  const maintenance = data.maintenance.filter((m) => m.busId === bus.id).sort((a, b) => b.serviceDate.localeCompare(a.serviceDate));
  const salaryRecords = data.expenses.filter((e) => e.busId === bus.id && isSalaryCategory(e.category)).sort((a, b) => b.salaryPeriod.localeCompare(a.salaryPeriod));
  const close = () => setModal(null);

  const rangeControls = (
    <div className="flex flex-wrap items-center gap-2">
      <DateRangeFilter value={range} onChange={setRange} allowMonth />
      <BasisSelect value={basis} onChange={setBasis} />
    </div>
  );

  return (
    <>
      <Link href="/admin/buses" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-ink">
        <ArrowLeft size={16} aria-hidden="true" /> All buses
      </Link>
      <PageHeader
        eyebrow={bus.type}
        title={bus.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{bus.registrationNumber}</span>
            <StatusBadge status={bus.operationalStatus} />
          </span>
        }
        actions={
          <>
            <select
              aria-label="Operational status"
              value={bus.operationalStatus}
              onChange={(e) => {
                const res = setBusStatus(bus.id, e.target.value);
                if (res.ok) toast.success(`Status set to ${e.target.value}.`);
              }}
              className={inputClasses(false, 'h-10 w-auto')}
            >
              {BUS_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <Button variant="secondary" icon={Pencil} onClick={() => setModal({ kind: 'bus' })}>
              Edit bus
            </Button>
          </>
        }
      />

      <Tabs tabs={TABS} active={tab} onChange={setTab} className="mb-5" />

      {tab === 'overview' ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Seating" value={`${bus.capacity} seats`} hint={`${bus.seatLayout.arrangement} · ${sellableSeatCount(bus.seatLayout)} bookable`} />
              <StatCard label="Odometer" value={formatKm(bus.odometer)} />
              <StatCard label="Upcoming trips" value={upcoming.length} />
              <StatCard
                label="Next service"
                value={svc.nextServiceDate ? formatDate(svc.nextServiceDate) : svc.nextServiceOdometer != null ? formatKm(svc.nextServiceOdometer) : '—'}
                tone={svc.status === 'overdue' ? 'danger' : svc.status === 'due_soon' ? 'warning' : 'neutral'}
                hint={svc.lastServiceDate ? `Last: ${formatDate(svc.lastServiceDate)}` : 'No service recorded'}
              />
            </div>
            <Card title="Assignment">
              <KeyValue
                items={[
                  { label: 'Driver', value: bus.driver?.name ? `${bus.driver.name}${bus.driver.phone ? ` · ${formatPhone(bus.driver.phone)}` : ''}` : 'Not assigned' },
                  { label: 'Conductor / helper', value: bus.conductor?.name ? `${bus.conductor.name}${bus.conductor.phone ? ` · ${formatPhone(bus.conductor.phone)}` : ''}` : 'Not assigned' },
                  { label: 'Purchase date', value: formatDate(bus.purchaseDate) },
                  { label: 'Notes', value: bus.notes || '—' },
                ]}
              />
            </Card>
            <Card title="Warnings & reminders">
              <ReminderList reminders={reminders} emptyMessage="No document or service warnings for this bus." />
            </Card>
            <Card title="Upcoming trips" bodyClassName="p-0">
              {upcoming.length ? (
                <ul className="divide-y divide-slate-100">
                  {upcoming.slice(0, 8).map((t) => {
                    const s = tripStats(t, data.bookings);
                    return (
                      <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                        <span>
                          <span className="font-medium">
                            {t.routeSnapshot.source} → {t.routeSnapshot.destination}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {formatDateLong(t.departureAt)} · {formatTime(t.departureAt)}
                          </span>
                        </span>
                        <span className="tabular text-right">
                          {s.seatsBooked}/{s.sellable}
                          <span className="block text-xs text-slate-500">{formatINR(s.bookingValue)}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-4 py-5 text-sm text-slate-500">No upcoming trips.</p>
              )}
            </Card>
          </div>
          <Card title="Current seat layout" description="Used for new trips">
            <SeatMap layout={bus.seatLayout} mode="view" />
          </Card>
        </div>
      ) : null}

      {tab === 'staff' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Current staff" actions={<Button size="sm" variant="secondary" icon={Pencil} onClick={() => setModal({ kind: 'bus' })}>Change</Button>}>
            <ul className="divide-y divide-slate-100 text-sm">
              {[
                { role: 'Driver', ...bus.driver },
                { role: 'Conductor / helper', ...bus.conductor },
                ...(bus.staff || []).map((s) => ({ ...s })),
              ].map((p, i) => (
                <li key={i} className="flex justify-between gap-3 py-2">
                  <span>
                    <span className="font-medium">{p.name || <span className="text-slate-400">Not assigned</span>}</span>
                    <span className="block text-xs text-slate-500">
                      {p.role}
                      {p.since ? ` · since ${formatDate(p.since)}` : ''}
                    </span>
                  </span>
                  <span className="tabular text-slate-600">{p.phone ? formatPhone(p.phone) : ''}</span>
                </li>
              ))}
            </ul>
            {bus.staffHistory?.length ? (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Previous assignments</h3>
                <ul className="space-y-1 text-sm">
                  {[...bus.staffHistory].reverse().map((h, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span>
                        {h.name} <span className="text-slate-500">· {h.role}</span>
                      </span>
                      <span className="text-xs text-slate-500">
                        {h.from ? `${formatDate(h.from)} – ` : 'until '}
                        {formatDate(h.until)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
          <Card title="Documents">
            <ul className="divide-y divide-slate-100 text-sm">
              {docs.map((d) => (
                <li key={d.key} className="flex items-center justify-between gap-3 py-2">
                  <span>{d.label}</span>
                  <span className="flex items-center gap-2">
                    <span className="tabular">{d.date ? formatDate(d.date) : '—'}</span>
                    <Badge tone={DOC_TONE[d.status]}>
                      {d.status === 'expired' ? 'Expired' : d.status === 'due_soon' ? `${d.daysLeft} days left` : d.status === 'ok' ? 'Valid' : 'Not set'}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card
            title="Salary records"
            className="lg:col-span-2"
            actions={
              <Button size="sm" icon={Users} onClick={() => setModal({ kind: 'salary' })}>
                Monthly salaries
              </Button>
            }
            bodyClassName="p-0"
          >
            <DataTable
              dense
              rows={salaryRecords}
              emptyMessage="No salary records for this bus."
              columns={[
                { key: 'period', header: 'Month', render: (e) => formatMonth(e.salaryPeriod) },
                { key: 'name', header: 'Staff', render: (e) => <span>{e.staffName} <span className="text-xs text-slate-500">· {e.staffRole}</span></span> },
                { key: 'cat', header: 'Category', hideBelow: 'md', render: (e) => categoryLabel(e.category) },
                { key: 'amt', header: 'Amount', align: 'right', render: (e) => <span className="tabular">{formatINR(e.amount)}</span> },
                { key: 'st', header: 'Status', render: (e) => <StatusBadge status={e.paymentStatus} /> },
              ]}
            />
          </Card>
        </div>
      ) : null}

      {tab === 'trips' ? (
        <div className="space-y-4">
          {rangeControls}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <StatCard label="Trips" value={f.trips.total} hint={`${f.trips.scheduled} scheduled · ${f.trips.cancelled} cancelled`} />
            <StatCard label="Completed trips" value={f.trips.completed} />
            <StatCard label="Confirmed bookings" value={f.bookings.confirmedCount} hint={`${f.bookings.cancelledCount} cancelled`} />
            <StatCard label="Seats booked" value={f.bookings.seatsBooked} hint={`${f.bookings.passengers} passengers`} />
            <StatCard label="Booking value" value={formatINR(f.bookings.bookingValue)} />
            <StatCard label="Occupancy" value={formatPercent(f.occupancy.rate)} hint={`${f.occupancy.bookedSeats}/${f.occupancy.sellableSeats} seats`} />
            <StatCard label="Paid" value={formatINR(f.bookings.paidAmount)} tone="success" />
            <StatCard label="Unpaid" value={formatINR(f.bookings.unpaidAmount)} tone={f.bookings.unpaidAmount ? 'warning' : 'neutral'} />
            <StatCard label="Completed-trip revenue" value={formatINR(computeFinancials(data, { busId, range: resolved, basis: 'completed' }).revenue.amount)} />
          </div>
          <Card title="Trips" description={describeRange(range)} bodyClassName="p-0">
            <DataTable
              rows={[...trips].sort((a, b) => b.departureAt.localeCompare(a.departureAt)).map((t) => ({ ...t, s: tripStats(t, data.bookings) }))}
              emptyMessage="No trips in this period."
              columns={[
                { key: 'dep', header: 'Departure', render: (t) => <span className="whitespace-nowrap">{formatDate(t.departureAt)} {formatTime(t.departureAt)}</span> },
                { key: 'route', header: 'Route', render: (t) => `${t.routeSnapshot.source} → ${t.routeSnapshot.destination}` },
                { key: 'seats', header: 'Booked', align: 'right', render: (t) => <span className="tabular">{t.s.seatsBooked}/{t.s.sellable} ({formatPercent(t.s.occupancy, 0)})</span> },
                { key: 'value', header: 'Value', align: 'right', render: (t) => <span className="tabular">{formatINR(t.s.bookingValue)}</span> },
                { key: 'st', header: 'Status', render: (t) => <StatusBadge status={t.status} /> },
              ]}
            />
          </Card>
          <Card title="Bookings" bodyClassName="p-0">
            <DataTable
              rows={[...bookings].sort((a, b) => b.createdAt.localeCompare(a.createdAt))}
              onRowClick={(b) => setOpenBooking(b.id)}
              emptyMessage="No bookings in this period."
              columns={[
                { key: 'ref', header: 'Booking', render: (b) => <span className="font-mono font-semibold text-brand-700">{b.bookingReference}</span> },
                { key: 'date', header: 'Travel', render: (b) => formatDate(b.travelDate) },
                { key: 'pax', header: 'Seats', hideBelow: 'sm', render: (b) => sortSeatIds(b.seatIds).join(', ') },
                { key: 'total', header: 'Total', align: 'right', render: (b) => <span className="tabular">{formatINR(b.totalFare)}</span> },
                { key: 'st', header: 'Status', render: (b) => <span className="flex gap-1"><StatusBadge status={b.bookingStatus} /><StatusBadge status={b.paymentStatus} /></span> },
              ]}
            />
          </Card>
        </div>
      ) : null}

      {tab === 'expenses' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <DateRangeFilter value={range} onChange={setRange} allowMonth />
            <div className="flex gap-2">
              <Button variant="secondary" icon={Users} onClick={() => setModal({ kind: 'salary' })}>
                Monthly salaries
              </Button>
              <Button icon={Plus} onClick={() => setModal({ kind: 'expense' })}>
                Record expense
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Salaries" value={formatINR(f.expenses.byGroup.salary)} />
            <StatCard label="Fuel" value={formatINR(f.expenses.byGroup.fuel)} />
            <StatCard label="Maintenance & repairs" value={formatINR(f.expenses.byGroup.maintenance)} />
            <StatCard label="Insurance & documents" value={formatINR(f.expenses.byGroup.documents)} />
            <StatCard label="Other" value={formatINR(f.expenses.byGroup.other)} />
            <StatCard label="Paid" value={formatINR(f.expenses.paid)} tone="success" />
            <StatCard label="Pending" value={formatINR(f.expenses.pending)} tone={f.expenses.pending ? 'warning' : 'neutral'} />
            <StatCard label="Total recorded" value={formatINR(f.expenses.total)} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Card title="By category">
              <HorizontalBars rows={categoryRows(f.expenses.byCategory).map((r) => ({ key: r.category, label: r.label, value: r.amount }))} />
            </Card>
            <Card title="Expense records" description={describeRange(range)} bodyClassName="p-0">
              <DataTable
                dense
                rows={[...expenses].sort((a, b) => b.expenseDate.localeCompare(a.expenseDate))}
                emptyMessage="No expenses in this period."
                columns={[
                  { key: 'd', header: 'Date', render: (e) => formatDate(e.expenseDate) },
                  {
                    key: 'desc',
                    header: 'Expense',
                    render: (e) => (
                      <div>
                        {e.description}
                        <div className="text-xs text-slate-500">
                          {categoryLabel(e.category)}
                          {e.maintenanceRecordId ? ' · from maintenance' : ''}
                        </div>
                      </div>
                    ),
                  },
                  { key: 'a', header: 'Amount', align: 'right', render: (e) => <span className="tabular">{formatINR(e.amount)}</span> },
                  { key: 's', header: 'Status', render: (e) => <StatusBadge status={e.paymentStatus} /> },
                  {
                    key: 'x',
                    header: <span className="sr-only">Edit</span>,
                    align: 'right',
                    render: (e) =>
                      e.maintenanceRecordId ? null : (
                        <Button size="xs" variant="ghost" icon={Pencil} onClick={() => setModal({ kind: 'expense', record: e })}>
                          Edit
                        </Button>
                      ),
                  },
                ]}
              />
            </Card>
          </div>
        </div>
      ) : null}

      {tab === 'maintenance' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-600">
              Odometer {formatKm(bus.odometer)} · Last service {svc.lastServiceDate ? formatDate(svc.lastServiceDate) : 'never'} · Next{' '}
              {svc.nextServiceDate ? formatDate(svc.nextServiceDate) : '—'}
              {svc.nextServiceOdometer != null ? ` / ${formatKm(svc.nextServiceOdometer)}` : ''}
            </p>
            <Button icon={Wrench} onClick={() => setModal({ kind: 'maintenance' })}>
              Record maintenance
            </Button>
          </div>
          <Card title="Reminders">
            <ReminderList reminders={reminders} emptyMessage="Nothing due." />
          </Card>
          <Card title="Service history" description={`${maintenance.length} record(s) · cost ${formatINR(maintenance.reduce((s, m) => s + (m.cost || 0), 0))} all time`} bodyClassName="p-0">
            <DataTable
              rows={maintenance}
              emptyMessage="No maintenance recorded."
              columns={[
                { key: 'd', header: 'Date', render: (m) => formatDate(m.serviceDate) },
                { key: 't', header: 'Service', render: (m) => <div>{m.serviceType}<div className="text-xs text-slate-500">{m.workPerformed}</div></div> },
                { key: 'o', header: 'Odometer', align: 'right', hideBelow: 'sm', render: (m) => <span className="tabular">{formatKm(m.odometer)}</span> },
                { key: 'c', header: 'Cost', align: 'right', render: (m) => <span className="tabular">{m.cost ? formatINR(m.cost) : '—'}</span> },
                { key: 'n', header: 'Next', hideBelow: 'md', render: (m) => (m.nextServiceDate ? formatDate(m.nextServiceDate) : '—') },
                { key: 'e', header: <span className="sr-only">Edit</span>, align: 'right', render: (m) => <Button size="xs" variant="ghost" icon={Pencil} onClick={() => setModal({ kind: 'maintenance', record: m })}>Edit</Button> },
              ]}
            />
          </Card>
        </div>
      ) : null}

      {tab === 'financial' ? (
        <div className="space-y-4">
          {rangeControls}
          <FinancialSummary financials={f} rangeLabel={describeRange(range)} />
          <Card title="Last 6 months" description="Eligible revenue and recorded expenses by month (travel date / expense date). Hover a month for exact values.">
            <GroupedBars
              data={series.map((m) => ({ key: m.month, label: formatMonth(m.month).replace(/ \d{4}$/, ''), revenue: m.revenue, expenses: m.expenses, extra: `Result: ${formatINR(m.result)}` }))}
              series={[
                { key: 'revenue', label: 'Revenue' },
                { key: 'expenses', label: 'Expenses' },
              ]}
            />
          </Card>
        </div>
      ) : null}

      <BusForm open={modal?.kind === 'bus'} bus={bus} tripCount={allTrips.length} onClose={close} />
      <ExpenseForm open={modal?.kind === 'expense'} expense={modal?.record} defaultBusId={bus.id} data={data} onClose={close} />
      <SalaryBatchForm open={modal?.kind === 'salary'} defaultBusId={bus.id} data={data} onClose={close} />
      <MaintenanceForm open={modal?.kind === 'maintenance'} record={modal?.record} defaultBusId={bus.id} data={data} onClose={close} />
      {openBooking ? <BookingDetails booking={data.bookings.find((b) => b.id === openBooking)} notifications={data.notifications} onClose={() => setOpenBooking(null)} /> : null}
    </>
  );
}
