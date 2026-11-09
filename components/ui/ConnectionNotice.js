'use client';

import { useEffect, useState } from 'react';
import { CloudOff } from 'lucide-react';
import { LOAD_STATUS_EVENT } from '@/lib/hooks/use-app-data';

// Small banner shown while the server cannot be reached. Pages keep showing
// the last data they loaded and reload automatically once it is back.
export default function ConnectionNotice() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const onStatus = (e) => setOffline(!e.detail?.ok);
    window.addEventListener(LOAD_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(LOAD_STATUS_EVENT, onStatus);
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="no-print fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-2">
      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 shadow">
        <CloudOff size={16} aria-hidden="true" />
        Could not load the latest data. Retrying…
      </div>
    </div>
  );
}
