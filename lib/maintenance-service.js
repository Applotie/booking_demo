// Maintenance records. A record with a cost owns exactly one linked expense
// (record.expenseId ↔ expense.maintenanceRecordId). Costs are therefore only
// ever counted through the expenses collection, never twice.

import { readCollection, writeCollections, generateId, nowISO } from './storage.js';
import {
  SERVICE_TYPES,
  MAINTENANCE_EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_STATUSES,
  PAYMENT_METHODS,
  DOCUMENT_FIELDS,
  DOC_WARNING_DAYS,
  SERVICE_WARNING_DAYS,
  SERVICE_KM_WARNING,
} from './constants.js';
import { daysBetween, todayKey } from './dates.js';
import {
  cleanText,
  cleanMultiline,
  validateAmount,
  toAmount,
  validateDateKey,
  validateInteger,
  toInteger,
  isBlank,
  hasErrors,
  fail,
} from './validators.js';

export function defaultCategoryFor(serviceType) {
  return SERVICE_TYPES.find((s) => s.value === serviceType)?.category || 'repairs_maintenance';
}

export function validateMaintenance(input, { buses }) {
  const errors = {};
  const bus = buses.find((b) => b.id === input.busId);
  if (!bus) errors.busId = 'Select a bus.';
  errors.serviceDate = validateDateKey(input.serviceDate, { label: 'Service date' });
  if (!errors.serviceDate && input.serviceDate > todayKey()) errors.serviceDate = 'Service date cannot be in the future. Use “Next service date” for planned work.';
  errors.odometer = validateInteger(input.odometer, { min: 0, max: 10000000, label: 'Odometer reading' });
  if (!SERVICE_TYPES.some((s) => s.value === input.serviceType)) errors.serviceType = 'Select a service type.';
  const workPerformed = cleanMultiline(input.workPerformed, 1000);
  if (!workPerformed) errors.workPerformed = 'Describe the work performed.';
  errors.cost = validateAmount(input.cost, { required: false, label: 'Service cost' });
  errors.nextServiceDate = validateDateKey(input.nextServiceDate, { required: false, label: 'Next service date' });
  if (!errors.nextServiceDate && !errors.serviceDate && input.nextServiceDate && input.nextServiceDate <= input.serviceDate) {
    errors.nextServiceDate = 'Next service date must be after the service date.';
  }
  errors.nextServiceOdometer = validateInteger(input.nextServiceOdometer, { required: false, min: 0, max: 10000000, label: 'Next service odometer' });
  if (!errors.nextServiceOdometer && !errors.odometer && !isBlank(input.nextServiceOdometer) && Number(input.nextServiceOdometer) <= Number(input.odometer)) {
    errors.nextServiceOdometer = 'Must be greater than the current odometer reading.';
  }
  const cost = toAmount(input.cost);
  const expenseCategory = MAINTENANCE_EXPENSE_CATEGORIES.includes(input.expenseCategory) ? input.expenseCategory : defaultCategoryFor(input.serviceType);
  const paymentStatus = EXPENSE_PAYMENT_STATUSES.includes(input.paymentStatus) ? input.paymentStatus : 'Paid';
  if (cost > 0 && !EXPENSE_PAYMENT_STATUSES.includes(input.paymentStatus)) errors.paymentStatus = 'Select whether the cost is paid or pending.';

  return {
    errors,
    clean: {
      busId: input.busId,
      serviceDate: input.serviceDate,
      odometer: toInteger(input.odometer, 0),
      serviceType: input.serviceType,
      workPerformed,
      provider: cleanText(input.provider, 120),
      cost,
      expenseCategory,
      paymentStatus,
      paymentMethod: PAYMENT_METHODS.includes(input.paymentMethod) ? input.paymentMethod : '',
      receiptReference: cleanText(input.receiptReference, 80),
      nextServiceDate: input.nextServiceDate || '',
      nextServiceOdometer: toInteger(input.nextServiceOdometer, null),
      notes: cleanMultiline(input.notes, 1000),
    },
  };
}

function expenseFieldsFor(record) {
  return {
    busId: record.busId,
    category: record.expenseCategory,
    description: `${record.serviceType}: ${record.workPerformed}`.slice(0, 200),
    amount: record.cost,
    expenseDate: record.serviceDate,
    paymentStatus: record.paymentStatus,
    paymentMethod: record.paymentMethod,
    recipient: record.provider,
    receiptReference: record.receiptReference,
    salaryPeriod: '',
    staffName: '',
    staffRole: '',
    isAdjustment: false,
    notes: 'Created from maintenance record',
    maintenanceRecordId: record.id,
  };
}

