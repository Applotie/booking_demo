'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, ChartColumn, Info } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import DataTable from '@/components/DataTable';
import { PageHeader, Loading, EmptyState, Alert } from '@/components/ui/Misc';
import { inputClasses } from '@/components/ui/Field';
import FinancialSummary, { BasisSelect } from '@/components/FinancialSummary';
import DateRangeFilter, { resolveRange, describeRange } from '@/components/DateRangeFilter';
import { GroupedBars } from '@/components/Charts';
import { useAppData } from '@/lib/hooks/use-app-data';
import { computeFinancials, compareBuses, monthlySeries, tripStats, compareRanges } from '@/lib/reporting-service';
import { presetRange } from '@/lib/dates';
import { sortSeatIds } from '@/lib/seat-service';
import { formatINR, formatPercent, formatDate, formatTime, formatMonth } from '@/lib/formatters';
import { BOOKING_STATUSES, REVENUE_BASES } from '@/lib/constants';

function ResultCell({ f }) {
  if (!f.result.hasData) return <span className="text-slate-400">—</span>;
  const v = f.result.operatingResult;
  return <span className={`tabular font-medium ${v >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatINR(v)}</span>;
}

export default function ReportsPage() {
  const { ready, data } = useAppData();
  const [range, setRange] = useState({ preset: 'month', from: '', to: '', month: '' });
  const [basis, setBasis] = useState('confirmed');
  const [busId, setBusId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [bookingStatus, setBookingStatus] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [months, setMonths] = useState(6);
  const resolved = resolveRange(range);

  const f = useMemo(() => computeFinancials(data, { busId: busId || null, routeId: routeId || null, range: resolved, basis }), [data, busId, routeId, resolved, basis]);
  const comparison = useMemo(() => compareBuses(data, { range: resolved, basis }), [data, resolved, basis]);
  const series = useMemo(() => monthlySeries(data, { busId: busId || null, months, basis }), [data, busId, months, basis]);
  const periodCompare = useMemo(
    () =>
      compareRanges(data, {
        busId: busId || null,
        basis,
        ranges: [
          { label: 'This month', range: presetRange('month') },
          { label: 'Last month', range: presetRange('lastMonth') },
        ],
      }),
    [data, busId, basis]
  );

  if (!ready) return <Loading />;
  if (data.buses.length === 0) {
    return (
      <>
        <PageHeader title="Reports" />
        <EmptyState icon={ChartColumn} title="Nothing to report yet" description="Reports are built from your buses, trips, bookings and expenses. Add a bus and schedule trips to get started." action={<Button href="/admin/buses?new=1">Add bus</Button>} />
      </>
    );
  }

  const tripRows = [...f.scope.trips].sort((a, b) => b.departureAt.localeCompare(a.departureAt)).map((t) => ({ ...t, s: tripStats(t, data.bookings) }));
  const rangeLabel = describeRange(range);

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Bus-wise bookings, occupancy, expenses and recorded operating results from saved records." />

      <div className="sticky top-14 z-10 -mx-4 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-[#f6f7f9]/95 px-4 py-3 backdrop-blur lg:top-0">
        <select aria-label="Bus" value={busId} onChange={(e) => setBusId(e.target.value)} className={inputClasses(false, 'h-9 w-auto')}>
          <option value="">All buses</option>
          {data.buses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select aria-label="Route" value={routeId} onChange={(e) => setRouteId(e.target.value)} className={inputClasses(false, 'h-9 w-auto')}>
          <option value="">All routes</option>
          {data.routes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <DateRangeFilter value={range} onChange={setRange} allowMonth />
        <BasisSelect value={basis} onChange={setBasis} />
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Summary · {busId ? data.buses.find((b) => b.id === busId)?.name : 'All buses'}
          {routeId ? ` · ${data.routes.find((r) => r.id === routeId)?.name}` : ''} · {rangeLabel}
        </h2>
        {routeId ? (
          <Alert tone="info" icon={Info} className="mb-3">
            Expenses are recorded per bus, not per route, so expense totals ignore the route filter.
          </Alert>
        ) : null}
        <FinancialSummary financials={f} rangeLabel={rangeLabel} />
      </section>

      <Card
        title="Trip performance"
        description="Click a trip to see its bookings."
        actions={
          <select aria-label="Booking status in drill-down" value={bookingStatus} onChange={(e) => setBookingStatus(e.target.value)} className={inputClasses(false, 'h-8 w-auto text-xs')}>
            <option value="">All bookings in drill-down</option>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s} only
              </option>
            ))}
          </select>
        }
        bodyClassName="p-0"
      >
        <DataTable
          dense
          rows={tripRows}
          emptyMessage="No trips in this selection."
          onRowClick={(t) => setExpanded((x) => (x === t.id ? null : t.id))}
          expandedKey={expanded}
          renderExpanded={(t) => {
            const list = t.s.bookings.filter((b) => !bookingStatus || b.bookingStatus === bookingStatus);
            return list.length ? (
              <table className="min-w-full text-xs">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="py-1 pr-3 font-semibold">Booking</th>
                    <th className="py-1 pr-3 font-semibold">Passengers</th>
                    <th className="py-1 pr-3 font-semibold">Seats</th>
                    <th className="py-1 pr-3 text-right font-semibold">Fare</th>
                    <th className="py-1 pr-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((b) => (
                    <tr key={b.id} className="border-t border-slate-200">
                      <td className="py-1.5 pr-3">
                        <Link href={`/admin/bookings?open=${b.id}`} className="font-mono font-semibold text-brand-700 hover:underline">
                          {b.bookingReference}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-3">{b.passengers.length}</td>
                      <td className="py-1.5 pr-3">{sortSeatIds(b.seatIds).join(', ')}</td>
                      <td className="py-1.5 pr-3 text-right tabular">{formatINR(b.totalFare)}</td>
                      <td className="py-1.5 pr-3">
                        <span className="flex gap-1">
                          <StatusBadge status={b.bookingStatus} />
                          <StatusBadge status={b.paymentStatus} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-slate-500">No bookings{bookingStatus ? ` with status ${bookingStatus}` : ''} on this trip.</p>
            );
          }}
          columns={[
            {
              key: 'x',
              header: <span className="sr-only">Expand</span>,
              render: (t) => (expanded === t.id ? <ChevronDown size={16} aria-label="Collapse" /> : <ChevronRight size={16} aria-label="Expand" />),
            },
            {
              key: 'dep',
              header: 'Departure',
              render: (t) => (
                <span className="whitespace-nowrap">
                  {formatDate(t.departureAt)} <span className="text-slate-500">{formatTime(t.departureAt)}</span>
                </span>
              ),
            },
            {
              key: 'route',
              header: 'Route / bus',
              render: (t) => (
                <div>
                  {t.routeSnapshot.source} → {t.routeSnapshot.destination}
                  <div className="text-xs text-slate-500">{t.busSnapshot.name}</div>
                </div>
              ),
            },
            { key: 'avail', header: 'Seats avail.', align: 'right', hideBelow: 'md', render: (t) => <span className="tabular">{t.s.sellable}</span> },
            { key: 'booked', header: 'Booked', align: 'right', render: (t) => <span className="tabular">{t.s.seatsBooked}</span> },
            { key: 'occ', header: 'Occupancy', align: 'right', render: (t) => <span className="tabular">{formatPercent(t.s.occupancy, 0)}</span> },
            { key: 'conf', header: 'Conf. / canc.', align: 'right', hideBelow: 'lg', render: (t) => <span className="tabular">{t.s.confirmedCount} / {t.s.cancelledCount}</span> },
            { key: 'val', header: 'Value', align: 'right', render: (t) => <span className="tabular">{formatINR(t.s.bookingValue)}</span> },
            { key: 'paid', header: 'Paid', align: 'right', hideBelow: 'lg', render: (t) => <span className="tabular text-emerald-700">{formatINR(t.s.paidAmount)}</span> },
            { key: 'unpaid', header: 'Unpaid', align: 'right', hideBelow: 'lg', render: (t) => <span className="tabular text-amber-700">{formatINR(t.s.unpaidAmount)}</span> },
            { key: 'st', header: 'Status', render: (t) => <StatusBadge status={t.status} /> },
          ]}
        />
      </Card>

      <Card title="Bus comparison" description={`${rangeLabel} · ${REVENUE_BASES[basis].label}`} bodyClassName="p-0">
        <DataTable
          dense
          rowKey={(r) => r.bus.id}
          rows={comparison}
          columns={[
            {
              key: 'bus',
              header: 'Bus',
              render: (r) => (
                <Link href={`/admin/buses/${r.bus.id}`} className="font-medium hover:text-brand-700">
                  {r.bus.name}
                  <span className="block text-xs font-normal text-slate-500">{r.bus.operationalStatus}</span>
                </Link>
              ),
            },
            { key: 'trips', header: 'Trips', align: 'right', render: (r) => <span className="tabular">{r.trips.total} <span className="text-xs text-slate-500">({r.trips.completed} done)</span></span> },
            { key: 'bk', header: 'Bookings', align: 'right', hideBelow: 'sm', render: (r) => <span className="tabular">{r.bookings.confirmedCount}</span> },
            { key: 'occ', header: 'Occupancy', align: 'right', hideBelow: 'md', render: (r) => <span className="tabular">{formatPercent(r.occupancy.rate, 0)}</span> },
            { key: 'rev', header: 'Revenue', align: 'right', render: (r) => <span className="tabular">{formatINR(r.revenue.amount)}</span> },
            { key: 'exp', header: 'Expenses', align: 'right', render: (r) => <span className="tabular">{formatINR(r.expenses.total)}</span> },
            { key: 'res', header: 'Result', align: 'right', render: (r) => <ResultCell f={r} /> },
          ]}
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card
          title="Revenue vs expenses by month"
          description={`${busId ? data.buses.find((b) => b.id === busId)?.name : 'All buses'} · ${REVENUE_BASES[basis].short} basis`}
          actions={
            <select aria-label="Months" value={months} onChange={(e) => setMonths(Number(e.target.value))} className={inputClasses(false, 'h-8 w-auto text-xs')}>
              {[3, 6, 12].map((m) => (
                <option key={m} value={m}>
                  Last {m} months
                </option>
              ))}
            </select>
          }
        >
          <GroupedBars
            data={series.map((m) => ({ key: m.month, label: formatMonth(m.month).replace(/ \d{4}$/, '').slice(0, 3), revenue: m.revenue, expenses: m.expenses, extra: `Result ${formatINR(m.result)} · occupancy ${formatPercent(m.occupancy, 0)}` }))}
            series={[
              { key: 'revenue', label: 'Revenue' },
              { key: 'expenses', label: 'Expenses' },
            ]}
          />
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-xs font-medium text-slate-600">Show as table</summary>
            <table className="mt-2 min-w-full text-xs">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-1">Month</th>
                  <th className="py-1 text-right">Revenue</th>
                  <th className="py-1 text-right">Expenses</th>
                  <th className="py-1 text-right">Result</th>
                  <th className="py-1 text-right">Occupancy</th>
                </tr>
              </thead>
              <tbody>
                {series.map((m) => (
                  <tr key={m.month} className="border-t border-slate-100">
                    <td className="py-1">{formatMonth(m.month)}</td>
                    <td className="py-1 text-right tabular">{formatINR(m.revenue)}</td>
                    <td className="py-1 text-right tabular">{formatINR(m.expenses)}</td>
                    <td className="py-1 text-right tabular">{m.hasData ? formatINR(m.result) : '—'}</td>
                    <td className="py-1 text-right tabular">{formatPercent(m.occupancy, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </Card>

        <Card title="Period comparison" description="This month vs last month">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-1" />
                {periodCompare.map((p) => (
                  <th key={p.label} className="py-1 text-right font-semibold">
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['Trips', (p) => p.trips.total],
                ['Bookings', (p) => p.bookings.confirmedCount],
                ['Occupancy', (p) => formatPercent(p.occupancy.rate, 0)],
                ['Revenue', (p) => formatINR(p.revenue.amount)],
                ['Expenses', (p) => formatINR(p.expenses.total)],
                ['Result', (p) => <ResultCell f={p} />],
              ].map(([label, get]) => (
                <tr key={label} className="border-t border-slate-100">
                  <td className="py-1.5 text-slate-600">{label}</td>
                  {periodCompare.map((p) => (
                    <td key={p.label} className="py-1.5 text-right tabular">
                      {get(p)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
