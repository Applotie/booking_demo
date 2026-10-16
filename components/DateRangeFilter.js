'use client';

import { RANGE_PRESETS, presetRange, normalizeRange, monthRange, monthKey } from '@/lib/dates';
import { formatDate } from '@/lib/formatters';
import { inputClasses } from './ui/Field';

export const DEFAULT_RANGE = { preset: 'month', from: '', to: '', month: '' };

export const MONTH_PICK = { value: 'pickMonth', label: 'Pick month' };

// Converts filter state into the { from, to } range used by services.
export function resolveRange(value) {
  if (!value || value.preset === 'all') return null;
  if (value.preset === 'custom') return normalizeRange({ from: value.from, to: value.to });
  if (value.preset === 'pickMonth') return monthRange(value.month || monthKey());
  return presetRange(value.preset);
}

export function describeRange(value) {
  const r = resolveRange(value);
  if (!r) return 'All time';
  if (r.from && r.to) return r.from === r.to ? formatDate(r.from) : `${formatDate(r.from)} – ${formatDate(r.to)}`;
  if (r.from) return `From ${formatDate(r.from)}`;
  return `Until ${formatDate(r.to)}`;
}

export default function DateRangeFilter({ value, onChange, presets = RANGE_PRESETS, allowMonth = false, className = '' }) {
  const list = allowMonth ? [...presets.slice(0, -1), MONTH_PICK, presets[presets.length - 1]] : presets;
  const v = value || DEFAULT_RANGE;
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <div className="flex flex-wrap rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm" role="group" aria-label="Date range">
        {list.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => onChange({ ...v, preset: p.value })}
            aria-pressed={v.preset === p.value}
            className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${v.preset === p.value ? 'bg-ink text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {v.preset === 'pickMonth' ? (
        <input type="month" aria-label="Month" value={v.month || monthKey()} onChange={(e) => onChange({ ...v, month: e.target.value })} className={inputClasses(false, 'h-9 w-auto')} />
      ) : null}
      {v.preset === 'custom' ? (
        <div className="flex items-center gap-1.5">
          <input type="date" aria-label="From date" value={v.from} onChange={(e) => onChange({ ...v, from: e.target.value })} className={inputClasses(false, 'h-9 w-auto')} />
          <span className="text-xs text-slate-500">to</span>
          <input type="date" aria-label="To date" value={v.to} onChange={(e) => onChange({ ...v, to: e.target.value })} className={inputClasses(false, 'h-9 w-auto')} />
        </div>
      ) : null}
    </div>
  );
}
