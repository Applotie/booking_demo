import Link from 'next/link';
import { TriangleAlert, Clock, FileText, Wrench } from 'lucide-react';
import { formatDate, formatKm } from '@/lib/formatters';

function when(r) {
  const parts = [];
  if (r.daysLeft != null) parts.push(r.daysLeft < 0 ? `${Math.abs(r.daysLeft)} day(s) ago` : r.daysLeft === 0 ? 'today' : `in ${r.daysLeft} day(s)`);
  if (r.kmLeft != null) parts.push(r.kmLeft <= 0 ? `${formatKm(Math.abs(r.kmLeft))} past due` : `${formatKm(r.kmLeft)} to go`);
  return parts.join(' · ');
}

export default function ReminderList({ reminders, limit, emptyMessage = 'No upcoming expiries or services in the next 30 days.' }) {
  const list = limit ? reminders.slice(0, limit) : reminders;
  if (!list.length) return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {list.map((r) => {
        const overdue = r.severity === 'overdue';
        const Icon = r.kind === 'service' ? Wrench : FileText;
        return (
          <li key={r.id} className="flex items-start gap-3 py-2.5">
            <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${overdue ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
              <Icon size={14} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex flex-wrap items-center gap-x-2">
                <span className="font-medium">{r.title}</span>
                <span className={`inline-flex items-center gap-1 text-xs font-medium ${overdue ? 'text-red-700' : 'text-amber-700'}`}>
                  {overdue ? <TriangleAlert size={12} aria-hidden="true" /> : <Clock size={12} aria-hidden="true" />}
                  {overdue ? 'Overdue' : 'Due soon'}
                </span>
              </div>
              <div className="text-xs text-slate-500">
                <Link href={`/admin/buses/${r.busId}`} className="font-medium text-slate-700 hover:text-brand-700">
                  {r.busName}
                </Link>
                {r.date ? ` · ${formatDate(r.date)}` : ''} {when(r) ? `· ${when(r)}` : ''}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
