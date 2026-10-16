'use client';

import { useMemo } from 'react';
import { RotateCcw } from 'lucide-react';
import SeatMap, { SeatLegend } from './SeatMap';
import { Input, Select } from './ui/Field';
import Button from './ui/Button';
import { LAYOUT_PRESETS, MAX_CAPACITY } from '@/lib/constants';
import { generateSeatLayout, validateLayoutInput, sortSeatIds } from '@/lib/seat-service';

/**
 * Controlled editor. `value` = { capacity, leftSeats, rightSeats, blockedSeatIds }.
 * The preview is generated with the same function that saves the layout, so
 * what the admin sees is exactly what is stored.
 */
export default function SeatLayoutEditor({ value, onChange, errors = {}, lockedSeatIds = [] }) {
  const v = value;
  const inputErrors = useMemo(() => validateLayoutInput(v), [v]);
  const preview = useMemo(() => {
    if (Object.keys(inputErrors).length) return null;
    try {
      return generateSeatLayout(v);
    } catch {
      return null;
    }
  }, [v, inputErrors]);

  const setField = (field, val) => onChange({ ...v, [field]: val });
  const activePreset = LAYOUT_PRESETS.find((p) => p.left === Number(v.leftSeats) && p.right === Number(v.rightSeats))?.value;
  const blocked = preview ? preview.blockedSeatIds : [];
  const locked = new Set(lockedSeatIds);

  const toggleSeat = (seatId) => {
    const set = new Set(v.blockedSeatIds || []);
    if (set.has(seatId)) set.delete(seatId);
    else set.add(seatId);
    onChange({ ...v, blockedSeatIds: sortSeatIds([...set]) });
  };

  const perRow = Number(v.leftSeats) + Number(v.rightSeats);
  const lastRow = preview ? Number(v.capacity) % perRow : 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="space-y-4">
        <Input
          label="Total seating capacity"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_CAPACITY}
          required
          value={v.capacity}
          onChange={(e) => setField('capacity', e.target.value === '' ? '' : Number(e.target.value))}
          error={errors.capacity || inputErrors.capacity}
          hint={`Exactly this many seats will be generated (max ${MAX_CAPACITY}).`}
        />
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">Seat arrangement</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Seat arrangement presets">
            {LAYOUT_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => onChange({ ...v, leftSeats: p.left, rightSeats: p.right })}
                aria-pressed={activePreset === p.value}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                  activePreset === p.value ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                }`}
              >
                {p.value}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Seats left of aisle"
            value={v.leftSeats}
            onChange={(e) => setField('leftSeats', Number(e.target.value))}
            options={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))}
            error={errors.leftSeats || inputErrors.leftSeats}
          />
          <Select
            label="Seats right of aisle"
            value={v.rightSeats}
            onChange={(e) => setField('rightSeats', Number(e.target.value))}
            options={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))}
            error={errors.rightSeats || inputErrors.rightSeats}
          />
        </div>

        {preview ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-slate-500">Generated seats</dt>
                <dd className="font-semibold tabular">{preview.seats.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Rows</dt>
                <dd className="font-semibold tabular">{preview.rowCount}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Blocked</dt>
                <dd className="font-semibold tabular">{blocked.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Bookable</dt>
                <dd className="font-semibold tabular text-emerald-700">{preview.seats.length - blocked.length}</dd>
              </div>
            </dl>
            {lastRow ? (
              <p className="mt-2 text-xs text-slate-500">
                The last row ({preview.seats[preview.seats.length - 1].rowLabel}) is partially filled with {lastRow} seat{lastRow === 1 ? '' : 's'}, starting from the left.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-lg border border-slate-200 p-3 text-sm text-slate-600">
          <p>
            <strong className="text-ink">Block seats:</strong> click a seat in the preview to mark it as blocked (e.g. crew seat or broken seat). Blocked seats
            cannot be booked and are excluded from availability and occupancy.
          </p>
          {blocked.length ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">Blocked: {blocked.join(', ')}</span>
              <Button size="xs" variant="ghost" icon={RotateCcw} onClick={() => setField('blockedSeatIds', [])}>
                Unblock all
              </Button>
            </div>
          ) : null}
          {errors.blockedSeatIds || inputErrors.blockedSeatIds ? (
            <p className="mt-1 text-xs font-medium text-red-600">{errors.blockedSeatIds || inputErrors.blockedSeatIds}</p>
          ) : null}
          {locked.size ? <p className="mt-2 text-xs text-amber-700">Seats {[...locked].join(', ')} are booked on existing trips; those trips keep their saved layout.</p> : null}
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-2 text-sm font-medium text-slate-700">Layout preview</div>
        {preview ? (
          <>
            <SeatMap layout={preview} mode="edit" onSeatClick={toggleSeat} />
            <SeatLegend items={['blocked']} className="mt-3 justify-center" />
          </>
        ) : (
          <div className="flex h-48 w-64 items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 px-4 text-center text-sm text-slate-500">
            Enter a valid capacity and arrangement to preview the layout.
          </div>
        )}
      </div>
    </div>
  );
}
