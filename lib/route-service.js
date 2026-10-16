import { readCollection, writeCollection, generateId, nowISO } from './storage.js';
import { cleanText, cleanMultiline, validateAmount, toAmount, validateInteger, hasErrors, fail, isBlank } from './validators.js';

export function routeLabel(route) {
  if (!route) return 'Unknown route';
  return `${route.source} → ${route.destination}`;
}

export function validateRoute(input, routes, excludeId = null) {
  const errors = {};
  const name = cleanText(input.name, 120);
  const source = cleanText(input.source, 80);
  const destination = cleanText(input.destination, 80);
  if (!name) errors.name = 'Route name is required.';
  else if (routes.some((r) => r.id !== excludeId && r.name.toLowerCase() === name.toLowerCase())) {
    errors.name = 'Another route already uses this name.';
  }
  if (!source) errors.source = 'Source is required.';
  if (!destination) errors.destination = 'Destination is required.';
  if (source && destination && source.toLowerCase() === destination.toLowerCase()) {
    errors.destination = 'Destination must be different from the source.';
  }

  const stops = (Array.isArray(input.stops) ? input.stops : []).map((s) => cleanText(s, 80));
  const stopErrors = [];
  const seen = new Set([source.toLowerCase(), destination.toLowerCase()]);
  stops.forEach((stop, i) => {
    if (!stop) stopErrors[i] = 'Enter a stop name or remove this stop.';
    else if (seen.has(stop.toLowerCase())) stopErrors[i] = 'This stop is already on the route.';
    else seen.add(stop.toLowerCase());
  });
  if (stopErrors.some(Boolean)) errors.stops = stopErrors;

  errors.defaultFare = validateAmount(input.defaultFare, { allowZero: false, label: 'Default fare' });

  const hours = isBlank(input.durationHours) ? '0' : input.durationHours;
  const minutes = isBlank(input.durationMinutes) ? '0' : input.durationMinutes;
  const hErr = validateInteger(hours, { min: 0, max: 72, label: 'Hours' });
  const mErr = validateInteger(minutes, { min: 0, max: 59, label: 'Minutes' });
  if (hErr || mErr) errors.duration = hErr || mErr;
  else if (Number(hours) * 60 + Number(minutes) <= 0) errors.duration = 'Journey duration must be greater than zero.';

  const clean = {
    name,
    source,
    destination,
    stops,
    defaultFare: toAmount(input.defaultFare),
    duration: Number(hours) * 60 + Number(minutes),
    description: cleanMultiline(input.description, 1000),
    isActive: input.isActive !== false,
  };
  return { errors, clean };
}

export function createRoute(input) {
  const routes = readCollection('routes');
  const { errors, clean } = validateRoute(input, routes);
  if (hasErrors(errors)) return fail(errors);
  const now = nowISO();
  const route = { id: generateId('rt'), ...clean, createdAt: now, updatedAt: now };
  writeCollection('routes', [...routes, route]);
  return { ok: true, record: route };
}

export function updateRoute(id, input) {
  const routes = readCollection('routes');
  const existing = routes.find((r) => r.id === id);
  if (!existing) return fail({}, 'Route not found.');
  const { errors, clean } = validateRoute(input, routes, id);
  if (hasErrors(errors)) return fail(errors);
  // Existing trips keep their own fare and route snapshot, so editing the
  // route never changes scheduled trips or bookings.
  const updated = { ...existing, ...clean, updatedAt: nowISO() };
  writeCollection('routes', routes.map((r) => (r.id === id ? updated : r)));
  return { ok: true, record: updated };
}

export function setRouteActive(id, isActive) {
  const routes = readCollection('routes');
  const existing = routes.find((r) => r.id === id);
  if (!existing) return fail({}, 'Route not found.');
  const updated = { ...existing, isActive: Boolean(isActive), updatedAt: nowISO() };
  writeCollection('routes', routes.map((r) => (r.id === id ? updated : r)));
  return { ok: true, record: updated };
}

export function getRouteDependencies(id, trips = readCollection('trips')) {
  return { trips: trips.filter((t) => t.routeId === id).length };
}

export function deleteRoute(id) {
  const routes = readCollection('routes');
  if (!routes.some((r) => r.id === id)) return fail({}, 'Route not found.');
  const deps = getRouteDependencies(id);
  if (deps.trips > 0) {
    return fail({}, `This route has ${deps.trips} trip(s) in its history. Deactivate it instead so past trips and bookings stay intact.`);
  }
  writeCollection('routes', routes.filter((r) => r.id !== id));
  return { ok: true };
}
