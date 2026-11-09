// The only write operations the API accepts. Each entry checks the shape of
// its arguments and then runs the existing business service inside a MongoDB
// transaction (lib/server/store.js). Callers can never pass options such as
// `now` or `by`; those are fixed here on the server.

import { runWrite } from './store.js';
import { getDatabase, LOCK_COLLECTION } from './mongodb.js';
import { COLLECTIONS } from '../storage-keys.js';
import { BadRequestError, requireId, optionalId, requireObject, requireString, optionalString, requireArray } from './http.js';
import { createRoute, updateRoute, setRouteActive, deleteRoute } from '../route-service.js';
import { createBus, updateBus, setBusStatus, deleteBus } from '../bus-service.js';
import {
  createTrip,
  createTrips,
  updateTrip,
  setTripStatus,
  syncTripLayout,
  cancelTrip,
  deleteTrip,
  createSchedule,
  updateSchedule,
  setScheduleStatus,
  syncScheduleLayout,
  deleteSchedule,
} from '../trip-service.js';
import { createHold, createBooking, cancelBooking, setBookingPayment } from '../booking-service.js';
import { createExpense, updateExpense, setExpensePaymentStatus, deleteExpense, createMonthlySalaries } from '../expense-service.js';
import { createMaintenance, updateMaintenance, deleteMaintenance, repairMaintenanceLinks } from '../maintenance-service.js';
import { recordWhatsAppOpened, recordMessageCopied } from '../notifications/index.js';
import { parseOccurrenceId } from '../schedule-service.js';
import { MAX_SEATS_PER_BOOKING } from '../constants.js';

const write = (fn, scope) => runWrite(fn, { scope });

// Every action returns a promise, so argument errors surface as rejections too.
function asyncActions(map) {
  return Object.freeze(Object.fromEntries(Object.entries(map).map(([name, fn]) => [name, async (args) => fn(args)])));
}

function seatList(value) {
  const seats = requireArray(value, 'seat list', MAX_SEATS_PER_BOOKING * 4);
  seats.forEach((s) => requireString(s, 'seat', 10));
  return seats;
}

// Scopes for the passenger booking path, so a hold or booking only loads the
// records of its own trip instead of every booking ever made.
function tripScope(tripId) {
  const occ = parseOccurrenceId(tripId);
  return { trips: { _id: tripId }, schedules: occ ? { _id: occ.scheduleId } : 'none' };
}

function noteEvent(fn, by) {
  return ([id]) => {
    const notificationId = requireId(id, 'notification');
    return write(() => ({ ok: Boolean(fn(notificationId, by)) }), { notifications: { _id: notificationId } });
  };
}

async function resetAllData([confirmation]) {
  if (confirmation !== 'RESET') throw new BadRequestError('Type RESET to confirm.');
  const { client, db } = await getDatabase();
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection(LOCK_COLLECTION).updateOne({ _id: 'writes' }, { $inc: { version: 1 } }, { session, upsert: true });
      for (const name of COLLECTIONS) await db.collection(name).deleteMany({}, { session });
    });
  } finally {
    await session.endSession();
  }
  return { ok: true };
}

