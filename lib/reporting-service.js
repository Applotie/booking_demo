// Every financial and operational figure shown in the app is computed here,
// so the dashboard, bus profiles and reports always agree.
//
// Date rules (applied everywhere):
//   • Trips and bookings are attributed to the trip's travel (departure) date.
//   • Expenses are attributed to their expense date.
//   • Ranges are inclusive local calendar dates; `null` means all time.

import { inRange, dateKeyOf, parseLocalDateTime, monthKey, monthRange, shiftMonth } from './dates.js';
import { categoryMeta, EXPENSE_GROUPS } from './constants.js';
import { sellableSeatCount } from './seat-service.js';
import { getReminders } from './maintenance-service.js';

const round2 = (n) => Math.round(n * 100) / 100;

export function safeDivide(numerator, denominator) {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
  return n / d;
}

function sum(list, pick) {
  return round2(list.reduce((s, x) => s + (Number(pick(x)) || 0), 0));
}

export const isActiveBooking = (b) => b.bookingStatus === 'Confirmed';

export function summarizeBookings(bookings) {
  const active = bookings.filter(isActiveBooking);
  const cancelled = bookings.filter((b) => b.bookingStatus === 'Cancelled');
  const paid = active.filter((b) => b.paymentStatus === 'Paid');
  const unpaid = active.filter((b) => b.paymentStatus !== 'Paid');
  return {
    confirmedCount: active.length,
    cancelledCount: cancelled.length,
    seatsBooked: active.reduce((s, b) => s + (b.seatIds?.length || 0), 0),
    passengers: active.reduce((s, b) => s + (b.passengers?.length || 0), 0),
    bookingValue: sum(active, (b) => b.totalFare),
    paidAmount: sum(paid, (b) => b.totalFare),
    unpaidAmount: sum(unpaid, (b) => b.totalFare),
    cancelledValue: sum(cancelled, (b) => b.totalFare),
    cancelledPaidAmount: sum(cancelled.filter((b) => b.paymentStatus === 'Paid'), (b) => b.totalFare),
  };
}

export function summarizeExpenses(expenses) {
  const byCategory = {};
  const byGroup = Object.fromEntries(Object.keys(EXPENSE_GROUPS).map((g) => [g, 0]));
  for (const e of expenses) {
    const amount = Number(e.amount) || 0;
    byCategory[e.category] = round2((byCategory[e.category] || 0) + amount);
    const group = categoryMeta(e.category)?.group || 'other';
    byGroup[group] = round2(byGroup[group] + amount);
  }
  return {
    count: expenses.length,
    total: sum(expenses, (e) => e.amount),
    paid: sum(expenses.filter((e) => e.paymentStatus === 'Paid'), (e) => e.amount),
    pending: sum(expenses.filter((e) => e.paymentStatus !== 'Paid'), (e) => e.amount),
    byCategory,
    byGroup,
  };
}

export function tripStats(trip, bookings) {
  const forTrip = bookings.filter((b) => b.tripId === trip.id);
  const s = summarizeBookings(forTrip);
  const sellable = sellableSeatCount(trip.seatLayoutSnapshot);
  return {
    ...s,
    sellable,
    totalSeats: trip.seatLayoutSnapshot?.capacity || 0,
    blocked: trip.seatLayoutSnapshot?.blockedSeatIds?.length || 0,
    available: Math.max(0, sellable - s.seatsBooked),
    occupancy: safeDivide(s.seatsBooked, sellable),
    bookings: forTrip,
  };
}

// Applies bus/route/date filters consistently to trips, bookings and expenses.
export function scopeData(data, { busId = null, routeId = null, range = null, bookingStatus = null } = {}) {
  const trips = data.trips.filter(
    (t) => (!busId || t.busId === busId) && (!routeId || t.routeId === routeId) && inRange(dateKeyOf(t.departureAt), range)
  );
  const bookings = data.bookings.filter(
    (b) =>
      (!busId || b.busId === busId) &&
      (!routeId || b.routeId === routeId) &&
      (!bookingStatus || b.bookingStatus === bookingStatus) &&
      inRange(b.travelDate, range)
  );
  // Expenses belong to a bus, not a route, so the route filter does not apply.
  const expenses = data.expenses.filter((e) => (!busId || e.busId === busId) && inRange(e.expenseDate, range));
  return { trips, bookings, expenses };
}

/**
 * Core financial computation.
 * basis 'confirmed': revenue = confirmed bookings on non-cancelled trips.
 * basis 'completed': revenue = confirmed bookings on trips marked Completed.
 */
