'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2, Receipt, Users, Wrench, Search, CircleCheck, Hourglass } from 'lucide-react';
import Button, { IconButton } from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge, { StatusBadge } from '@/components/ui/Badge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DataTable from '@/components/DataTable';
import { PageHeader, EmptyState, Loading, StatCard } from '@/components/ui/Misc';
import { inputClasses } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import ExpenseForm from '@/components/ExpenseForm';
import SalaryBatchForm from '@/components/SalaryBatchForm';
import DateRangeFilter, { resolveRange, describeRange } from '@/components/DateRangeFilter';
import { HorizontalBars } from '@/components/Charts';
import { useAppData, useQueryParam } from '@/lib/hooks/use-app-data';
import { filterExpenses, deleteExpense, setExpensePaymentStatus } from '@/lib/expense-service';
import { summarizeExpenses, categoryRows } from '@/lib/reporting-service';
import { monthRange, monthKey } from '@/lib/dates';
import { formatINR, formatDate, formatMonth } from '@/lib/formatters';
import { EXPENSE_CATEGORIES, EXPENSE_GROUPS, EXPENSE_PAYMENT_STATUSES, categoryLabel } from '@/lib/constants';

export default function ExpensesPage() {
  const { ready, data } = useAppData();
  const toast = useToast();
  const [editing, setEditing] = useState(undefined);
  const [salaryOpen, setSalaryOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [range, setRange] = useState({ preset: 'month', from: '', to: '', month: '' });
  const [filters, setFilters] = useState({ busId: '', category: '', paymentStatus: '', search: '' });
  const newParam = useQueryParam('new', { consume: true });
  const busParam = useQueryParam('bus');

  useEffect(() => {
    if (newParam === '1') setEditing(null);
    if (newParam === 'salary') setSalaryOpen(true);
  }, [newParam]);
  useEffect(() => {
    if (busParam) setFilters((f) => ({ ...f, busId: busParam }));
  }, [busParam]);

  const resolved = resolveRange(range);
  const rows = useMemo(
    () => filterExpenses(data.expenses, { ...filters, range: resolved }).sort((a, b) => b.expenseDate.localeCompare(a.expenseDate) || b.createdAt.localeCompare(a.createdAt)),
    [data.expenses, filters, resolved]
  );
  const summary = useMemo(() => summarizeExpenses(rows), [rows]);
  const currentMonth = useMemo(
    () => summarizeExpenses(filterExpenses(data.expenses, { busId: filters.busId, range: monthRange(monthKey()) })).total,
    [data.expenses, filters.busId]
  );
  const topBus = useMemo(() => {
    const byBus = {};
    rows.forEach((e) => (byBus[e.busId] = (byBus[e.busId] || 0) + e.amount));
    const [id, amount] = Object.entries(byBus).sort((a, b) => b[1] - a[1])[0] || [];
    return id ? { bus: data.buses.find((b) => b.id === id), amount } : null;
  }, [rows, data.buses]);

  if (!ready) return <Loading />;

  const busName = (id) => data.buses.find((b) => b.id === id)?.name || 'Unknown bus';
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  const columns = [
    { key: 'date', header: 'Date', render: (e) => <span className="whitespace-nowrap">{formatDate(e.expenseDate)}</span> },
    {
      key: 'desc',
      header: 'Expense',
      render: (e) => (
        <div className="max-w-72">
          <div className="font-medium">{e.description}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span>{categoryLabel(e.category)}</span>
            {e.salaryPeriod ? <span>· {formatMonth(e.salaryPeriod)}</span> : null}
            {e.isAdjustment ? <Badge tone="info">Adjustment</Badge> : null}
            {e.maintenanceRecordId ? (
              <Link href="/admin/maintenance" className="inline-flex">
                <Badge tone="brand" icon={Wrench}>
                  Maintenance
                </Badge>
              </Link>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: 'bus',
      header: 'Bus',
      hideBelow: 'md',
      render: (e) => (
        <Link href={`/admin/buses/${e.busId}`} className="hover:text-brand-700">
          {busName(e.busId)}
        </Link>
      ),
    },
    {
      key: 'recipient',
      header: 'Paid to',
      hideBelow: 'lg',
      render: (e) => (
        <div className="text-slate-600">
          {e.recipient || '—'}
          {e.receiptReference ? <div className="text-xs text-slate-400">Ref {e.receiptReference}</div> : null}
        </div>
      ),
    },
    { key: 'amount', header: 'Amount', align: 'right', render: (e) => <span className="font-medium tabular">{formatINR(e.amount)}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (e) => (
        <button
          type="button"
          title={`Mark as ${e.paymentStatus === 'Paid' ? 'Pending' : 'Paid'}`}
          onClick={() => {
            const res = setExpensePaymentStatus(e.id, e.paymentStatus === 'Paid' ? 'Pending' : 'Paid');
            if (res.ok) toast.success(`Marked ${res.record.paymentStatus.toLowerCase()}.`);
          }}
        >
          <StatusBadge status={e.paymentStatus} />
        </button>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (e) =>
        e.maintenanceRecordId ? (
          <Link href="/admin/maintenance" className="text-xs font-medium text-slate-500 hover:text-ink">
            Edit in maintenance
          </Link>
        ) : (
          <div className="flex justify-end gap-1">
            <IconButton icon={Pencil} label="Edit expense" onClick={() => setEditing(e)} />
            <IconButton icon={Trash2} label="Delete expense" variant="danger-ghost" onClick={() => setDeleting(e)} />
          </div>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Bus-wise operating costs: salaries, fuel, maintenance, documents and more."
        actions={
          data.buses.length ? (
            <>
              <Button variant="secondary" icon={Users} onClick={() => setSalaryOpen(true)}>
                Monthly salaries
              </Button>
              <Button icon={Plus} onClick={() => setEditing(null)}>
                Record expense
              </Button>
            </>
          ) : null
        }
      />

      {data.buses.length === 0 ? (
        <EmptyState icon={Receipt} title="Add a bus first" description="Every expense belongs to a bus. Add your first bus to start recording expenses." action={<Button href="/admin/buses?new=1">Add bus</Button>} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <DateRangeFilter value={range} onChange={setRange} allowMonth />
          </div>
          <p className="mb-3 text-xs text-slate-500">
            Figures below reflect the current filters · {describeRange(range)}
            {filters.busId ? ` · ${busName(filters.busId)}` : ' · all buses'}
          </p>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total recorded" value={formatINR(summary.total)} hint={`${summary.count} record(s)`} />
            <StatCard label="This month" value={formatINR(currentMonth)} hint={formatMonth(monthKey())} />
            <StatCard label="Paid" value={formatINR(summary.paid)} tone="success" icon={CircleCheck} />
            <StatCard label="Pending" value={formatINR(summary.pending)} tone={summary.pending > 0 ? 'warning' : 'neutral'} icon={Hourglass} />
            <StatCard label={EXPENSE_GROUPS.fuel} value={formatINR(summary.byGroup.fuel)} />
            <StatCard label={EXPENSE_GROUPS.salary} value={formatINR(summary.byGroup.salary)} />
            <StatCard label={EXPENSE_GROUPS.maintenance} value={formatINR(summary.byGroup.maintenance)} />
            <StatCard label="Documents & other" value={formatINR(summary.byGroup.documents + summary.byGroup.other)} hint={`Docs ${formatINR(summary.byGroup.documents)} · Other ${formatINR(summary.byGroup.other)}`} />
          </div>

          <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card title="By category" description="Share of recorded expenses in the selection">
              <HorizontalBars rows={categoryRows(summary.byCategory).map((r) => ({ key: r.category, label: r.label, value: r.amount }))} />
            </Card>
            <Card title="Highest-cost bus">
              {topBus ? (
                <div>
                  <Link href={`/admin/buses/${topBus.bus?.id}`} className="text-lg font-semibold hover:text-brand-700">
                    {topBus.bus?.name || 'Unknown bus'}
                  </Link>
                  <div className="text-2xl font-bold tabular">{formatINR(topBus.amount)}</div>
                  <p className="mt-1 text-xs text-slate-500">Highest recorded expenses in the current selection.</p>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No expenses in this selection.</p>
              )}
            </Card>
          </div>

          <Card bodyClassName="p-0">
            <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
              <div className="relative min-w-48 flex-1">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input aria-label="Search expenses" placeholder="Search description, vendor, staff…" value={filters.search} onChange={set('search')} className={inputClasses(false, 'h-9 pl-9')} />
              </div>
              <select aria-label="Bus" value={filters.busId} onChange={set('busId')} className={inputClasses(false, 'h-9 w-auto')}>
                <option value="">All buses</option>
                {data.buses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <select aria-label="Category" value={filters.category} onChange={set('category')} className={inputClasses(false, 'h-9 w-auto')}>
                <option value="">All categories</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <select aria-label="Payment status" value={filters.paymentStatus} onChange={set('paymentStatus')} className={inputClasses(false, 'h-9 w-auto')}>
                <option value="">Paid & pending</option>
                {EXPENSE_PAYMENT_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <DataTable
              columns={columns}
              rows={rows}
              emptyMessage={data.expenses.length ? 'No expenses match these filters.' : 'No expenses recorded yet. Use “Record expense” to add the first one.'}
              footer={
                rows.length ? (
                  <tr>
                    <td className="px-4 py-3 text-sm" colSpan={2}>
                      Total ({rows.length})
                    </td>
                    <td className="hidden md:table-cell" />
                    <td className="hidden lg:table-cell" />
                    <td className="px-4 py-3 text-right tabular">{formatINR(summary.total)}</td>
                    <td colSpan={2} />
                  </tr>
                ) : null
              }
            />
          </Card>
        </>
      )}

      <ExpenseForm open={editing !== undefined} expense={editing} defaultBusId={filters.busId} data={data} onClose={() => setEditing(undefined)} />
      <SalaryBatchForm open={salaryOpen} defaultBusId={filters.busId} data={data} onClose={() => setSalaryOpen(false)} />
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete expense?"
        message={deleting ? `${deleting.description} – ${formatINR(deleting.amount)} will be permanently removed and all totals updated.` : ''}
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const res = deleteExpense(deleting.id);
          if (res.ok) toast.success('Expense deleted.');
          else toast.error(res.message);
          setDeleting(null);
        }}
      />
    </>
  );
}
