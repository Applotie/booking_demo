'use client';

import { useMemo, useState, useEffect } from 'react';
import { Plus, Pencil, Power, Trash2, Route as RouteIcon, Search } from 'lucide-react';
import Button, { IconButton } from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DataTable from '@/components/DataTable';
import { PageHeader, EmptyState, Loading } from '@/components/ui/Misc';
import { inputClasses } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import RouteForm from '@/components/admin/RouteForm';
import { useAppData, useQueryParam } from '@/lib/hooks/use-app-data';
import { setRouteActive, deleteRoute } from '@/lib/route-service';
import { formatINR, formatDuration } from '@/lib/formatters';

export default function RoutesPage() {
  const { ready, data } = useAppData();
  const toast = useToast();
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new
  const [deleting, setDeleting] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const newParam = useQueryParam('new', { consume: true });

  useEffect(() => {
    if (newParam === '1') setEditing(null);
  }, [newParam]);

  const tripCounts = useMemo(() => {
    const m = {};
    data.trips.forEach((t) => (m[t.routeId] = (m[t.routeId] || 0) + 1));
    return m;
  }, [data.trips]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...data.routes]
      .filter((r) => (!status || (status === 'active' ? r.isActive : !r.isActive)))
      .filter((r) => !q || `${r.name} ${r.source} ${r.destination} ${(r.stops || []).join(' ')}`.toLowerCase().includes(q))
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
  }, [data.routes, search, status]);

  if (!ready) return <Loading />;

  const toggle = (route) => {
    const res = setRouteActive(route.id, !route.isActive);
    if (res.ok) toast.success(`Route ${res.record.isActive ? 'activated' : 'deactivated'}.`);
    else toast.error(res.message);
  };

  const columns = [
    {
      key: 'name',
      header: 'Route',
      render: (r) => (
        <div>
          <div className="font-medium text-ink">{r.name}</div>
          <div className="text-xs text-slate-500">
            {r.source} → {r.destination}
          </div>
        </div>
      ),
    },
    {
      key: 'stops',
      header: 'Stops',
      hideBelow: 'md',
      render: (r) => (r.stops?.length ? <span className="text-slate-600">{r.stops.join(', ')}</span> : <span className="text-slate-400">Direct</span>),
    },
    { key: 'fare', header: 'Default fare', align: 'right', render: (r) => <span className="tabular">{formatINR(r.defaultFare)}</span> },
    { key: 'duration', header: 'Duration', hideBelow: 'sm', render: (r) => formatDuration(r.duration) },
    { key: 'trips', header: 'Trips', align: 'right', hideBelow: 'sm', render: (r) => <span className="tabular">{tripCounts[r.id] || 0}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={r.isActive ? 'success' : 'neutral'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <IconButton icon={Pencil} label={`Edit ${r.name}`} onClick={() => setEditing(r)} />
          <IconButton icon={Power} label={r.isActive ? 'Deactivate' : 'Activate'} onClick={() => toggle(r)} />
          <IconButton icon={Trash2} label="Delete" variant="danger-ghost" onClick={() => setDeleting(r)} />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Routes"
        description="Journey paths with stops, default fare and duration. Deactivate routes you no longer run — history is kept."
        actions={
          <Button icon={Plus} onClick={() => setEditing(null)}>
            New route
          </Button>
        }
      />
      {data.routes.length === 0 ? (
        <EmptyState
          icon={RouteIcon}
          title="No routes yet"
          description="Create your first route (e.g. Pune → Mumbai) to start scheduling trips."
          action={
            <Button icon={Plus} onClick={() => setEditing(null)}>
              Create route
            </Button>
          }
        />
      ) : (
        <Card bodyClassName="p-0">
          <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
            <div className="relative min-w-48 flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input aria-label="Search routes" placeholder="Search routes or stops" value={search} onChange={(e) => setSearch(e.target.value)} className={inputClasses(false, 'h-9 pl-9')} />
            </div>
            <select aria-label="Status filter" value={status} onChange={(e) => setStatus(e.target.value)} className={inputClasses(false, 'h-9 w-auto')}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <DataTable columns={columns} rows={rows} emptyMessage="No routes match your filters." />
        </Card>
      )}

      <RouteForm open={editing !== undefined} route={editing} onClose={() => setEditing(undefined)} />
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete route?"
        message={
          deleting && tripCounts[deleting.id]
            ? `“${deleting.name}” has ${tripCounts[deleting.id]} trip(s) in its history and cannot be deleted. Deactivate it instead.`
            : `“${deleting?.name}” has no trips and will be permanently deleted.`
        }
        confirmLabel="Delete route"
        disabled={Boolean(deleting && tripCounts[deleting.id])}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const res = deleteRoute(deleting.id);
          if (res.ok) toast.success('Route deleted.');
          else toast.error(res.message);
          setDeleting(null);
        }}
      />
    </>
  );
}
