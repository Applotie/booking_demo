'use client';

// Browser-side calls to the server API. Every change to data goes through
// these functions; the server runs the business rules against MongoDB and
// returns the same `{ ok, … }` results the services always returned.

import { CHANGE_EVENT } from './storage-keys.js';

const NETWORK_ERROR = { ok: false, errors: {}, message: 'Could not reach the server. Check your connection and try again.', code: 'NETWORK' };

export function notifyDataChanged() {
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    /* no window (should not happen in client components) */
  }
}

// The admin session expired (or was signed out in another tab): go to the
// sign-in page and come back to this page afterwards.
export function redirectToAdminLogin() {
  const here = window.location.pathname + window.location.search;
  window.location.replace(`/admin/login?reason=expired&next=${encodeURIComponent(here)}`);
}

async function post(url, body) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch {
    return NETWORK_ERROR;
  }
  let result;
  try {
    result = await res.json();
  } catch {
    return { ...NETWORK_ERROR, message: 'The server sent an unexpected response. Please try again.' };
  }
  if (res.status === 401 && result?.code === 'UNAUTHENTICATED') redirectToAdminLogin();
  if (!result || typeof result !== 'object') return NETWORK_ERROR;
  return { errors: {}, ...result };
}

async function call(scope, action, args) {
  const result = await post(`/api/${scope}/actions`, { action, args });
  // Even a refused change can update data (e.g. expired seat holds are tidied),
  // so pages reload after every call that reached the server. The reload is
  // deferred so the caller can first store anything it needs for it (such as
  // a new seat-hold token).
  if (result.code !== 'NETWORK') setTimeout(notifyDataChanged, 0);
  return result;
}

const admin = (action) => (...args) => call('admin', action, args);
const pub = (action) => (...args) => call('public', action, args);

// Admin (operator) actions
export const createRoute = admin('createRoute');
export const updateRoute = admin('updateRoute');
export const setRouteActive = admin('setRouteActive');
export const deleteRoute = admin('deleteRoute');

export const createBus = admin('createBus');
export const updateBus = admin('updateBus');
export const setBusStatus = admin('setBusStatus');
export const deleteBus = admin('deleteBus');

export const createTrips = admin('createTrips');
export const updateTrip = admin('updateTrip');
export const setTripStatus = admin('setTripStatus');
export const syncTripLayout = admin('syncTripLayout');
export const cancelTrip = admin('cancelTrip');
export const deleteTrip = admin('deleteTrip');

export const createSchedule = admin('createSchedule');
export const updateSchedule = admin('updateSchedule');
export const setScheduleStatus = admin('setScheduleStatus');
export const syncScheduleLayout = admin('syncScheduleLayout');
export const deleteSchedule = admin('deleteSchedule');

export const cancelBooking = admin('cancelBooking');
export const setBookingPayment = admin('setBookingPayment');

export const createExpense = admin('createExpense');
export const updateExpense = admin('updateExpense');
export const setExpensePaymentStatus = admin('setExpensePaymentStatus');
export const deleteExpense = admin('deleteExpense');
export const createMonthlySalaries = admin('createMonthlySalaries');

export const createMaintenance = admin('createMaintenance');
export const updateMaintenance = admin('updateMaintenance');
export const deleteMaintenance = admin('deleteMaintenance');
export const repairMaintenanceLinks = admin('repairMaintenanceLinks');

export const resetAllData = admin('resetAllData');

// Passenger actions
export const createHold = pub('createHold');
export const createBooking = pub('createBooking');

// WhatsApp message events, recorded for the passenger or the operator.
export function recordWhatsAppOpened(notificationId, audience = 'passenger') {
  return call(audience === 'operator' ? 'admin' : 'public', 'recordWhatsAppOpened', [notificationId]);
}
export function recordMessageCopied(notificationId, audience = 'passenger') {
  return call(audience === 'operator' ? 'admin' : 'public', 'recordMessageCopied', [notificationId]);
}

// One-time import of data saved by the old localStorage version.
// Ends the admin session. Returns true when the server confirmed it.
export async function signOutAdmin() {
  const result = await post('/api/auth/logout', {});
  return result.ok === true;
}

export function importLegacyData(collections) {
  return post('/api/admin/import', { collections });
}
