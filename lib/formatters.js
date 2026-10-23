import { parseDateKey, parseLocalDateTime } from './dates.js';

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('en-IN');

export function formatINR(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return inrFormatter.format(n);
}

// Plain "₹1,250" style used inside WhatsApp text where the currency symbol
// must render reliably.
export function formatRupeesPlain(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '₹0';
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)}`;
}

export function formatNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? numberFormatter.format(n) : '—';
}

export function formatPercent(ratio, digits = 1) {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '—';
  return `${(ratio * 100).toFixed(digits)}%`;
}

function toDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return parseDateKey(value);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return parseLocalDateTime(value);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value) {
  const d = value ? toDate(value) : null;
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateLong(value) {
  const d = value ? toDate(value) : null;
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatTime(value) {
  const d = value ? toDate(value) : null;
  if (!d) return '—';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// "HH:mm" (a daily trip's time) → "08:30 am".
export function formatTimeOfDay(time) {
  return /^\d{2}:\d{2}$/.test(time || '') ? formatTime(`2000-01-01T${time}`) : '—';
}

export function formatDateTime(value) {
  const d = value ? toDate(value) : null;
  if (!d) return '—';
  return `${formatDate(d)}, ${formatTime(d)}`;
}

export function formatMonth(monthKey) {
  if (!monthKey) return '—';
  const d = parseDateKey(`${monthKey}-01`);
  return d ? d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : monthKey;
}

export function formatDuration(minutes) {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0) return '—';
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (!h) return `${rest}m`;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatPhone(national) {
  if (!national || national.length !== 10) return national || '—';
  return `+91 ${national.slice(0, 5)} ${national.slice(5)}`;
}

export function formatKm(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${numberFormatter.format(n)} km` : '—';
}

export function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}
