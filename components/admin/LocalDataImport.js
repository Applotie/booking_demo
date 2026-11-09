'use client';

import { useEffect, useState } from 'react';
import { DatabaseBackup, TriangleAlert, CircleCheck } from 'lucide-react';
import Button from '../ui/Button';
import { Alert } from '../ui/Misc';
import { importLegacyData, notifyDataChanged } from '@/lib/api-client';
import { LEGACY_KEYS, LEGACY_PREFIX } from '@/lib/storage-keys';

// Collections the server accepts (seat holds expire within minutes and are skipped).
const IMPORTABLE = ['routes', 'buses', 'trips', 'schedules', 'bookings', 'expenses', 'maintenance', 'notifications'];

// Reads what the old localStorage-only version of the app left in this
// browser. Unreadable values are reported, never deleted.
function readLegacy() {
  let storage;
  try {
    storage = window.localStorage;
  } catch {
    return null;
  }
  const collections = {};
  const unreadable = [];
  let total = 0;
  for (const name of IMPORTABLE) {
    let raw = null;
    try {
      raw = storage.getItem(LEGACY_KEYS[name]);
    } catch {
      /* ignore */
    }
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('not a list');
      const records = parsed.filter((r) => r && typeof r === 'object' && !Array.isArray(r) && typeof r.id === 'string' && r.id);
      if (records.length) {
        collections[name] = records;
        total += records.length;
      }
    } catch {
      unreadable.push(name);
    }
  }
  return total ? { collections, total, unreadable } : null;
}

// Removes the old app's keys only after the server confirmed every record.
function clearLegacy() {
  try {
    const storage = window.localStorage;
    const keys = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(`${LEGACY_PREFIX}:`)) keys.push(key);
    }
    keys.forEach((k) => storage.removeItem(k));
  } catch {
    /* ignore */
  }
}

export default function LocalDataImport() {
  const [legacy, setLegacy] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | importing | done | partial | error
  const [report, setReport] = useState(null);

  useEffect(() => {
    setLegacy(readLegacy());
  }, []);

  if (!legacy && status !== 'done') return null;

  const run = async () => {
    if (status === 'importing') return;
    setStatus('importing');
    const res = await importLegacyData(legacy.collections);
    if (!res.ok) {
      setReport({ message: res.message });
      setStatus('error');
      return;
    }
    setReport(res);
    notifyDataChanged();
    if (res.complete && !legacy.unreadable.length) {
      clearLegacy();
      setLegacy(null);
      setStatus('done');
    } else {
      setStatus('partial');
    }
  };

  if (status === 'done') {
    const inserted = Object.values(report.results).reduce((s, r) => s + r.inserted, 0);
    const existing = Object.values(report.results).reduce((s, r) => s + r.existing, 0);
    return (
      <Alert tone="success" icon={CircleCheck} className="mb-6" title="Browser data imported">
        {inserted} record(s) were added to the database{existing ? ` and ${existing} were already there` : ''}. The old copy in this browser was removed.
      </Alert>
    );
  }

  const failures = report?.results ? Object.entries(report.results).flatMap(([name, r]) => r.failed.map((f) => ({ name, ...f }))) : [];

  return (
    <Alert
      tone={status === 'partial' || status === 'error' ? 'warning' : 'info'}
      icon={status === 'partial' || status === 'error' ? TriangleAlert : DatabaseBackup}
      className="mb-6"
      title="Data from the previous version found in this browser"
      action={
        <Button size="sm" onClick={run} disabled={status === 'importing'}>
          {status === 'importing' ? 'Importing…' : status === 'idle' ? 'Import into database' : 'Try again'}
        </Button>
      }
    >
      <p>
        This browser still holds {legacy.total} record(s) saved before the app moved to the shared database. Import them so they appear here and on other
        devices. Records that are already in the database are skipped, never overwritten. The browser copy is only removed after every record is saved.
      </p>
      {legacy.unreadable.length ? <p className="mt-1">Some stored data could not be read and will stay in this browser: {legacy.unreadable.join(', ')}.</p> : null}
      {status === 'error' ? <p className="mt-1 font-medium">{report?.message}</p> : null}
      {status === 'partial' && failures.length ? (
        <div className="mt-2">
          <p className="font-medium">{failures.length} record(s) could not be imported. The browser copy has been kept.</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {failures.slice(0, 10).map((f, i) => (
              <li key={i}>
                {f.name} {f.id || '(no id)'}: {f.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Alert>
  );
}
