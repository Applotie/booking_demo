'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2, Wrench, TriangleAlert } from 'lucide-react';
import Button, { IconButton } from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge, { StatusBadge } from '@/components/ui/Badge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DataTable from '@/components/DataTable';
import { PageHeader, EmptyState, Loading, StatCard, Alert } from '@/components/ui/Misc';
import { inputClasses } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import MaintenanceForm from '@/components/MaintenanceForm';
import ReminderList from '@/components/admin/ReminderList';
import DateRangeFilter, { resolveRange, describeRange } from '@/components/DateRangeFilter';
import { useAppData, useQueryParam } from '@/lib/hooks/use-app-data';
import { deleteMaintenance, getReminders, getServiceStatus, checkMaintenanceIntegrity, repairMaintenanceLinks } from '@/lib/maintenance-service';
import { inRange } from '@/lib/dates';
import { formatINR, formatDate, formatKm } from '@/lib/formatters';

const SERVICE_BADGE = {
  overdue: <Badge tone="danger">Overdue</Badge>,
  due_soon: <Badge tone="warning">Due soon</Badge>,
  ok: <Badge tone="success">On track</Badge>,
  none: <Badge>Not planned</Badge>,
};

export default function MaintenancePage() {
  const { ready, data } = useAppData();
  const toast = useToast();
  const [editing, setEditing] = useState(undefined);
  const [deleting, setDeleting] = useState(null);
  const [busId, setBusId] = useState('');
  const [range, setRange] = useState({ preset: 'all', from: '', to: '', month: '' });
  const newParam = useQueryParam('new', { consume: true });

  useEffect(() => {
    if (newParam === '1') setEditing(null);
  }, [newParam]);

  const resolved = resolveRange(range);
  const records = useMemo(
    () =>
      data.maintenance
        .filter((m) => (!busId || m.busId === busId) && inRange(m.serviceDate, resolved))
        .sort((a, b) => b.serviceDate.localeCompare(a.serviceDate) || b.createdAt.localeCompare(a.createdAt)),
    [data.maintenance, busId, resolved]
  );

  if (!ready) return <Loading />;

  const reminders = getReminders(data).filter((r) => !busId || r.busId === busId);
  const issues = checkMaintenanceIntegrity(data);
  const busName = (id) => data.buses.find((b) => b.id === id)?.name || 'Unknown bus';
  const expenseOf = (m) => data.expenses.find((e) => e.id === m.expenseId);
  // Costs come from the linked expense records so they match expense totals exactly.
  const periodCost = records.reduce((s, m) => s + (expenseOf(m)?.amount || 0), 0);
  const pendingCost = records.reduce((s, m) => s + (expenseOf(m)?.paymentStatus === 'Pending' ? expenseOf(m).amount : 0), 0);
  const fleetStatus = data.buses
    .filter((b) => b.operationalStatus !== 'Inactive' && (!busId || b.id === busId))
    .map((b) => ({ bus: b, ...getServiceStatus(b, data.maintenance) }));

  const columns = [
    { key: 'date', header: 'Date', render: (m) => <span className="whitespace-nowrap">{formatDate(m.serviceDate)}</span> },
    {
      key: 'work',
      header: 'Service',
      render: (m) => (
        <div className="max-w-80">
          <div className="font-medium">{m.serviceType}</div>
          <div className="text-xs text-slate-500">{m.workPerformed}</div>
        </div>
      ),
    },
    { key: 'bus', header: 'Bus', hideBelow: 'md', render: (m) => <Link href={`/admin/buses/${m.busId}`} className="hover:text-brand-700">{busName(m.busId)}</Link> },
    { key: 'provider', header: 'Provider', hideBelow: 'lg', render: (m) => m.provider || '—' },
    { key: 'odo', header: 'Odometer', align: 'right', hideBelow: 'sm', render: (m) => <span className="tabular">{formatKm(m.odometer)}</span> },
    {
      key: 'cost',
      header: 'Cost',
      align: 'right',
      render: (m) => {
        const exp = expenseOf(m);
        return m.cost > 0 ? (
          <div className="flex flex-col items-end gap-1">
            <span className="tabular font-medium">{formatINR(m.cost)}</span>
            {exp ? <StatusBadge status={exp.paymentStatus} /> : <Badge tone="danger">No expense link</Badge>}
          </div>
        ) : (
          <span className="text-slate-400">No cost</span>
        );
      },
    },
    {
      key: 'next',
      header: 'Next service',
      hideBelow: 'lg',
      render: (m) => (
        <div className="text-xs">
          {m.nextServiceDate ? <div>{formatDate(m.nextServiceDate)}</div> : null}
          {m.nextServiceOdometer != null ? <div className="text-slate-500">{formatKm(m.nextServiceOdometer)}</div> : null}
          {!m.nextServiceDate && m.nextServiceOdometer == null ? '—' : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (m) => (
        <div className="flex justify-end gap-1">
          <IconButton icon={Pencil} label="Edit record" onClick={() => setEditing(m)} />
          <IconButton icon={Trash2} label="Delete record" variant="danger-ghost" onClick={() => setDeleting(m)} />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Maintenance"
        description="Service history, linked costs, odometer tracking and compliance reminders."
        actions={
          data.buses.length ? (
            <Button icon={Plus} onClick={() => setEditing(null)}>
              Record maintenance
            </Button>
          ) : null
        }
      />
      {data.buses.length === 0 ? (
        <EmptyState icon={Wrench} title="Add a bus first" description="Maintenance records and reminders are tracked per bus." action={<Button href="/admin/buses?new=1">Add bus</Button>} />
      ) : (
        <div className="space-y-4">
          {issues.length ? (
            <Alert
              tone="warning"
              icon={TriangleAlert}
              title="Some maintenance costs are not linked correctly"
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    repairMaintenanceLinks();
                    toast.success('Maintenance expense links repaired.');
                  }}
                >
                  Repair links
                </Button>
              }
            >
              {issues.length} issue(s) found (missing, duplicate or orphaned linked expenses). Repairing makes every costed record own exactly one expense.
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Bus" value={busId} onChange={(e) => setBusId(e.target.value)} className={inputClasses(false, 'h-9 w-auto')}>
              <option value="">All buses</option>
              {data.buses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <DateRangeFilter value={range} onChange={setRange} allowMonth />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Service records" value={records.length} hint={describeRange(range)} />
            <StatCard label="Maintenance cost" value={formatINR(periodCost)} hint="From linked expenses" />
            <StatCard label="Pending payment" value={formatINR(pendingCost)} tone={pendingCost ? 'warning' : 'neutral'} />
            <StatCard label="Reminders" value={reminders.length} tone={reminders.some((r) => r.severity === 'overdue') ? 'danger' : reminders.length ? 'warning' : 'neutral'} hint={`${reminders.filter((r) => r.severity === 'overdue').length} overdue`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Reminders" description="Documents expiring within 30 days, services due within 14 days or 1,000 km. Shown here only — no external alerts are sent.">
              <ReminderList reminders={reminders} />
            </Card>
            <Card title="Service status by bus" bodyClassName="p-0">
              <DataTable
                dense
                rowKey={(r) => r.bus.id}
                rows={fleetStatus}
                emptyMessage="No active buses."
                columns={[
                  {
                    key: 'bus',
                    header: 'Bus',
                    render: (r) => (
                      <div>
                        <Link href={`/admin/buses/${r.bus.id}`} className="font-medium hover:text-brand-700">
                          {r.bus.name}
                        </Link>
                        <div className="text-xs text-slate-500">{formatKm(r.bus.odometer)}</div>
                      </div>
                    ),
                  },
                  { key: 'last', header: 'Last service', render: (r) => (r.lastServiceDate ? formatDate(r.lastServiceDate) : '—') },
                  {
                    key: 'next',
                    header: 'Next',
                    render: (r) => (
                      <div className="text-xs">
                        <div>{r.nextServiceDate ? formatDate(r.nextServiceDate) : '—'}</div>
                        {r.nextServiceOdometer != null ? <div className="text-slate-500">{formatKm(r.nextServiceOdometer)}</div> : null}
                      </div>
                    ),
                  },
                  { key: 'status', header: 'Status', render: (r) => SERVICE_BADGE[r.status] },
                ]}
              />
            </Card>
          </div>

          <Card title="Service history" bodyClassName="p-0">
            <DataTable columns={columns} rows={records} emptyMessage={data.maintenance.length ? 'No records match these filters.' : 'No maintenance recorded yet.'} />
          </Card>
        </div>
      )}

      <MaintenanceForm open={editing !== undefined} record={editing} defaultBusId={busId} data={data} onClose={() => setEditing(undefined)} />
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete maintenance record?"
        message={deleting ? `${deleting.serviceType} on ${formatDate(deleting.serviceDate)} will be removed${deleting.cost > 0 ? `, together with its linked expense of ${formatINR(deleting.cost)}` : ''}.` : ''}
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const res = deleteMaintenance(deleting.id);
          if (res.ok) toast.success('Maintenance record deleted.');
          else toast.error(res.message);
          setDeleting(null);
        }}
      />
    </>
  );
}