function bumpOdometer(buses, busId, odometer) {
  return buses.map((b) => (b.id === busId && Number(odometer) > Number(b.odometer || 0) ? { ...b, odometer: Number(odometer), updatedAt: nowISO() } : b));
}

export function createMaintenance(input) {
  const buses = readCollection('buses');
  const { errors, clean } = validateMaintenance(input, { buses });
  if (hasErrors(errors)) return fail(errors);
  const t = nowISO();
  const record = { id: generateId('mnt'), ...clean, expenseId: null, createdAt: t, updatedAt: t };
  const expenses = readCollection('expenses');
  let nextExpenses = expenses;
  if (record.cost > 0) {
    const expense = { id: generateId('exp'), ...expenseFieldsFor(record), createdAt: t, updatedAt: t };
    record.expenseId = expense.id;
    nextExpenses = [...expenses, expense];
  }
  writeCollections({
    maintenance: [...readCollection('maintenance'), record],
    expenses: nextExpenses,
    buses: bumpOdometer(buses, record.busId, record.odometer),
  });
  return { ok: true, record };
}

export function updateMaintenance(id, input) {
  const buses = readCollection('buses');
  const records = readCollection('maintenance');
  const existing = records.find((m) => m.id === id);
  if (!existing) return fail({}, 'Maintenance record not found.');
  const { errors, clean } = validateMaintenance(input, { buses });
  if (hasErrors(errors)) return fail(errors);
  const t = nowISO();
  const updated = { ...existing, ...clean, updatedAt: t };
  const expenses = readCollection('expenses');
  // Remove every expense linked to this record, then add back exactly one if
  // there is a cost. This also repairs any accidental duplicates.
  const linked = expenses.filter((e) => e.maintenanceRecordId === id || e.id === existing.expenseId);
  const others = expenses.filter((e) => !(e.maintenanceRecordId === id || e.id === existing.expenseId));
  let nextExpenses = others;
  if (updated.cost > 0) {
    const keep = linked.find((e) => e.id === existing.expenseId) || linked[0];
    const expense = keep
      ? { ...keep, ...expenseFieldsFor(updated), updatedAt: t }
      : { id: generateId('exp'), ...expenseFieldsFor(updated), createdAt: t, updatedAt: t };
    updated.expenseId = expense.id;
    nextExpenses = [...others, expense];
  } else {
    updated.expenseId = null;
  }
  writeCollections({
    maintenance: records.map((m) => (m.id === id ? updated : m)),
    expenses: nextExpenses,
    buses: bumpOdometer(buses, updated.busId, updated.odometer),
  });
  return { ok: true, record: updated };
}

export function deleteMaintenance(id) {
  const records = readCollection('maintenance');
  const existing = records.find((m) => m.id === id);
  if (!existing) return fail({}, 'Maintenance record not found.');
  const expenses = readCollection('expenses');
  writeCollections({
    maintenance: records.filter((m) => m.id !== id),
    expenses: expenses.filter((e) => !(e.maintenanceRecordId === id || e.id === existing.expenseId)),
  });
  return { ok: true };
}

// Detects broken maintenance ↔ expense links.
export function checkMaintenanceIntegrity({ maintenance, expenses }) {
  const issues = [];
  const recordIds = new Set(maintenance.map((m) => m.id));
  for (const e of expenses) {
    if (e.maintenanceRecordId && !recordIds.has(e.maintenanceRecordId)) issues.push({ type: 'orphan_expense', expenseId: e.id });
  }
  for (const m of maintenance) {
    const linked = expenses.filter((e) => e.maintenanceRecordId === m.id);
    if (m.cost > 0 && linked.length === 0) issues.push({ type: 'missing_expense', recordId: m.id });
    if (linked.length > 1) issues.push({ type: 'duplicate_expense', recordId: m.id });
    if (!(m.cost > 0) && linked.length) issues.push({ type: 'unexpected_expense', recordId: m.id });
  }
  return issues;
}

