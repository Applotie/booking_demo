// Names shared by the client and the server.

// One MongoDB collection per entry.
export const COLLECTIONS = [
  'routes',
  'buses',
  'trips',
  'schedules',
  'bookings',
  'holds',
  'expenses',
  'maintenance',
  'notifications',
];

// Browser event fired after any successful change, so pages reload their data.
export const CHANGE_EVENT = 'busops:change';

// Keys used by the earlier localStorage-only version of the app. They are only
// read by the one-time import into MongoDB (components/admin/LocalDataImport.js).
export const LEGACY_PREFIX = 'busops';
export const LEGACY_KEYS = {
  meta: `${LEGACY_PREFIX}:meta`,
  ...Object.fromEntries(COLLECTIONS.map((name) => [name, `${LEGACY_PREFIX}:${name}`])),
};
