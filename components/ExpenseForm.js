'use client';

import { useState, useEffect, useMemo } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { Input, Select, Textarea, Checkbox, FormError, Field, inputClasses } from './ui/Field';
import { useToast } from './ui/Toast';
import { createExpense, updateExpense, isSalaryCategory } from '@/lib/expense-service';
import { getBusStaff } from '@/lib/bus-service';
import { EXPENSE_CATEGORIES, EXPENSE_GROUPS, EXPENSE_PAYMENT_STATUSES, PAYMENT_METHODS, categoryMeta } from '@/lib/constants';
import { todayKey, monthKey } from '@/lib/dates';

function blank(busId) {
  return {
    busId: busId || '',
    category: '',
    description: '',
    amount: '',
    expenseDate: todayKey(),
    paymentStatus: 'Paid',
    paymentMethod: 'Cash',
    recipient: '',
    receiptReference: '',
    notes: '',
    staffName: '',
    staffRole: '',
    salaryPeriod: monthKey(),
    isAdjustment: false,
  };
}

export default function ExpenseForm({ open, expense, defaultBusId, data, onClose }) {
  const [form, setForm] = useState(blank(defaultBusId));
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setMessage('');
    setForm(expense ? { ...blank(), ...expense, amount: String(expense.amount), salaryPeriod: expense.salaryPeriod || monthKey() } : blank(defaultBusId));
  }, [open, expense, defaultBusId]);

  const bus = data.buses.find((b) => b.id === form.busId);
  const salary = isSalaryCategory(form.category);
  const staffSuggestions = useMemo(() => {
    const names = new Map();
    getBusStaff(bus).forEach((s) => names.set(s.name, s.role));
    (bus?.staffHistory || []).forEach((s) => names.has(s.name) || names.set(s.name, s.role));
    data.expenses.filter((e) => e.busId === form.busId && e.staffName).forEach((e) => names.has(e.staffName) || names.set(e.staffName, e.staffRole));
    return [...names.entries()].map(([name, role]) => ({ name, role }));
  }, [bus, data.expenses, form.busId]);

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (field === 'category' && isSalaryCategory(value)) {
        next.staffRole = categoryMeta(value).staffRole;
        const match = getBusStaff(bus).find((s) => s.category === value);
        if (match && !f.staffName) next.staffName = match.name;
      }
      if (field === 'staffName') {
        const s = staffSuggestions.find((x) => x.name.toLowerCase() === String(value).toLowerCase());
        if (s && f.category === 'staff_salary') next.staffRole = s.role;
      }
      return next;
    });
  };

  const submit = (e) => {
    e.preventDefault();
    const result = expense ? updateExpense(expense.id, form) : createExpense(form);
    if (!result.ok) {
      setErrors(result.errors || {});
      setMessage(result.message);
      return;
    }
    toast.success(expense ? 'Expense updated.' : 'Expense recorded.');
    onClose(result.record);
  };

  return (
    <Modal
      open={open}
      onClose={() => onClose(null)}
      title={expense ? 'Edit expense' : 'Record expense'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => onClose(null)}>
            Cancel
          </Button>
          <Button type="submit" form="expense-form">
            {expense ? 'Save changes' : 'Save expense'}
          </Button>
        </>
      }
    >
      <form id="expense-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={message} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Bus"
            required
            value={form.busId}
            onChange={set('busId')}
            placeholder="Select bus"
            options={data.buses.map((b) => ({ value: b.id, label: `${b.name} (${b.registrationNumber})${b.operationalStatus === 'Inactive' ? ' – inactive' : ''}` }))}
            error={errors.busId}
          />
          <Field label="Category" required error={errors.category} htmlFor="exp-category">
            <select id="exp-category" value={form.category} onChange={set('category')} className={inputClasses(errors.category, 'h-10')} aria-invalid={errors.category ? 'true' : undefined}>
              <option value="">Select category</option>
              {Object.entries(EXPENSE_GROUPS).map(([group, label]) => (
                <optgroup key={group} label={label}>
                  {EXPENSE_CATEGORIES.filter((c) => c.group === group).map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
        </div>

        {salary ? (
          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Input label="Staff name" required list="staff-suggestions" value={form.staffName} onChange={set('staffName')} error={errors.staffName} />
              <Input label="Role" value={form.staffRole} onChange={set('staffRole')} />
              <Input label="Salary month" required type="month" value={form.salaryPeriod} onChange={set('salaryPeriod')} error={errors.salaryPeriod} />
            </div>
            <datalist id="staff-suggestions">
              {staffSuggestions.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.role}
                </option>
              ))}
            </datalist>
            <Checkbox
              label="This is a correction or adjustment"
              description="Allows a second salary record for the same person and month (e.g. bonus or deduction correction)."
              checked={form.isAdjustment}
              onChange={set('isAdjustment')}
            />
          </div>
        ) : null}

        <Input
          label="Description"
          required={!salary}
          value={form.description}
          onChange={set('description')}
          error={errors.description}
          placeholder={salary ? 'Optional – generated from staff and month' : 'e.g. Diesel refill at HP Wakad'}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Amount (₹)" required type="number" inputMode="decimal" min="0" step="0.01" value={form.amount} onChange={set('amount')} error={errors.amount} />
          <Input label={salary ? 'Payment / due date' : 'Expense date'} required type="date" value={form.expenseDate} onChange={set('expenseDate')} error={errors.expenseDate} />
          <Select label="Payment status" required value={form.paymentStatus} onChange={set('paymentStatus')} options={EXPENSE_PAYMENT_STATUSES} error={errors.paymentStatus} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Payment method" value={form.paymentMethod} onChange={set('paymentMethod')} options={PAYMENT_METHODS} placeholder="Not specified" error={errors.paymentMethod} />
          <Input label="Vendor / recipient" value={form.recipient} onChange={set('recipient')} />
          <Input label="Receipt / invoice ref." value={form.receiptReference} onChange={set('receiptReference')} />
        </div>
        <Textarea label="Notes" value={form.notes} onChange={set('notes')} rows={2} />
      </form>
    </Modal>
  );
}
