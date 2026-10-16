import { readCollection, writeCollection, generateId, nowISO } from './storage.js';
import { BUS_TYPES, BUS_STATUSES, DOCUMENT_FIELDS } from './constants.js';
import { generateSeatLayout, validateLayoutInput } from './seat-service.js';
import { todayKey } from './dates.js';
import {
  cleanText,
  cleanMultiline,
  validateRegistration,
  normalizeRegistration,
  formatRegistration,
  validateInteger,
  toInteger,
  validateDateKey,
  validateIndianMobile,
  normalizeIndianMobile,
  validatePersonName,
  hasErrors,
  fail,
} from './validators.js';

function cleanPerson(person, label, errors, key) {
  const name = cleanText(person?.name, 80);
  const phoneRaw = cleanText(person?.phone, 20);
  const errs = {};
  if (name) {
    const nameErr = validatePersonName(name, { label: `${label} name` });
    if (nameErr) errs.name = nameErr;
  }
  if (phoneRaw) {
    const phoneErr = validateIndianMobile(phoneRaw, { label: `${label} phone` });
    if (phoneErr) errs.phone = phoneErr;
  }
  if (!name && phoneRaw) errs.name = `Enter the ${label.toLowerCase()}'s name.`;
  if (Object.keys(errs).length) errors[key] = errs;
  return { name, phone: normalizeIndianMobile(phoneRaw)?.national || phoneRaw };
}

export function validateBus(input, buses, excludeId = null) {
  const errors = {};
  const name = cleanText(input.name, 80);
  if (!name) errors.name = 'Bus name is required.';

  const regErr = validateRegistration(input.registrationNumber);
  const reg = normalizeRegistration(input.registrationNumber);
  if (regErr) errors.registrationNumber = regErr;
  else if (buses.some((b) => b.id !== excludeId && normalizeRegistration(b.registrationNumber) === reg)) {
    errors.registrationNumber = 'A bus with this registration number already exists.';
  }

  const type = cleanText(input.type, 60);
  if (!type) errors.type = 'Select a bus type.';
  else if (!BUS_TYPES.includes(type)) errors.type = 'Select a valid bus type.';

  const layoutInput = input.layout || {};
  const layoutErrors = validateLayoutInput(layoutInput);
  let seatLayout = null;
  if (Object.keys(layoutErrors).length) errors.layout = layoutErrors;
  else seatLayout = generateSeatLayout(layoutInput);

  const driver = cleanPerson(input.driver, 'Driver', errors, 'driver');
  const conductor = cleanPerson(input.conductor, 'Conductor', errors, 'conductor');

  const staffErrors = [];
  const staff = (Array.isArray(input.staff) ? input.staff : []).map((s, i) => {
    const nameV = cleanText(s?.name, 80);
    const role = cleanText(s?.role, 60);
    const phone = cleanText(s?.phone, 20);
    const e = {};
    const nErr = validatePersonName(nameV, { label: 'Staff name' });
    if (nErr) e.name = nErr;
    if (!role) e.role = 'Role is required.';
    if (phone) {
      const pErr = validateIndianMobile(phone, { label: 'Phone' });
      if (pErr) e.phone = pErr;
    }
    if (Object.keys(e).length) staffErrors[i] = e;
    return { id: s?.id || generateId('stf'), name: nameV, role, phone: normalizeIndianMobile(phone)?.national || phone };
  });
  if (staffErrors.some(Boolean)) errors.staff = staffErrors;

  const purchaseErr = validateDateKey(input.purchaseDate, { required: false, label: 'Purchase date' });
  if (purchaseErr) errors.purchaseDate = purchaseErr;
  else if (input.purchaseDate && input.purchaseDate > todayKey()) errors.purchaseDate = 'Purchase date cannot be in the future.';

  const odoErr = validateInteger(input.odometer, { required: false, min: 0, max: 10000000, label: 'Odometer' });
  if (odoErr) errors.odometer = odoErr;

  const documents = {};
  const docErrors = {};
  for (const { key, label } of DOCUMENT_FIELDS) {
    const v = input.documents?.[key] || '';
    const err = validateDateKey(v, { required: false, label: `${label} expiry` });
    if (err) docErrors[key] = err;
    documents[key] = v;
  }
  if (Object.keys(docErrors).length) errors.documents = docErrors;

  const operationalStatus = BUS_STATUSES.includes(input.operationalStatus) ? input.operationalStatus : 'Active';

  return {
    errors,
    clean: {
      name,
      registrationNumber: formatRegistration(reg),
      type,
      capacity: seatLayout ? seatLayout.capacity : null,
      seatLayout,
      driver,
      conductor,
      staff,
      purchaseDate: input.purchaseDate || '',
      odometer: toInteger(input.odometer, 0),
      documents,
      operationalStatus,
      notes: cleanMultiline(input.notes, 2000),
    },
  };
}