export const ADMIN_ACTIONS = asyncActions({
  createRoute: ([input]) => write(() => createRoute(requireObject(input))),
  updateRoute: ([id, input]) => write(() => updateRoute(requireId(id, 'route'), requireObject(input))),
  setRouteActive: ([id, isActive]) => write(() => setRouteActive(requireId(id, 'route'), isActive === true)),
  deleteRoute: ([id]) => write(() => deleteRoute(requireId(id, 'route'))),

  createBus: ([input]) => write(() => createBus(requireObject(input))),
  updateBus: ([id, input]) => write(() => updateBus(requireId(id, 'bus'), requireObject(input))),
  setBusStatus: ([id, status]) => write(() => setBusStatus(requireId(id, 'bus'), requireString(status, 'status', 40))),
  deleteBus: ([id]) => write(() => deleteBus(requireId(id, 'bus'))),

  createTrip: ([input]) => write(() => createTrip(requireObject(input))),
  createTrips: ([input]) => write(() => createTrips(requireObject(input))),
  updateTrip: ([id, input]) => write(() => updateTrip(requireId(id, 'trip'), requireObject(input))),
  setTripStatus: ([id, status]) => write(() => setTripStatus(requireId(id, 'trip'), requireString(status, 'status', 40))),
  syncTripLayout: ([id]) => write(() => syncTripLayout(requireId(id, 'trip'))),
  cancelTrip: ([id, options]) => {
    const o = options == null ? {} : requireObject(options, 'options');
    return write(() => cancelTrip(requireId(id, 'trip'), { reason: optionalString(o.reason, 'reason', 1000), cancelBookings: o.cancelBookings === true }));
  },
  deleteTrip: ([id]) => write(() => deleteTrip(requireId(id, 'trip'))),

  createSchedule: ([input]) => write(() => createSchedule(requireObject(input))),
  updateSchedule: ([id, input]) => write(() => updateSchedule(requireId(id, 'repeating trip'), requireObject(input))),
  setScheduleStatus: ([id, status]) => write(() => setScheduleStatus(requireId(id, 'repeating trip'), requireString(status, 'status', 40))),
  syncScheduleLayout: ([id]) => write(() => syncScheduleLayout(requireId(id, 'repeating trip'))),
  deleteSchedule: ([id]) => write(() => deleteSchedule(requireId(id, 'repeating trip'))),

  cancelBooking: ([id, options]) => {
    const bookingId = requireId(id, 'booking');
    const o = options == null ? {} : requireObject(options, 'options');
    const reason = optionalString(o.reason, 'reason', 1000);
    return write(() => cancelBooking(bookingId, { reason, by: 'operator' }), { bookings: { _id: bookingId }, notifications: 'none' });
  },
  setBookingPayment: ([id, status, options]) => {
    const bookingId = requireId(id, 'booking');
    const o = options == null ? {} : requireObject(options, 'options');
    const method = optionalString(o.method, 'payment method', 40);
    return write(() => setBookingPayment(bookingId, requireString(status, 'payment status', 20), { method }), { bookings: { _id: bookingId } });
  },

  createExpense: ([input]) => write(() => createExpense(requireObject(input))),
  updateExpense: ([id, input]) => write(() => updateExpense(requireId(id, 'expense'), requireObject(input))),
  setExpensePaymentStatus: ([id, status, method]) =>
    write(() => setExpensePaymentStatus(requireId(id, 'expense'), requireString(status, 'payment status', 20), optionalString(method, 'payment method', 40))),
  deleteExpense: ([id]) => write(() => deleteExpense(requireId(id, 'expense'))),
  createMonthlySalaries: ([input]) => {
    const o = requireObject(input);
    requireArray(o.entries, 'salary rows', 200).forEach((e) => requireObject(e, 'salary row'));
    return write(() => createMonthlySalaries(o));
  },

  createMaintenance: ([input]) => write(() => createMaintenance(requireObject(input))),
  updateMaintenance: ([id, input]) => write(() => updateMaintenance(requireId(id, 'maintenance record'), requireObject(input))),
  deleteMaintenance: ([id]) => write(() => deleteMaintenance(requireId(id, 'maintenance record'))),
  repairMaintenanceLinks: () => write(() => repairMaintenanceLinks()),

  recordWhatsAppOpened: noteEvent(recordWhatsAppOpened, 'operator'),
  recordMessageCopied: noteEvent(recordMessageCopied, 'operator'),

  resetAllData,
});

export const PUBLIC_ACTIONS = asyncActions({
  createHold: ([input]) => {
    const o = requireObject(input);
    const tripId = requireId(o.tripId, 'trip');
    const seatIds = seatList(o.seatIds);
    const replaceToken = optionalId(o.replaceToken, 'seat hold');
    const holds = replaceToken ? { $or: [{ tripId }, { holdToken: replaceToken }] } : { tripId };
    return write(() => createHold({ tripId, seatIds, replaceToken }), {
      ...tripScope(tripId),
      bookings: { tripId, bookingStatus: 'Confirmed' },
      holds,
    });
  },
  createBooking: ([input]) => {
    const o = requireObject(input);
    const tripId = requireId(o.tripId, 'trip');
    const holdToken = optionalId(o.holdToken, 'seat hold');
    const seatIds = seatList(o.seatIds);
    const passengers = requireArray(o.passengers, 'passengers', MAX_SEATS_PER_BOOKING * 4).map((p) => {
      const x = requireObject(p, 'passenger');
      return { seatId: optionalString(x.seatId, 'seat', 10), name: optionalString(x.name, 'name', 200), age: x.age == null ? '' : String(x.age).slice(0, 10), gender: optionalString(x.gender, 'gender', 20) };
    });
    const booking = {
      holdToken,
      tripId,
      seatIds,
      passengers,
      contactNumber: optionalString(o.contactNumber, 'contact number', 40),
      contactName: optionalString(o.contactName, 'contact name', 200),
    };
    return write(() => createBooking(booking), {
      ...tripScope(tripId),
      bookings: holdToken ? { $or: [{ tripId }, { holdToken }] } : { tripId },
      holds: { tripId },
      notifications: 'none',
    });
  },
  recordWhatsAppOpened: noteEvent(recordWhatsAppOpened, 'passenger'),
  recordMessageCopied: noteEvent(recordMessageCopied, 'passenger'),
});
