'use client';

import { Info, TrendingUp, TrendingDown } from 'lucide-react';
import { formatINR, formatPercent, formatNumber } from '@/lib/formatters';
import { REVENUE_BASES, EXPENSE_GROUPS } from '@/lib/constants';

export function BasisSelect({ value, onChange, className = '' }) {
  return (
    <div className={`flex rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm ${className}`} role="group" aria-label="Revenue basis">
      {Object.entries(REVENUE_BASES).map(([key, b]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          title={b.description}
          className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${value === key ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          {b.short}
        </button>
      ))}
    </div>
  );
}

function Row({ label, value, strong, muted, hint }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 ${strong ? 'border-t border-slate-200 pt-2.5 font-semibold' : ''}`}>
      <dt className={muted ? 'text-slate-500' : 'text-slate-700'}>
        {label}
        {hint ? <span className="block text-xs font-normal text-slate-400">{hint}</span> : null}
      </dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}

const money = (n) => (n === null ? '—' : formatINR(n));

export default function FinancialSummary({ financials: f, rangeLabel }) {
  const basis = REVENUE_BASES[f.basis];
  const result = f.result.operatingResult;
  const positive = result >= 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          <strong className="text-ink">{basis.label}:</strong> {basis.description} Trips and bookings are counted by travel date, expenses by expense date
          {rangeLabel ? ` (${rangeLabel})` : ''}.
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold">Revenue</h3>
          <dl className="mt-2 text-sm">
            <Row label="Eligible booking revenue" hint={basis.label} value={formatINR(f.revenue.amount)} />
            <Row label="Eligible bookings" value={formatNumber(f.revenue.bookingCount)} muted />
            <Row label="All confirmed booking value" value={formatINR(f.bookings.bookingValue)} muted />
            <Row label="Received from passengers" value={formatINR(f.bookings.paidAmount)} />
            <Row label="Outstanding (unpaid)" value={formatINR(f.bookings.unpaidAmount)} />
            <Row label="Cancelled (excluded)" value={`${f.bookings.cancelledCount} · ${formatINR(f.bookings.cancelledValue)}`} muted />
          </dl>
        </section>

        <section className="rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold">Recorded expenses</h3>
          <dl className="mt-2 text-sm">
            {Object.entries(EXPENSE_GROUPS).map(([g, label]) => (
              <Row key={g} label={label} value={formatINR(f.expenses.byGroup[g])} muted />
            ))}
            <Row label="Paid" value={formatINR(f.expenses.paid)} />
            <Row label="Pending" value={formatINR(f.expenses.pending)} />
            <Row label="Total recorded expenses" value={formatINR(f.expenses.total)} strong />
          </dl>
        </section>

        <section className="rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold">Recorded operating result</h3>
          {f.result.hasData ? (
            <div className={`mt-2 flex items-center gap-2 text-2xl font-bold tabular ${positive ? 'text-emerald-700' : 'text-red-700'}`}>
              {positive ? <TrendingUp size={22} aria-hidden="true" /> : <TrendingDown size={22} aria-hidden="true" />}
              {formatINR(result)}
              <span className="text-xs font-semibold uppercase">{positive ? 'surplus' : 'deficit'}</span>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No bookings or expenses recorded in this period, so no result is shown.</p>
          )}
          <dl className="mt-2 text-sm">
            <Row label="Revenue per completed trip" value={money(f.result.revenuePerCompletedTrip)} hint={`${f.trips.completed} completed trip(s)`} />
            <Row label="Expense per completed trip" value={money(f.result.expensePerCompletedTrip)} />
            <Row label="Avg. booking value per trip" value={money(f.result.averageBookingValuePerTrip)} hint={`${f.trips.eligible} eligible trip(s)`} />
            <Row label="Seat occupancy" value={formatPercent(f.occupancy.rate)} hint={`${f.occupancy.bookedSeats} of ${f.occupancy.sellableSeats} bookable seats`} />
            <Row label="Cash view: collected − paid expenses" value={formatINR(f.cash.net)} muted />
          </dl>
          <p className="mt-2 text-[11px] leading-snug text-slate-500">
            Revenue minus expenses recorded in this app. Not audited net profit — excludes depreciation, financing, tax and any unrecorded costs.
          </p>
        </section>
      </div>
    </div>
  );
}
