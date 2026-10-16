import { readCollection, writeCollection, generateId, nowISO } from './storage.js';
import {
  EXPENSE_CATEGORIES,
  SALARY_CATEGORIES,
  EXPENSE_PAYMENT_STATUSES,
  PAYMENT_METHODS,
  categoryMeta,
} from './constants.js';
import { isMonthKey, inRange } from './dates.js';
import { formatMonth } from './formatters.js';
import {
  cleanText,
  cleanMultiline,
  validateAmount,
  toAmount,
  validateDateKey,
  validatePersonName,
  hasErrors,
  fail,
} from './validators.js';

export function isSalaryCategory(category) {
  return SALARY_CATEGORIES.includes(category);
}

const staffKey = (name) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');

export function findDuplicateSalary(expenses, { staffName, salaryPeriod }, excludeId = null) {
  const key = staffKey(staffName);
  return (
    expenses.find(
      (e) => e.id !== excludeId && isSalaryCategory(e.category) && e.salaryPeriod === salaryPeriod && staffKey(e.staffName) === key
    ) || null
  );
}

export function validateExpense(input, { buses, expenses }, excludeId = null) {
  const errors = {};
  const bus = buses.find((b) => b.id === input.busId);
  if (!bus) errors.busId = 'Select a bus.';

  const meta = categoryMeta(input.category);
  if (!meta) errors.category = 'Select a category.';

  errors.amount = validateAmount(input.amount, { label: 'Amount' });
  errors.expenseDate = validateDateKey(input.expenseDate, { label: 'Date' });
  if (!EXPENSE_PAYMENT_STATUSES.includes(input.paymentStatus)) errors.paymentStatus = 'Select a payment status.';
  if (input.paymentMethod && !PAYMENT_METHODS.includes(input.paymentMethod)) errors.paymentMethod = 'Select a valid payment method.';

  const salary = isSalaryCategory(input.category);
  let staffName = '';
  let staffRole = '';
  let salaryPeriod = '';
  if (salary) {
    staffName = cleanText(input.staffName, 80);
    staffRole = cleanText(input.staffRole, 60) || meta.staffRole;
    salaryPeriod = input.salaryPeriod || '';
    errors.staffName = validatePersonName(staffName, { label: 'Staff name' });
    if (!isMonthKey(salaryPeriod)) errors.salaryPeriod = 'Select the salary month.';
    if (!errors.staffName && !errors.salaryPeriod && !input.isAdjustment) {
      const dup = findDuplicateSalary(expenses, { staffName, salaryPeriod }, excludeId);
      if (dup) {
        errors.staffName = `A salary record for ${dup.staffName} for ${formatMonth(salaryPeriod)} already exists. Edit that record, or tick "correction/adjustment" to add another.`;
      }
    }
  }

  let description = cleanText(input.description, 200);
  if (!description && salary && staffName && salaryPeriod) {
    description = `${staffRole} salary – ${staffName} – ${formatMonth(salaryPeriod)}`;
  }
  if (!description) errors.description = 'Description is required.';

  return {
    errors,
    clean: {
      busId: input.busId,
      category: input.category,
      description,
      amount: toAmount(input.amount),
      expenseDate: input.expenseDate,
      paymentStatus: input.paymentStatus,
      paymentMethod: input.paymentStatus === 'Paid' ? input.paymentMethod || '' : input.paymentMethod || '',
      recipient: cleanText(input.recipient, 120) || (salary ? staffName : ''),
      receiptReference: cleanText(input.receiptReference, 80),
      salaryPeriod: salary ? salaryPeriod : '',
      staffName: salary ? staffName : '',
      staffRole: salary ? staffRole : '',
      isAdjustment: salary ? Boolean(input.isAdjustment) : false,
      notes: cleanMultiline(input.notes, 1000),
    },
  };
}

function context() {
  return { buses: readCollection('buses'), expenses: readCollection('expenses') };
}

export function createExpense(input) {
  const ctx = context();
  const { errors, clean } = validateExpense(input, ctx);
  if (hasErrors(errors)) return fail(errors);
  const t = nowISO();
  const expense = { id: generateId('exp'), ...clean, maintenanceRecordId: null, createdAt: t, updatedAt: t };
  writeCollection('expenses', [...ctx.expenses, expense]);
  return { ok: true, record: expense };
}

