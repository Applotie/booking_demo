// Seat layout generation and seat-level helpers.
//
// A layout is a plain object that can be stored and snapshotted onto trips:
// {
//   version, capacity, leftSeats, rightSeats, arrangement: '2+1', rowCount,
//   seats: [{ id: 'A1', row: 0, rowLabel: 'A', side: 'left'|'right', column }],
//   blockedSeatIds: ['A1'],
// }
// Seat IDs are row letter + position across the row (left window → right
// window), so the same capacity and arrangement always produce the same IDs.

import { MAX_CAPACITY } from './constants.js';

export const LAYOUT_VERSION = 1;

export function rowLabel(index) {
  let n = index;
  let label = '';
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

export function validateLayoutInput({ capacity, leftSeats, rightSeats, blockedSeatIds = [] }) {
  const errors = {};
  const cap = Number(capacity);
  const left = Number(leftSeats);
  const right = Number(rightSeats);
  if (!Number.isInteger(cap) || cap < 1) errors.capacity = 'Capacity must be a whole number of at least 1.';
  else if (cap > MAX_CAPACITY) errors.capacity = `Capacity cannot exceed ${MAX_CAPACITY} seats.`;
  if (!Number.isInteger(left) || left < 1 || left > 3) errors.leftSeats = 'Left side must have 1–3 seats per row.';
  if (!Number.isInteger(right) || right < 1 || right > 3) errors.rightSeats = 'Right side must have 1–3 seats per row.';
  if (!errors.capacity && Array.isArray(blockedSeatIds) && blockedSeatIds.length >= cap) {
    errors.blockedSeatIds = 'At least one seat must remain available for booking.';
  }
  return errors;
}

export function generateSeatLayout({ capacity, leftSeats, rightSeats, blockedSeatIds = [] }) {
  const errors = validateLayoutInput({ capacity, leftSeats, rightSeats, blockedSeatIds });
  if (Object.keys(errors).length) {
    const err = new Error(Object.values(errors)[0]);
    err.errors = errors;
    throw err;
  }
  const cap = Number(capacity);
  const left = Number(leftSeats);
  const right = Number(rightSeats);
  const perRow = left + right;
  const rowCount = Math.ceil(cap / perRow);
  const seats = [];
  let remaining = cap;
  for (let row = 0; row < rowCount; row++) {
    const label = rowLabel(row);
    // A partially filled final row fills the left block first, then right.
    const inRow = Math.min(perRow, remaining);
    for (let i = 0; i < inRow; i++) {
      const side = i < left ? 'left' : 'right';
      seats.push({ id: `${label}${i + 1}`, row, rowLabel: label, side, column: i });
    }
    remaining -= inRow;
  }
  const ids = new Set(seats.map((s) => s.id));
  const blocked = [...new Set((blockedSeatIds || []).filter((id) => ids.has(id)))];
  return {
    version: LAYOUT_VERSION,
    capacity: cap,
    leftSeats: left,
    rightSeats: right,
    arrangement: `${left}+${right}`,
    rowCount,
    seats,
    blockedSeatIds: blocked,
  };
}

export function isValidLayout(layout) {
  if (!layout || typeof layout !== 'object' || !Array.isArray(layout.seats)) return false;
  if (layout.seats.length !== layout.capacity) return false;
  const ids = new Set(layout.seats.map((s) => s.id));
  return ids.size === layout.seats.length;
}

// Rows in render order with fixed-width left/right blocks so the aisle always
// lines up. Empty positions in a partial last row are null.
export function getLayoutRows(layout) {
  if (!layout || !Array.isArray(layout.seats)) return [];
  const rows = [];
  for (let r = 0; r < layout.rowCount; r++) {
    rows.push({ row: r, label: rowLabel(r), left: Array(layout.leftSeats).fill(null), right: Array(layout.rightSeats).fill(null) });
  }
  for (const seat of layout.seats) {
    const row = rows[seat.row];
    if (!row) continue;
    if (seat.side === 'left') row.left[seat.column] = seat;
    else row.right[seat.column - layout.leftSeats] = seat;
  }
  return rows;
}

export function seatIdSet(layout) {
  return new Set((layout?.seats || []).map((s) => s.id));
}

export function blockedSet(layout) {
  return new Set(layout?.blockedSeatIds || []);
}

export function sellableSeatIds(layout) {
  const blocked = blockedSet(layout);
  return (layout?.seats || []).map((s) => s.id).filter((id) => !blocked.has(id));
}

export function sellableSeatCount(layout) {
  return sellableSeatIds(layout).length;
}

// Can `nextLayout` replace `currentLayout` without moving or removing any of
// the given booked seats? Same arrangement is required because seat IDs are
// positional; a different arrangement would silently move passengers.
export function checkLayoutCompatibility(currentLayout, nextLayout, bookedSeatIds) {
  const booked = [...new Set(bookedSeatIds || [])];
  if (!booked.length) return { ok: true, missing: [], blocked: [] };
  if (currentLayout.leftSeats !== nextLayout.leftSeats || currentLayout.rightSeats !== nextLayout.rightSeats) {
    return {
      ok: false,
      missing: [],
      blocked: [],
      reason: `The seat arrangement changed from ${currentLayout.arrangement} to ${nextLayout.arrangement}, which would renumber booked seats.`,
    };
  }
  const ids = seatIdSet(nextLayout);
  const blocked = blockedSet(nextLayout);
  const missing = booked.filter((id) => !ids.has(id));
  const nowBlocked = booked.filter((id) => ids.has(id) && blocked.has(id));
  if (missing.length || nowBlocked.length) {
    const parts = [];
    if (missing.length) parts.push(`seats ${missing.join(', ')} would be removed`);
    if (nowBlocked.length) parts.push(`seats ${nowBlocked.join(', ')} would be blocked`);
    return { ok: false, missing, blocked: nowBlocked, reason: `Booked ${parts.join(' and ')}.` };
  }
  return { ok: true, missing: [], blocked: [] };
}

export function sortSeatIds(ids) {
  const parse = (id) => {
    const m = /^([A-Z]+)(\d+)$/.exec(id);
    if (!m) return [Infinity, 0, id];
    const letters = m[1];
    let rowNum = 0;
    for (const ch of letters) rowNum = rowNum * 26 + (ch.charCodeAt(0) - 64);
    return [rowNum, Number(m[2]), id];
  };
  return [...ids].sort((a, b) => {
    const pa = parse(a);
    const pb = parse(b);
    return pa[0] - pb[0] || pa[1] - pb[1] || String(pa[2]).localeCompare(String(pb[2]));
  });
}

export function cloneLayout(layout) {
  return JSON.parse(JSON.stringify(layout));
}
