'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Route,
  Bus,
  CalendarClock,
  Ticket,
  Receipt,
  Wrench,
  ChartColumn,
  Menu,
  X,
  ExternalLink,
  Database,
} from 'lucide-react';
import { BRAND_NAME } from '@/lib/constants';
import DataSettings from './DataSettings';

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/routes', label: 'Routes', icon: Route },
  { href: '/admin/buses', label: 'Buses', icon: Bus },
  { href: '/admin/trips', label: 'Trips', icon: CalendarClock },
  { href: '/admin/bookings', label: 'Bookings', icon: Ticket },
  { href: '/admin/expenses', label: 'Expenses', icon: Receipt },
  { href: '/admin/maintenance', label: 'Maintenance', icon: Wrench },
  { href: '/admin/reports', label: 'Reports', icon: ChartColumn },
];

function NavLinks({ onNavigate }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-0.5" aria-label="Admin">
      {NAV.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Icon size={18} aria-hidden="true" className={active ? 'text-brand-400' : ''} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/admin" className="flex items-center gap-2.5 text-white">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600">
        <Bus size={20} aria-hidden="true" />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-bold">{BRAND_NAME}</span>
        <span className="block text-[11px] font-medium uppercase tracking-wider text-slate-400">Operations</span>
      </span>
    </Link>
  );
}

export default function AdminShell({ children }) {
  const [open, setOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);

  const footer = (
    <div className="space-y-0.5 border-t border-white/10 pt-3">
      <Link href="/" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white">
        <ExternalLink size={16} aria-hidden="true" /> Public booking site
      </Link>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setDataOpen(true);
        }}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white"
      >
        <Database size={16} aria-hidden="true" /> Data & storage
      </button>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-60">
      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col gap-6 bg-ink px-3 py-5 lg:flex">
        <div className="px-2">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavLinks />
        </div>
        {footer}
      </aside>

      {/* Mobile top bar */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between bg-ink px-4 py-3 lg:hidden">
        <Brand />
        <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 text-white hover:bg-white/10" aria-label="Open menu">
          <Menu size={22} />
        </button>
      </header>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col gap-6 bg-ink px-3 py-5">
            <div className="flex items-center justify-between px-2">
              <Brand />
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-white hover:bg-white/10" aria-label="Close menu">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
            {footer}
          </div>
        </div>
      ) : null}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      <DataSettings open={dataOpen} onClose={() => setDataOpen(false)} />
    </div>
  );
}
