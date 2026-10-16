'use client';

import { useState } from 'react';
import { TriangleAlert, Trash2 } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import ConfirmDialog from '../ui/ConfirmDialog';
import { Alert } from '../ui/Misc';
import { useToast } from '../ui/Toast';
import { useAppData } from '@/lib/hooks/use-app-data';
import { resetAllData, getStorageUsage, clearStorageIssues } from '@/lib/storage';
import { formatDateTime } from '@/lib/formatters';

const LABELS = {
  routes: 'Routes',
  buses: 'Buses',
  trips: 'Trips',
  bookings: 'Bookings',
  holds: 'Seat holds',
  expenses: 'Expenses',
  maintenance: 'Maintenance records',
  notifications: 'Notifications',
};

export default function DataSettings({ open, onClose }) {
  const { data, issues, ready } = useAppData();
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();
  const usageKb = ready && open ? Math.round(getStorageUsage() / 1024) : 0;

  return (
    <>
      <Modal open={open} onClose={onClose} title="Data & storage" description="All data is stored in this browser's localStorage." size="md">
        <div className="space-y-4 text-sm">
          <Alert tone="info">
            This is a single-browser demo. Records are not shared with other devices or browsers. Clearing site data in the browser
            removes them permanently.
          </Alert>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(LABELS).map(([key, label]) => (
              <div key={key} className="rounded-lg border border-slate-200 p-2.5">
                <div className="text-xs text-slate-500">{label}</div>
                <div className="text-lg font-semibold tabular">{data[key]?.length ?? 0}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500">Approximate storage used: {usageKb} KB (browsers typically allow about 5 MB).</p>
          {issues.length ? (
            <Alert
              tone="warning"
              icon={TriangleAlert}
              title="Storage problems detected"
              action={
                <Button size="xs" variant="secondary" onClick={() => clearStorageIssues()}>
                  Dismiss
                </Button>
              }
            >
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {issues.map((i, idx) => (
                  <li key={idx}>
                    {i.message} <span className="text-xs opacity-70">({formatDateTime(i.at)})</span>
                  </li>
                ))}
              </ul>
            </Alert>
          ) : null}
          <div className="rounded-lg border border-red-200 p-4">
            <h3 className="font-semibold text-red-800">Reset demo data</h3>
            <p className="mt-1 text-slate-600">Permanently deletes every route, bus, trip, booking, expense and maintenance record stored in this browser.</p>
            <Button variant="danger" size="sm" icon={Trash2} className="mt-3" onClick={() => setConfirming(true)}>
              Reset all data…
            </Button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirming}
        title="Reset all demo data?"
        message="This removes all records from this browser. It cannot be undone."
        confirmLabel="Delete everything"
        confirmText="RESET"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          resetAllData();
          setConfirming(false);
          onClose();
          toast.success('All demo data was removed.');
        }}
      />
    </>
  );
}
