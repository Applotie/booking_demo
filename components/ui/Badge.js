const TONES = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  dark: 'bg-ink text-white ring-ink',
};

export default function Badge({ tone = 'neutral', children, className = '', icon: Icon }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone] || TONES.neutral} ${className}`}>
      {Icon ? <Icon size={12} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

const STATUS_TONES = {
  Active: 'success',
  'Under Maintenance': 'warning',
  Inactive: 'neutral',
  Scheduled: 'info',
  Completed: 'success',
  Cancelled: 'danger',
  Confirmed: 'success',
  Paid: 'success',
  Unpaid: 'warning',
  Pending: 'warning',
};

export function StatusBadge({ status, className }) {
  return (
    <Badge tone={STATUS_TONES[status] || 'neutral'} className={className}>
      {status}
    </Badge>
  );
}
