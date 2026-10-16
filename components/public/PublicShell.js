'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bus, Ticket, Search } from 'lucide-react';
import { BRAND_NAME } from '@/lib/constants';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Input } from '../ui/Field';

function FindBooking({ open, onClose }) {
  const [ref, setRef] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();
  const submit = (e) => {
    e.preventDefault();
    const v = ref.trim().toUpperCase();
    if (!v) {
      setError('Enter your booking ID.');
      return;
    }
    onClose();
    setRef('');
    router.push(`/booking/${encodeURIComponent(v)}`);
  };
  return (
    <Modal open={open} onClose={onClose} title="Find your booking" size="sm">
      <form onSubmit={submit} className="space-y-4">
        <Input label="Booking ID" placeholder="e.g. BK7H2KQ9" value={ref} onChange={(e) => { setRef(e.target.value); setError(''); }} error={error} autoComplete="off" />
        <p className="text-xs text-slate-500">This demo stores bookings in this browser only, so bookings made on another device will not be found here.</p>
        <Button type="submit" block icon={Search}>
          Find booking
        </Button>
      </form>
    </Modal>
  );
}

export default function PublicShell({ children }) {
  const [finding, setFinding] = useState(false);
  return (
    <div className="flex min-h-screen flex-col bg-[#f6f7f9]">
      <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Bus size={20} aria-hidden="true" />
            </span>
            <span className="text-lg font-bold tracking-tight text-ink">{BRAND_NAME}</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm font-medium" aria-label="Main">
            <Link href="/" className="hidden rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-100 sm:inline-block">
              Bus tickets
            </Link>
            <button type="button" onClick={() => setFinding(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-100">
              <Ticket size={16} aria-hidden="true" /> <span>My booking</span>
            </button>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="no-print border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © {BRAND_NAME}. Pay the operator at boarding or by arrangement — no online payment is taken.
          </p>
          <p>
            Demo app · data stored in this browser ·{' '}
            <Link href="/admin" className="font-medium text-slate-700 underline-offset-2 hover:underline">
              Operator admin
            </Link>
          </p>
        </div>
      </footer>
      <FindBooking open={finding} onClose={() => setFinding(false)} />
    </div>
  );
}
