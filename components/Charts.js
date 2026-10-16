'use client';

import { useState } from 'react';
import { formatINR } from '@/lib/formatters';

// Validated categorical slots 1 and 2 of the reference palette.
export const SERIES_COLORS = ['#2a78d6', '#eb6834'];

/**
 * Horizontal bars for one measure across categories (e.g. expense by
 * category). Single series → one hue; labels and values in text ink.
 */
export function HorizontalBars({ rows, valueFormat = formatINR, emptyMessage = 'No data for this selection.' }) {
  const [hover, setHover] = useState(null);
  if (!rows.length) return <p className="py-6 text-center text-sm text-slate-500">{emptyMessage}</p>;
  const max = Math.max(...rows.map((r) => r.value), 0);
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const pct = max > 0 ? (r.value / max) * 100 : 0;
        const share = total > 0 ? (r.value / total) * 100 : 0;
        return (
          <li key={r.key} className="relative" onMouseEnter={() => setHover(r.key)} onMouseLeave={() => setHover(null)}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-slate-700">{r.label}</span>
              <span className="shrink-0 font-medium tabular text-ink">{valueFormat(r.value)}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full" style={{ width: `${Math.max(pct, 1)}%`, background: SERIES_COLORS[0] }} />
            </div>
            {hover === r.key ? (
              <div className="pointer-events-none absolute right-0 top-full z-10 mt-1 rounded-md bg-ink px-2 py-1 text-xs text-white shadow">
                {share.toFixed(1)}% of total
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Grouped vertical bars over periods for up to two series sharing one axis
 * (e.g. revenue vs expenses per month). Hover shows exact values.
 */
export function GroupedBars({ data, series, height = 180, valueFormat = formatINR }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(0, ...data.flatMap((d) => series.map((s) => d[s.key] || 0)));
  if (max <= 0) return <p className="py-10 text-center text-sm text-slate-500">No revenue or expenses recorded in these months.</p>;
  const ticks = [0, 0.5, 1].map((f) => max * f);
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-4 text-xs text-slate-600" aria-label="Legend">
        {series.map((s, i) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES_COLORS[i] }} aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between pb-6 text-right text-[10px] tabular text-slate-400" style={{ height }} aria-hidden="true">
          {[...ticks].reverse().map((t, i) => (
            <span key={i}>{valueFormat(Math.round(t))}</span>
          ))}
        </div>
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col justify-between" style={{ height: height - 24 }} aria-hidden="true">
            {ticks.map((_, i) => (
              <div key={i} className="border-t border-slate-100" />
            ))}
          </div>
          <div className="relative flex items-end gap-1" style={{ height }}>
            {data.map((d) => (
              <div
                key={d.key}
                className="relative flex h-full flex-1 flex-col justify-end"
                onMouseEnter={() => setHover(d.key)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(d.key)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                aria-label={`${d.label}: ${series.map((s) => `${s.label} ${valueFormat(d[s.key] || 0)}`).join(', ')}`}
              >
                <div className={`flex items-end justify-center gap-0.5 rounded-t ${hover === d.key ? 'bg-slate-50' : ''}`} style={{ height: height - 24 }}>
                  {series.map((s, i) => {
                    const v = d[s.key] || 0;
                    return (
                      <div
                        key={s.key}
                        className="w-full max-w-5 rounded-t"
                        style={{ height: `${max > 0 ? (v / max) * 100 : 0}%`, minHeight: v > 0 ? 2 : 0, background: SERIES_COLORS[i] }}
                      />
                    );
                  })}
                </div>
                <div className="h-6 truncate pt-1 text-center text-[10px] text-slate-500">{d.label}</div>
                {hover === d.key ? (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2.5 py-1.5 text-xs text-white shadow-lg">
                    <div className="font-semibold">{d.label}</div>
                    {series.map((s, i) => (
                      <div key={s.key} className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-sm" style={{ background: SERIES_COLORS[i] }} />
                        {s.label}: {valueFormat(d[s.key] || 0)}
                      </div>
                    ))}
                    {d.extra ? <div className="text-slate-300">{d.extra}</div> : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
