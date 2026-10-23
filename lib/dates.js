// Date helpers. The app stores calendar dates as local "YYYY-MM-DD" strings
// and departure/arrival as local "YYYY-MM-DDTHH:mm" strings so that date
// filters never shift because of time-zone conversion.

const pad = (n) => String(n).padStart(2, '0');

export function toDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toLocalDateTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${toDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function todayKey(now = new Date()) {
  return toDateKey(now);
}

export function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = parseDateKey(value);
  return d !== null && toDateKey(d) === value;
}

export function isLocalDateTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const d = parseLocalDateTime(value);
  return d !== null && toLocalDateTime(d) === value;
}

// "YYYY-MM-DD" → Date at local midnight (new Date('YYYY-MM-DD') would be UTC).
export function parseDateKey(value) {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

// "YYYY-MM-DDTHH:mm" → local Date.
export function parseLocalDateTime(value) {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function dateKeyOf(localDateTime) {
  return typeof localDateTime === 'string' ? localDateTime.slice(0, 10) : '';
}

export function timeOf(localDateTime) {
  return typeof localDateTime === 'string' ? localDateTime.slice(11, 16) : '';
}

// "HH:mm" times of day, used by daily trips.
export function isTimeOfDay(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function minutesOfDay(time) {
  return isTimeOfDay(time) ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) : null;
}

// Minutes after midnight (wrapping past 24h) → "HH:mm".
export function timeFromMinutes(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addDaysToKey(key, days) {
  const d = parseDateKey(key);
  return d ? toDateKey(addDays(d, days)) : '';
}

// Whole days from `fromKey` to `toKey` (negative if toKey is earlier).
export function daysBetween(fromKey, toKey) {
  const a = parseDateKey(fromKey);
  const b = parseDateKey(toKey);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function monthKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function isMonthKey(value) {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function monthRange(key) {
  if (!isMonthKey(key)) return null;
  const [y, m] = key.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${key}-01`, to: `${key}-${pad(last)}` };
}

export function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

export const RANGE_PRESETS = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'custom', label: 'Custom' },
];

// Returns { from, to } (inclusive "YYYY-MM-DD") or null for all time.
export function presetRange(preset, now = new Date()) {
  const today = toDateKey(now);
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'week': {
      const dow = (now.getDay() + 6) % 7; // Monday = 0
      const start = addDays(now, -dow);
      return { from: toDateKey(start), to: toDateKey(addDays(start, 6)) };
    }
    case 'month':
      return monthRange(monthKey(now));
    case 'lastMonth':
      return monthRange(shiftMonth(monthKey(now), -1));
    default:
      return null;
  }
}

export function normalizeRange(range) {
  if (!range) return null;
  const from = isDateKey(range.from) ? range.from : '';
  const to = isDateKey(range.to) ? range.to : '';
  if (!from && !to) return null;
  if (from && to && from > to) return { from: to, to: from };
  return { from, to };
}

export function inRange(dateKey, range) {
  const r = normalizeRange(range);
  if (!r) return true;
  if (!dateKey) return false;
  if (r.from && dateKey < r.from) return false;
  if (r.to && dateKey > r.to) return false;
  return true;
}

export function minutesBetween(a, b) {
  const da = parseLocalDateTime(a);
  const db = parseLocalDateTime(b);
  if (!da || !db) return null;
  return Math.round((db.getTime() - da.getTime()) / 60000);
}
