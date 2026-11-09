// MongoDB validators and indexes, one entry per collection.
//
// Every document uses the app's own record id (e.g. "bkg_lx3k9…") as `_id`.
// Those ids appear in URLs, link records to each other (booking.tripId,
// expense.maintenanceRecordId, …) and already exist in browser data imported
// from the old localStorage version, so keeping them as the primary key
// preserves every relationship without a mapping table.
//
// The services do the detailed validation; these validators are a safety net
// that keeps structurally broken records out of the database.

const str = { bsonType: 'string' };
const nonEmpty = { bsonType: 'string', minLength: 1 };
const num = { bsonType: 'number' };
const strOrNull = { bsonType: ['string', 'null'] };
const timestamps = { createdAt: str, updatedAt: str };

function schema(required, properties) {
  return {
    bsonType: 'object',
    required: ['_id', 'id', ...required],
    properties: { _id: nonEmpty, id: nonEmpty, ...timestamps, ...properties },
  };
}

export const COLLECTION_SCHEMAS = {
  routes: schema(['name', 'source', 'destination', 'defaultFare', 'duration'], {
    name: nonEmpty,
    source: nonEmpty,
    destination: nonEmpty,
    stops: { bsonType: 'array', items: str },
    defaultFare: num,
    duration: num,
    isActive: { bsonType: 'bool' },
  }),
  buses: schema(['name', 'registrationNumber', 'operationalStatus'], {
    name: nonEmpty,
    registrationNumber: nonEmpty,
    type: str,
    operationalStatus: { enum: ['Active', 'Under Maintenance', 'Inactive'] },
    seatLayout: { bsonType: ['object', 'null'] },
    odometer: { bsonType: ['number', 'null'] },
  }),
  trips: schema(['routeId', 'busId', 'departureAt', 'arrivalAt', 'fare', 'status'], {
    routeId: nonEmpty,
    busId: nonEmpty,
    scheduleId: str,
    departureAt: nonEmpty,
    arrivalAt: nonEmpty,
    fare: num,
    status: { enum: ['Scheduled', 'Completed', 'Cancelled'] },
    seatLayoutSnapshot: { bsonType: 'object' },
  }),
  schedules: schema(['routeId', 'busId', 'departureTime', 'durationMinutes', 'startDate', 'fare', 'status'], {
    routeId: nonEmpty,
    busId: nonEmpty,
    weekdays: { bsonType: 'array', items: { bsonType: 'number' } },
    departureTime: nonEmpty,
    durationMinutes: num,
    startDate: nonEmpty,
    fare: num,
    status: { enum: ['Active', 'Paused'] },
  }),
  bookings: schema(['bookingReference', 'tripId', 'seatIds', 'bookingStatus', 'paymentStatus', 'totalFare'], {
    bookingReference: nonEmpty,
    tripId: nonEmpty,
    busId: str,
    routeId: str,
    seatIds: { bsonType: 'array', minItems: 1, items: str },
    passengers: { bsonType: 'array' },
    contactNumber: str,
    totalFare: num,
    bookingStatus: { enum: ['Confirmed', 'Cancelled'] },
    paymentStatus: { enum: ['Paid', 'Unpaid'] },
    holdToken: strOrNull,
  }),
  holds: schema(['tripId', 'seatIds', 'holdToken', 'expiresAt', 'status'], {
    tripId: nonEmpty,
    seatIds: { bsonType: 'array', items: str },
    holdToken: nonEmpty,
    expiresAt: nonEmpty,
    status: { enum: ['active', 'expired', 'released', 'converted'] },
  }),
  expenses: schema(['busId', 'category', 'amount', 'expenseDate', 'paymentStatus'], {
    busId: nonEmpty,
    category: nonEmpty,
    amount: num,
    expenseDate: nonEmpty,
    paymentStatus: { enum: ['Paid', 'Pending'] },
    maintenanceRecordId: strOrNull,
  }),
  maintenance: schema(['busId', 'serviceDate', 'serviceType'], {
    busId: nonEmpty,
    serviceDate: nonEmpty,
    serviceType: nonEmpty,
    cost: { bsonType: ['number', 'null'] },
    expenseId: strOrNull,
  }),
  notifications: schema(['bookingId', 'type', 'message'], {
    bookingId: nonEmpty,
    type: nonEmpty,
    message: str,
    events: { bsonType: 'array' },
  }),
};

const caseInsensitive = { locale: 'en', strength: 2 };

export const COLLECTION_INDEXES = {
  routes: [
    { key: { name: 1 }, name: 'name_unique_ci', unique: true, collation: caseInsensitive },
    { key: { isActive: 1 }, name: 'isActive' },
  ],
  buses: [
    { key: { registrationNumber: 1 }, name: 'registrationNumber_unique', unique: true },
    { key: { operationalStatus: 1 }, name: 'operationalStatus' },
  ],
  trips: [
    { key: { busId: 1, departureAt: 1 }, name: 'busId_departureAt' },
    { key: { routeId: 1 }, name: 'routeId' },
    { key: { scheduleId: 1 }, name: 'scheduleId', sparse: true },
    { key: { status: 1, departureAt: 1 }, name: 'status_departureAt' },
    { key: { departureAt: 1 }, name: 'departureAt' },
  ],
  schedules: [
    { key: { busId: 1, status: 1 }, name: 'busId_status' },
    { key: { routeId: 1 }, name: 'routeId' },
  ],
  bookings: [
    { key: { bookingReference: 1 }, name: 'bookingReference_unique', unique: true },
    // One booking per seat hold: makes booking creation idempotent at the database level too.
    { key: { holdToken: 1 }, name: 'holdToken_unique', unique: true, partialFilterExpression: { holdToken: { $type: 'string' } } },
    { key: { tripId: 1, bookingStatus: 1 }, name: 'tripId_bookingStatus' },
    { key: { contactNumber: 1 }, name: 'contactNumber' },
    { key: { busId: 1, travelDate: 1 }, name: 'busId_travelDate' },
    { key: { createdAt: -1 }, name: 'createdAt' },
  ],
  holds: [
    { key: { holdToken: 1 }, name: 'holdToken_unique', unique: true },
    { key: { tripId: 1, status: 1, expiresAt: 1 }, name: 'tripId_status_expiresAt' },
  ],
  expenses: [
    { key: { busId: 1, expenseDate: -1 }, name: 'busId_expenseDate' },
    { key: { category: 1 }, name: 'category' },
    { key: { maintenanceRecordId: 1 }, name: 'maintenanceRecordId', sparse: true },
  ],
  maintenance: [{ key: { busId: 1, serviceDate: -1 }, name: 'busId_serviceDate' }],
  notifications: [{ key: { bookingId: 1, createdAt: -1 }, name: 'bookingId_createdAt' }],
};
