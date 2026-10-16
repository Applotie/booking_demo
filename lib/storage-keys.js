// Every localStorage key used by the app lives here so a future backend
// adapter only needs to replace lib/storage.js.

export const STORAGE_PREFIX = 'busops';
export const SCHEMA_VERSION = 1;

export const COLLECTIONS = [
  'routes',
  'buses',
  'trips',
  'bookings',
  'holds',
  'expenses',
  'maintenance',
  'notifications',
];

export const KEYS = {
  meta: `${STORAGE_PREFIX}:meta`,
  ...Object.fromEntries(COLLECTIONS.map((name) => [name, `${STORAGE_PREFIX}:${name}`])),
};

export const CHANGE_EVENT = `${STORAGE_PREFIX}:change`;