export function computeFinancials(data, { busId = null, routeId = null, range = null, basis = 'confirmed', now = Date.now() } = {}) {
  const scope = scopeData(data, { busId, routeId, range });
  const t = now instanceof Date ? now.getTime() : now;

  const scheduled = scope.trips.filter((x) => x.status === 'Scheduled');
  const completed = scope.trips.filter((x) => x.status === 'Completed');
  const cancelled = scope.trips.filter((x) => x.status === 'Cancelled');
  const upcoming = scheduled.filter((x) => (parseLocalDateTime(x.departureAt)?.getTime() || 0) > t);

  const bookingSummary = summarizeBookings(scope.bookings);

  const eligibleTrips = basis === 'completed' ? completed : scope.trips.filter((x) => x.status !== 'Cancelled');
  const eligibleIds = new Set(eligibleTrips.map((x) => x.id));
  const eligibleBookings = scope.bookings.filter((b) => isActiveBooking(b) && eligibleIds.has(b.tripId));
  const revenue = sum(eligibleBookings, (b) => b.totalFare);

  const sellableSeats = eligibleTrips.reduce((s, x) => s + sellableSeatCount(x.seatLayoutSnapshot), 0);
  const bookedSeats = eligibleBookings.reduce((s, b) => s + b.seatIds.length, 0);

  const expenses = summarizeExpenses(scope.expenses);
  const hasRevenueData = eligibleBookings.length > 0;
  const hasExpenseData = scope.expenses.length > 0;

  return {
    basis,
    trips: {
      total: scope.trips.length,
      scheduled: scheduled.length,
      completed: completed.length,
      cancelled: cancelled.length,
      upcoming: upcoming.length,
      eligible: eligibleTrips.length,
    },
    bookings: bookingSummary,
    revenue: {
      amount: revenue,
      bookingCount: eligibleBookings.length,
      paid: sum(eligibleBookings.filter((b) => b.paymentStatus === 'Paid'), (b) => b.totalFare),
      unpaid: sum(eligibleBookings.filter((b) => b.paymentStatus !== 'Paid'), (b) => b.totalFare),
    },
    occupancy: { sellableSeats, bookedSeats, rate: safeDivide(bookedSeats, sellableSeats) },
    expenses,
    result: {
      operatingResult: round2(revenue - expenses.total),
      hasData: hasRevenueData || hasExpenseData,
      revenuePerCompletedTrip: safeDivide(revenue, completed.length),
      expensePerCompletedTrip: safeDivide(expenses.total, completed.length),
      averageBookingValuePerTrip: safeDivide(revenue, eligibleTrips.length),
    },
    cash: {
      collected: bookingSummary.paidAmount,
      paidExpenses: expenses.paid,
      net: round2(bookingSummary.paidAmount - expenses.paid),
    },
    scope,
  };
}

export function compareBuses(data, { range = null, basis = 'confirmed', includeInactive = true } = {}) {
  return data.buses
    .filter((b) => includeInactive || b.operationalStatus !== 'Inactive')
    .map((bus) => ({ bus, ...computeFinancials(data, { busId: bus.id, range, basis }) }));
}

// Month-by-month series ending at `endMonth` (inclusive).
export function monthlySeries(data, { busId = null, months = 6, endMonth = monthKey(), basis = 'confirmed' } = {}) {
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = shiftMonth(endMonth, -i);
    const f = computeFinancials(data, { busId, range: monthRange(m), basis });
    out.push({
      month: m,
      revenue: f.revenue.amount,
      expenses: f.expenses.total,
      result: f.result.operatingResult,
      occupancy: f.occupancy.rate,
      trips: f.trips.total,
      hasData: f.result.hasData,
    });
  }
  return out;
}

export function compareRanges(data, { busId = null, ranges, basis = 'confirmed' }) {
  return ranges.map(({ label, range }) => ({ label, range, ...computeFinancials(data, { busId, range, basis }) }));
}

export function computeDashboard(data, { range = null, basis = 'confirmed', now = Date.now() } = {}) {
  const financials = computeFinancials(data, { range, basis, now });
  const t = now instanceof Date ? now.getTime() : now;
  const upcomingTrips = data.trips
    .filter((x) => x.status === 'Scheduled' && (parseLocalDateTime(x.departureAt)?.getTime() || 0) > t)
    .sort((a, b) => a.departureAt.localeCompare(b.departureAt));
  return {
    fleet: {
      total: data.buses.length,
      active: data.buses.filter((b) => b.operationalStatus === 'Active').length,
      maintenance: data.buses.filter((b) => b.operationalStatus === 'Under Maintenance').length,
      inactive: data.buses.filter((b) => b.operationalStatus === 'Inactive').length,
    },
    routes: { total: data.routes.length, active: data.routes.filter((r) => r.isActive).length },
    upcomingTrips,
    reminders: getReminders(data),
    financials,
  };
}

// Sorted category rows for tables/charts.
export function categoryRows(byCategory) {
  return Object.entries(byCategory)
    .map(([category, amount]) => ({ category, amount, label: categoryMeta(category)?.label || category }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}
