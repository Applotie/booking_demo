'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2, Bus as BusIcon, Armchair, UserRound, Gauge, TriangleAlert, ArrowRight } from 'lucide-react';
import Button, { IconButton } from '@/components/ui/Button';
import Badge, { StatusBadge } from '@/components/ui/Badge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { PageHeader, EmptyState, Loading } from '@/components/ui/Misc';
import { inputClasses } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import BusForm from '@/components/admin/BusForm';
import { useAppData, useQueryParam } from '@/lib/hooks/use-app-data';
import { setBusStatus, deleteBus, getBusDependencies } from '@/lib/bus-service';
import { getDocumentStatus, getServiceStatus } from '@/lib/maintenance-service';
import { sellableSeatCount } from '@/lib/seat-service';
import { BUS_STATUSES } from '@/lib/constants';
import { formatKm } from '@/lib/formatters';

export default function BusesPage() {
  const { ready, data } = useAppData();
  const toast = useToast();
  const [editing, setEditing] = useState(undefined);
  const [deleting, setDeleting] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const newParam = useQueryParam('new', { consume: true });

  useEffect(() => {
    if (newParam === '1') setEditing(null);
  }, [newParam]);

  const buses = useMemo(
    () =>
      [...data.buses]
        .filter((b) => !statusFilter || b.operationalStatus === statusFilter)
        .sort((a, b) => BUS_STATUSES.indexOf(a.operationalStatus) - BUS_STATUSES.indexOf(b.operationalStatus) || a.name.localeCompare(b.name)),
    [data.buses, statusFilter]
  );

  if (!ready) return <Loading />;

  const deps = deleting ? getBusDependencies(deleting.id, data) : null;
  const hasDeps = deps && deps.trips + deps.expenses + deps.maintenance > 0;
  const tripCountFor = (id) => [...data.trips, ...data.schedules].filter((t) => t.busId === id).length;

  const changeStatus = (bus, status) => {
    const res = setBusStatus(bus.id, status);
    if (res.ok) toast.success(`${bus.name} is now ${status.toLowerCase()}.`);
    else toast.error(res.message);
  };

  return (
    <>
      <PageHeader
        title="Buses"
        description="Fleet, seating layouts, staff and compliance documents."
        actions={
          <Button icon={Plus} onClick={() => setEditing(null)}>
            Add bus
          </Button>
        }
      />
      {data.buses.length === 0 ? (
        <EmptyState
          icon={BusIcon}
          title="No buses yet"
          description="Add a bus with its registration number and seating layout. You can then schedule trips with it."
          action={
            <Button icon={Plus} onClick={() => setEditing(null)}>
              Add bus
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputClasses(false, 'h-9 w-auto')}>
              <option value="">All statuses ({data.buses.length})</option>
              {BUS_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s} ({data.buses.filter((b) => b.operationalStatus === s).length})
                </option>
              ))}
            </select>
          </div>
          {buses.length === 0 ? <p className="text-sm text-slate-500">No buses with this status.</p> : null}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {buses.map((bus) => {
              const docs = getDocumentStatus(bus).filter((d) => d.status === 'expired' || d.status === 'due_soon');
              const svc = getServiceStatus(bus, data.maintenance);
              return (
                <article key={bus.id} className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-start justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <Link href={`/admin/buses/${bus.id}`} className="font-semibold text-ink hover:text-brand-700">
                        {bus.name}
                      </Link>
                      <div className="mt-0.5 font-mono text-xs text-slate-500">{bus.registrationNumber}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{bus.type}</div>
                    </div>
                    <StatusBadge status={bus.operationalStatus} />
                  </div>
                  <dl className="grid grid-cols-2 gap-3 border-t border-slate-100 px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Armchair size={15} className="text-slate-400" aria-hidden="true" />
                      <span>
                        {bus.capacity} seats · {bus.seatLayout?.arrangement}
                        {bus.seatLayout?.blockedSeatIds?.length ? <span className="text-slate-500"> ({sellableSeatCount(bus.seatLayout)} bookable)</span> : null}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Gauge size={15} className="text-slate-400" aria-hidden="true" />
                      {formatKm(bus.odometer)}
                    </div>
                    <div className="col-span-2 flex items-center gap-2">
                      <UserRound size={15} className="text-slate-400" aria-hidden="true" />
                      <span className="truncate">
                        {bus.driver?.name || <span className="text-slate-400">No driver</span>}
                        {bus.conductor?.name ? <span className="text-slate-500"> · {bus.conductor.name}</span> : null}
                      </span>
                    </div>
                  </dl>
                  {docs.length || svc.status === 'overdue' || svc.status === 'due_soon' ? (
                    <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-4 py-2">
                      {docs.map((d) => (
                        <Badge key={d.key} tone={d.status === 'expired' ? 'danger' : 'warning'} icon={TriangleAlert}>
                          {d.label} {d.status === 'expired' ? 'expired' : `in ${d.daysLeft}d`}
                        </Badge>
                      ))}
                      {svc.status === 'overdue' ? <Badge tone="danger" icon={TriangleAlert}>Service overdue</Badge> : null}
                      {svc.status === 'due_soon' ? <Badge tone="warning">Service due soon</Badge> : null}
                    </div>
                  ) : null}
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
                    <select
                      aria-label={`Status of ${bus.name}`}
                      value={bus.operationalStatus}
                      onChange={(e) => changeStatus(bus, e.target.value)}
                      className={inputClasses(false, 'h-8 w-auto text-xs')}
                    >
                      {BUS_STATUSES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1">
                      <IconButton icon={Pencil} label={`Edit ${bus.name}`} onClick={() => setEditing(bus)} />
                      <IconButton icon={Trash2} label={`Delete ${bus.name}`} variant="danger-ghost" onClick={() => setDeleting(bus)} />
                      <Button size="sm" variant="secondary" href={`/admin/buses/${bus.id}`} icon={ArrowRight}>
                        Profile
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      <BusForm open={editing !== undefined} bus={editing} tripCount={editing ? tripCountFor(editing.id) : 0} onClose={() => setEditing(undefined)} />
      <ConfirmDialog
        open={Boolean(deleting)}
        title={hasDeps ? 'Bus has history' : 'Delete bus?'}
        message={
          hasDeps
            ? `${deleting.name} has ${deps.trips} trip(s), ${deps.expenses} expense(s) and ${deps.maintenance} maintenance record(s). To keep that history, set the bus to Inactive instead of deleting it.`
            : `${deleting?.name} has no trips, expenses or maintenance records and will be permanently deleted.`
        }
        confirmLabel={hasDeps ? 'Set to Inactive' : 'Delete bus'}
        tone={hasDeps ? 'primary' : 'danger'}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (hasDeps) changeStatus(deleting, 'Inactive');
          else {
            const res = deleteBus(deleting.id);
            if (res.ok) toast.success('Bus deleted.');
            else toast.error(res.message);
          }
          setDeleting(null);
        }}
      />
    </>
  );
}
