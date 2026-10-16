'use client';

import { X, Clock, User } from 'lucide-react';
import { getLayoutRows } from '@/lib/seat-service';

const STATE_STYLES = {
  available: 'bg-white border-emerald-500 text-emerald-800 hover:bg-emerald-50',
  selected: 'bg-brand-600 border-brand-600 text-white shadow-md',
  held: 'bg-sky-100 border-sky-400 text-sky-800',
  booked: 'bg-slate-300 border-slate-300 text-slate-500',
  blocked: 'seat-blocked border-dashed border-slate-300 text-slate-400',
  plain: 'bg-white border-slate-300 text-slate-700 hover:border-slate-500',
};

const STATE_LABELS = {
  available: 'Available',
  selected: 'Selected',
  held: 'Held by another passenger',
  booked: 'Booked',
  blocked: 'Blocked / not for sale',
};

function SteeringWheel({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M12 14.2V21M9.9 11.3 3.6 9.6M14.1 11.3l6.3-1.7" />
    </svg>
  );
}

function Seat({ seat, state, onClick, interactive, editable, label }) {
  const style = STATE_STYLES[state] || STATE_STYLES.plain;
  const Icon = state === 'blocked' ? X : state === 'held' ? Clock : state === 'booked' ? User : null;
  const common = `relative flex h-10 w-10 flex-col items-center justify-center rounded-md rounded-t-lg border-2 text-[11px] font-semibold leading-none transition-colors sm:h-11 sm:w-11 ${style}`;
  const content = (
    <>
      {Icon ? <Icon size={12} aria-hidden="true" className="mb-0.5" /> : null}
      <span>{seat.id}</span>
      <span className="absolute inset-x-1.5 bottom-0.5 h-0.5 rounded-full bg-current opacity-25" aria-hidden="true" />
    </>
  );
  // In edit mode blocked seats stay clickable so they can be unblocked.
  const unavailable = state === 'booked' || state === 'held' || (state === 'blocked' && !editable);
  if (!interactive) {
    return (
      <div className={`${common} cursor-default`} title={label} aria-label={label} role="img">
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onClick(seat.id, state)}
      className={`${common} ${unavailable ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      aria-label={label}
      aria-pressed={state === 'selected'}
      title={label}
      disabled={unavailable}
    >
      {content}
    </button>
  );
}

/**
 * Renders a seat layout as a bus floor plan: driver at the front right, door
 * at the front left, rows with a real aisle between the left and right blocks.
 *
 * mode: 'book' – available seats toggle selection
 *       'edit' – every seat toggles blocked/unblocked
 *       'view' – read only
 */
export default function SeatMap({ layout, states = {}, selected = [], onSeatClick, mode = 'view', seatTitles = {} }) {
  if (!layout || !Array.isArray(layout.seats)) return <p className="text-sm text-slate-500">No seat layout.</p>;
  const rows = getLayoutRows(layout);
  const selectedSet = new Set(selected);
  const blocked = new Set(layout.blockedSeatIds || []);
  const seatPx = 'var(--seat)';
  const gridTemplateColumns = `repeat(${layout.leftSeats}, ${seatPx}) var(--aisle) repeat(${layout.rightSeats}, ${seatPx})`;

  const stateOf = (seat) => {
    if (mode === 'edit') return blocked.has(seat.id) ? 'blocked' : 'plain';
    if (selectedSet.has(seat.id)) return 'selected';
    return states[seat.id] || (blocked.has(seat.id) ? 'blocked' : 'available');
  };

  return (
    <div className="flex justify-center overflow-x-auto">
      <div
        className="inline-block rounded-[2rem] border-2 border-slate-300 bg-slate-50 px-3 pb-4 pt-3 shadow-inner sm:px-4 [--aisle:1.75rem] [--seat:2.5rem] sm:[--aisle:2.25rem] sm:[--seat:2.75rem]"
        aria-label={`Seat map, ${layout.arrangement} layout, ${layout.capacity} seats`}
      >
        <div className="mb-3 flex items-center justify-between border-b-2 border-dashed border-slate-300 pb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          <span className="flex items-center gap-1 rounded border border-slate-300 bg-white px-1.5 py-1">Door</span>
          <span className="hidden text-slate-400 sm:inline">Front</span>
          <span className="flex items-center gap-1">
            Driver
            <SteeringWheel className="h-7 w-7 text-slate-600" />
          </span>
        </div>
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.label} className="grid items-center gap-1.5" style={{ gridTemplateColumns }}>
              {row.left.map((seat, i) =>
                seat ? (
                  <Seat
                    key={seat.id}
                    seat={seat}
                    state={stateOf(seat)}
                    interactive={mode !== 'view'}
                    editable={mode === 'edit'}
                    onClick={onSeatClick}
                    label={`Seat ${seat.id}${seatTitles[seat.id] ? ` – ${seatTitles[seat.id]}` : ''}, ${STATE_LABELS[stateOf(seat)] || (mode === 'edit' ? 'click to block' : '')}`}
                  />
                ) : (
                  <span key={`l${i}`} aria-hidden="true" />
                )
              )}
              <span className="text-center text-[10px] font-medium text-slate-400" aria-hidden="true">
                {row.label}
              </span>
              {row.right.map((seat, i) =>
                seat ? (
                  <Seat
                    key={seat.id}
                    seat={seat}
                    state={stateOf(seat)}
                    interactive={mode !== 'view'}
                    editable={mode === 'edit'}
                    onClick={onSeatClick}
                    label={`Seat ${seat.id}${seatTitles[seat.id] ? ` – ${seatTitles[seat.id]}` : ''}, ${STATE_LABELS[stateOf(seat)] || (mode === 'edit' ? 'click to block' : '')}`}
                  />
                ) : (
                  <span key={`r${i}`} aria-hidden="true" />
                )
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 border-t-2 border-dashed border-slate-300 pt-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">Rear</div>
      </div>
    </div>
  );
}

export function SeatLegend({ items = ['available', 'selected', 'held', 'booked', 'blocked'], className = '' }) {
  return (
    <ul className={`flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600 ${className}`}>
      {items.map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <span className={`inline-block h-4 w-4 rounded border-2 ${STATE_STYLES[s]}`} aria-hidden="true" />
          {STATE_LABELS[s]}
        </li>
      ))}
    </ul>
  );
}