export function updateExpense(id, input) {
  const ctx = context();
  const existing = ctx.expenses.find((e) => e.id === id);
  if (!existing) return fail({}, 'Expense not found.');
  if (existing.maintenanceRecordId) {
    return fail({}, 'This expense is linked to a maintenance record. Edit the maintenance record instead so the cost is not counted twice.');
  }
  const { errors, clean } = validateExpense(input, ctx, id);
  if (hasErrors(errors)) return fail(errors);
  const updated = { ...existing, ...clean, updatedAt: nowISO() };
  writeCollection('expenses', ctx.expenses.map((e) => (e.id === id ? updated : e)));
  return { ok: true, record: updated };
}

// Payment status can be toggled on any expense, including maintenance-linked
// ones (the amount still lives on the maintenance record).
export function setExpensePaymentStatus(id, paymentStatus, paymentMethod = '') {
  if (!EXPENSE_PAYMENT_STATUSES.includes(paymentStatus)) return fail({}, 'Invalid status.');
  const expenses = readCollection('expenses');
  const existing = expenses.find((e) => e.id === id);
  if (!existing) return fail({}, 'Expense not found.');
  const updated = {
    ...existing,
    paymentStatus,
    paymentMethod: paymentMethod || existing.paymentMethod || '',
    updatedAt: nowISO(),
  };
  writeCollection('expenses', expenses.map((e) => (e.id === id ? updated : e)));
  return { ok: true, record: updated };
}

export function deleteExpense(id) {
  const expenses = readCollection('expenses');
  const existing = expenses.find((e) => e.id === id);
  if (!existing) return fail({}, 'Expense not found.');
  if (existing.maintenanceRecordId) {
    return fail({}, 'This expense belongs to a maintenance record. Delete or edit the maintenance record instead.');
  }
  writeCollection('expenses', expenses.filter((e) => e.id !== id));
  return { ok: true };
}

/**
 * Monthly salary entry for one bus. All rows are validated first; nothing is
 * saved if any row has an error. Rows with a blank amount are skipped.
 */
export function createMonthlySalaries({ busId, salaryPeriod, expenseDate, paymentStatus, paymentMethod, entries }) {
  const ctx = context();
  const rowErrors = {};
  const toCreate = [];
  const pending = [...ctx.expenses];
  const t = nowISO();
  (entries || []).forEach((entry, i) => {
    if (entry.amount === '' || entry.amount == null) return;
    const { errors, clean } = validateExpense(
      {
        busId,
        category: entry.category,
        staffName: entry.staffName,
        staffRole: entry.staffRole,
        salaryPeriod,
        amount: entry.amount,
        expenseDate,
        paymentStatus,
        paymentMethod,
        description: '',
        notes: entry.notes,
      },
      { buses: ctx.buses, expenses: pending }
    );
    if (hasErrors(errors)) rowErrors[i] = errors;
    else {
      const record = { id: generateId('exp'), ...clean, maintenanceRecordId: null, createdAt: t, updatedAt: t };
      pending.push(record);
      toCreate.push(record);
    }
  });
  if (Object.keys(rowErrors).length) return { ...fail({ rows: rowErrors }, 'Some salary rows need attention. Nothing was saved.'), rowErrors };
  if (!toCreate.length) return fail({}, 'Enter at least one salary amount.');
  writeCollection('expenses', [...ctx.expenses, ...toCreate]);
  return { ok: true, records: toCreate };
}

export function filterExpenses(expenses, { busId, category, group, paymentStatus, range, search } = {}) {
  const q = (search || '').trim().toLowerCase();
  return expenses.filter((e) => {
    if (busId && e.busId !== busId) return false;
    if (category && e.category !== category) return false;
    if (group && categoryMeta(e.category)?.group !== group) return false;
    if (paymentStatus && e.paymentStatus !== paymentStatus) return false;
    if (!inRange(e.expenseDate, range)) return false;
    if (q) {
      const hay = `${e.description} ${e.recipient} ${e.receiptReference} ${e.staffName} ${e.notes}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export { EXPENSE_CATEGORIES };
