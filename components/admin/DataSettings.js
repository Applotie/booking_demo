'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import ConfirmDialog from '../ui/ConfirmDialog';
import { Alert } from '../ui/Misc';
import { useToast } from '../ui/Toast';
import { useAppData } from '@/lib/hooks/use-app-data';
import { resetAllData } from '@/lib/api-client';

const LABELS = {
  routes: 'Routes',
  buses: 'Buses',
  trips: 'Trips',
  schedules: 'Repeating trips',
  bookings: 'Bookings',
  holds: 'Seat holds',
  expenses: 'Expenses',
  maintenance: 'Maintenance records',
  notifications: 'Notifications',
};

// Mounted only while open, so admin pages do not load the data twice.
export default function DataSettings({ open, onClose }) {
  return open ? <DataSettingsDialog onClose={onClose} /> : null;
}

function DataSettingsDialog({ onClose }) {
  const { data, ready, storageBytes } = useAppData();
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();
  const usageKb = ready && storageBytes != null ? Math.round(storageBytes / 1024) : null;

  return (
    <>
      <Modal open onClose={onClose} title="Data & storage" description="All data is stored in the MongoDB Atlas database." size="md">
        <div className="space-y-4 text-sm">
          <Alert tone="info">
            Records are shared by every device and browser that opens this app, and they stay saved when browser data is cleared.
          </Alert>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(LABELS).map(([key, label]) => (
              <div key={key} className="rounded-lg border border-slate-200 p-2.5">
                <div className="text-xs text-slate-500">{label}</div>
                <div className="text-lg font-semibold tabular">{data[key]?.length ?? 0}</div>
              </div>
            ))}
          </div>
          {usageKb != null ? <p className="text-xs text-slate-500">Approximate database size: {usageKb} KB.</p> : null}
          <div className="rounded-lg border border-red-200 p-4">
            <h3 className="font-semibold text-red-800">Reset demo data</h3>
            <p className="mt-1 text-slate-600">Permanently deletes every route, bus, trip, booking, expense and maintenance record from the database.</p>
            <Button variant="danger" size="sm" icon={Trash2} className="mt-3" onClick={() => setConfirming(true)}>
              Reset all data…
            </Button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirming}
        title="Reset all demo data?"
        message="This removes all records from the database for every user. It cannot be undone."
        confirmLabel="Delete everything"
        confirmText="RESET"
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          setConfirming(false);
          const res = await resetAllData('RESET');
          if (!res.ok) {
            toast.error(res.message);
            return;
          }
          onClose();
          toast.success('All demo data was removed.');
        }}
      />
    </>
  );
}