export function createBus(input) {
  const buses = readCollection('buses');
  const { errors, clean } = validateBus(input, buses);
  if (hasErrors(errors)) return fail(errors);
  const now = nowISO();
  const today = todayKey();
  const bus = {
    id: generateId('bus'),
    ...clean,
    driver: { ...clean.driver, since: clean.driver.name ? today : '' },
    conductor: { ...clean.conductor, since: clean.conductor.name ? today : '' },
    staffHistory: [],
    layoutUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  writeCollection('buses', [...buses, bus]);
  return { ok: true, record: bus };
}

// Staff changes are recorded in staffHistory. Salary expenses store the staff
// name and role directly, so reassignment never alters past salary records.
export function updateBus(id, input) {
  const buses = readCollection('buses');
  const existing = buses.find((b) => b.id === id);
  if (!existing) return fail({}, 'Bus not found.');
  const { errors, clean } = validateBus(input, buses, id);
  if (hasErrors(errors)) return fail(errors);
  const today = todayKey();
  const history = Array.isArray(existing.staffHistory) ? [...existing.staffHistory] : [];
  const carry = (role, prev, next) => {
    if (prev?.name && prev.name !== next.name) {
      history.push({ role, name: prev.name, phone: prev.phone || '', from: prev.since || '', until: today });
    }
    return { ...next, since: next.name ? (prev?.name === next.name ? prev.since || today : today) : '' };
  };
  const driver = carry('Driver', existing.driver, clean.driver);
  const conductor = carry('Conductor/Helper', existing.conductor, clean.conductor);
  const nextStaffIds = new Set(clean.staff.map((s) => s.id));
  for (const s of existing.staff || []) {
    if (!nextStaffIds.has(s.id)) history.push({ role: s.role, name: s.name, phone: s.phone || '', from: '', until: today });
  }
  const layoutChanged = JSON.stringify(existing.seatLayout) !== JSON.stringify(clean.seatLayout);
  const updated = {
    ...existing,
    ...clean,
    driver,
    conductor,
    staffHistory: history,
    // The odometer is only ever moved forward by maintenance records, but the
    // admin may correct it manually here.
    layoutUpdatedAt: layoutChanged ? nowISO() : existing.layoutUpdatedAt,
    updatedAt: nowISO(),
  };
  writeCollection('buses', buses.map((b) => (b.id === id ? updated : b)));
  return { ok: true, record: updated, layoutChanged };
}

export function setBusStatus(id, status) {
  if (!BUS_STATUSES.includes(status)) return fail({}, 'Invalid status.');
  const buses = readCollection('buses');
  const existing = buses.find((b) => b.id === id);
  if (!existing) return fail({}, 'Bus not found.');
  const updated = { ...existing, operationalStatus: status, updatedAt: nowISO() };
  writeCollection('buses', buses.map((b) => (b.id === id ? updated : b)));
  return { ok: true, record: updated };
}

export function updateBusOdometer(id, odometer) {
  const buses = readCollection('buses');
  const existing = buses.find((b) => b.id === id);
  if (!existing) return;
  if (Number(odometer) > Number(existing.odometer || 0)) {
    writeCollection('buses', buses.map((b) => (b.id === id ? { ...b, odometer: Number(odometer), updatedAt: nowISO() } : b)));
  }
}

export function getBusDependencies(id, data) {
  return {
    trips: data.trips.filter((t) => t.busId === id).length,
    expenses: data.expenses.filter((e) => e.busId === id).length,
    maintenance: data.maintenance.filter((m) => m.busId === id).length,
  };
}

export function deleteBus(id) {
  const buses = readCollection('buses');
  if (!buses.some((b) => b.id === id)) return fail({}, 'Bus not found.');
  const deps = getBusDependencies(id, {
    trips: readCollection('trips'),
    expenses: readCollection('expenses'),
    maintenance: readCollection('maintenance'),
  });
  const total = deps.trips + deps.expenses + deps.maintenance;
  if (total > 0) {
    return fail(
      {},
      `This bus has history (${deps.trips} trips, ${deps.expenses} expenses, ${deps.maintenance} maintenance records). Set it to Inactive instead so that history is preserved.`
    );
  }
  writeCollection('buses', buses.filter((b) => b.id !== id));
  return { ok: true };
}

// Staff list used to pre-fill salary entry.
export function getBusStaff(bus) {
  if (!bus) return [];
  const list = [];
  if (bus.driver?.name) list.push({ name: bus.driver.name, role: 'Driver', category: 'driver_salary' });
  if (bus.conductor?.name) list.push({ name: bus.conductor.name, role: 'Conductor/Helper', category: 'conductor_salary' });
  for (const s of bus.staff || []) {
    if (s.name) list.push({ name: s.name, role: s.role || 'Staff', category: 'staff_salary' });
  }
  return list;
}

export function busLabel(bus) {
  if (!bus) return 'Unknown bus';
  return `${bus.name} (${bus.registrationNumber})`;
}
