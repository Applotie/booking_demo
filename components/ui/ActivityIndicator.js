'use client';

import { useEffect, useState } from 'react';
import { useActivity } from '@/lib/activity';

// Delay before the "Saving…" screen appears, so quick saves do not flash.
const OVERLAY_DELAY_MS = 250;

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={`motion-safe:animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// The loading card used everywhere: a large spinner and a message.
export function LoadingCard({ label = 'Loading…' }) {
  return (
    <div className="flex min-w-[15rem] flex-col items-center gap-4 rounded-2xl bg-white px-10 py-8 text-center shadow-2xl ring-1 ring-slate-900/5">
      <Spinner className="h-12 w-12 text-brand-600" />
      <span className="text-base font-semibold text-ink">{label}</span>
    </div>
  );
}

// Centred on the screen above the page's placeholder layout while its data
// loads. Clicks pass through; nothing on the page can be used yet anyway.
export function CenteredLoading({ label = 'Loading…' }) {
  return (
    <div className="no-print pointer-events-none fixed inset-0 z-40 flex items-center justify-center px-4" role="status" aria-live="polite" aria-busy="true">
      <LoadingCard label={label} />
    </div>
  );
}

// Global loading feedback: a progress bar at the top of the screen while
// anything loads or saves, and a "Saving…" screen while data is being changed.
export default function ActivityIndicator() {
  const { loading, saving, label } = useActivity();
  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    if (!saving) {
      setShowOverlay(false);
      return undefined;
    }
    const t = setTimeout(() => setShowOverlay(true), OVERLAY_DELAY_MS);
    return () => clearTimeout(t);
  }, [saving]);

  return (
    <>
      {loading ? (
        <div className="no-print pointer-events-none fixed inset-x-0 top-0 z-[70] h-1 overflow-hidden bg-brand-100" role="progressbar" aria-label="Loading" aria-busy="true">
          <div className="activity-bar h-full w-1/3 bg-brand-600" />
        </div>
      ) : null}
      {showOverlay ? (
        <div className="no-print fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/30 px-4 backdrop-blur-[2px]" role="status" aria-live="polite" aria-busy="true">
          <LoadingCard label={label || 'Saving…'} />
        </div>
      ) : null}
    </>
  );
}

// Full-area loading screen for route changes and first page loads.
export function PageLoading({ label = 'Loading…', className = '' }) {
  return (
    <div className={`flex min-h-[70vh] items-center justify-center ${className}`} role="status" aria-live="polite" aria-busy="true">
      <LoadingCard label={label} />
    </div>
  );
}