export function repairMaintenanceLinks() {
  const maintenance = readCollection('maintenance');
  const expenses = readCollection('expenses');
  const recordIds = new Set(maintenance.map((m) => m.id));
  const t = nowISO();
  let next = expenses.filter((e) => !e.maintenanceRecordId || recordIds.has(e.maintenanceRecordId));
  const nextRecords = maintenance.map((m) => {
    const linked = next.filter((e) => e.maintenanceRecordId === m.id);
    next = next.filter((e) => e.maintenanceRecordId !== m.id);
    if (m.cost > 0) {
      const keep = linked.find((e) => e.id === m.expenseId) || linked[0];
      const expense = keep ? { ...keep, ...expenseFieldsFor(m), updatedAt: t } : { id: generateId('exp'), ...expenseFieldsFor(m), createdAt: t, updatedAt: t };
      next.push(expense);
      return { ...m, expenseId: expense.id };
    }
    return { ...m, expenseId: null };
  });
  writeCollections({ maintenance: nextRecords, expenses: next });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Service status and reminders
// ---------------------------------------------------------------------------

export function getServiceStatus(bus, maintenance, today = todayKey()) {
  const records = maintenance
    .filter((m) => m.busId === bus.id)
    .sort((a, b) => b.serviceDate.localeCompare(a.serviceDate) || String(b.createdAt).localeCompare(String(a.createdAt)));
  const last = records[0] || null;
  // The most recent record that sets a next-service target is authoritative.
  const planner = records.find((m) => m.nextServiceDate || m.nextServiceOdometer) || null;
  const nextServiceDate = planner?.nextServiceDate || '';
  const nextServiceOdometer = planner?.nextServiceOdometer ?? null;
  const daysLeft = nextServiceDate ? daysBetween(today, nextServiceDate) : null;
  const kmLeft = nextServiceOdometer != null ? nextServiceOdometer - Number(bus.odometer || 0) : null;
  let status = 'none';
  if ((daysLeft != null && daysLeft < 0) || (kmLeft != null && kmLeft <= 0)) status = 'overdue';
  else if ((daysLeft != null && daysLeft <= SERVICE_WARNING_DAYS) || (kmLeft != null && kmLeft <= SERVICE_KM_WARNING)) status = 'due_soon';
  else if (nextServiceDate || nextServiceOdometer != null) status = 'ok';
  return { last, lastServiceDate: last?.serviceDate || '', nextServiceDate, nextServiceOdometer, daysLeft, kmLeft, status, count: records.length };
}

export function getDocumentStatus(bus, today = todayKey()) {
  return DOCUMENT_FIELDS.map(({ key, label }) => {
    const date = bus.documents?.[key] || '';
    if (!date) return { key, label, date: '', daysLeft: null, status: 'missing' };
    const daysLeft = daysBetween(today, date);
    const status = daysLeft < 0 ? 'expired' : daysLeft <= DOC_WARNING_DAYS ? 'due_soon' : 'ok';
    return { key, label, date, daysLeft, status };
  });
}

// Reminders for every non-inactive bus, most urgent first.
export function getReminders({ buses, maintenance }, today = todayKey()) {
  const reminders = [];
  for (const bus of buses) {
    if (bus.operationalStatus === 'Inactive') continue;
    for (const doc of getDocumentStatus(bus, today)) {
      if (doc.status === 'expired' || doc.status === 'due_soon') {
        reminders.push({
          id: `${bus.id}-${doc.key}`,
          busId: bus.id,
          busName: bus.name,
          kind: 'document',
          title: `${doc.label} ${doc.status === 'expired' ? 'expired' : 'expiring'}`,
          date: doc.date,
          daysLeft: doc.daysLeft,
          severity: doc.status === 'expired' ? 'overdue' : 'due_soon',
        });
      }
    }
    const svc = getServiceStatus(bus, maintenance, today);
    if (svc.status === 'overdue' || svc.status === 'due_soon') {
      const parts = [];
      if (svc.nextServiceDate) parts.push(`due ${svc.nextServiceDate}`);
      if (svc.nextServiceOdometer != null) parts.push(`at ${svc.nextServiceOdometer} km`);
      reminders.push({
        id: `${bus.id}-service`,
        busId: bus.id,
        busName: bus.name,
        kind: 'service',
        title: svc.status === 'overdue' ? 'Service overdue' : 'Service due soon',
        date: svc.nextServiceDate,
        daysLeft: svc.daysLeft,
        kmLeft: svc.kmLeft,
        severity: svc.status,
      });
    }
  }
  const rank = { overdue: 0, due_soon: 1 };
  return reminders.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
}
