'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from './ui/Modal';
import Button, { IconButton } from './ui/Button';
import { Input, Select, FormError, inputClasses } from './ui/Field';
import { useToast } from './ui/Toast';
import { createMonthlySalaries, findDuplicateSalary } from '@/lib/expense-service';
import { getBusStaff } from '@/lib/bus-service';
import { EXPENSE_PAYMENT_STATUSES, PAYMENT_METHODS, SALARY_CATEGORIES, categoryLabel } from '@/lib/constants';
import { todayKey, monthKey } from '@/lib/dates';
import { formatINR, formatMonth } from '@/lib/formatters';

// Convenient monthly salary entry for all staff assigned to one bus.
export default function SalaryBatchForm({ open, defaultBusId, data, onClose }) {
  const [busId, setBusId] = useState('');
  const [period, setPeriod] = useState(monthKey());
  const [date, setDate] = useState(todayKey());
  const [status, setStatus] = useState('Paid');
  const [method, setMethod] = useState('Bank transfer');
  const [rows, setRows] = useState([]);
  const [rowErrors, setRowErrors] = useState({});
  const [message, setMessage] = useState('');
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setBusId(defaultBusId || data.buses.find((b) => b.operationalStatus !== 'Inactive')?.id || '');
    setPeriod(monthKey());
    setDate(todayKey());
    setMessage('');
    setRowErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultBusId]);

  // Keyed on the staff list itself so unrelated data refreshes don't wipe typed amounts.
  const staffSig = JSON.stringify(getBusStaff(data.buses.find((b) => b.id === busId)));
  useEffect(() => {
    if (!open) return;
    setRows(JSON.parse(staffSig).map((s) => ({ staffName: s.name, staffRole: s.role, category: s.category, amount: '' })));
    setRowErrors({});
  }, [staffSig, open]);

  const setRow = (i, field, value) => setRows((r) => r.map((row, j) => (j === i ? { ...row, [field]: value } : row)));

  const submit = (e) => {
    e.preventDefault();
    const res = createMonthlySalaries({ busId, salaryPeriod: period, expenseDate: date, paymentStatus: status, paymentMethod: method, entries: rows });
    if (!res.ok) {
      setRowErrors(res.rowErrors || {});
      setMessage(res.message);
      return;
    }
    toast.success(`${res.records.length} salary record(s) saved for ${formatMonth(period)}.`);
    onClose(true);
  };

  return (
    <Modal
      open={open}
      onClose={() => onClose(false)}
      title="Monthly salaries"
      description="Record a month's salary for every staff member on a bus. Leave an amount blank to skip that person."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => onClose(false)}>
            Cancel
          </Button>
          <Button type="submit" form="salary-form">
            Save salaries
          </Button>
        </>
      }
    >
      <form id="salary-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={message} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Bus" required value={busId} onChange={(e) => setBusId(e.target.value)} options={data.buses.map((b) => ({ value: b.id, label: `${b.name} (${b.registrationNumber})` }))} placeholder="Select bus" />
          <Input label="Salary month" required type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          <Input label="Payment / due date" required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={EXPENSE_PAYMENT_STATUSES} />
            <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value)} options={PAYMENT_METHODS} />
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Staff</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Amount (₹)</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                    No staff assigned to this bus. Add a row below or assign staff on the bus.
                  </td>
                </tr>
              ) : null}
              {rows.map((row, i) => {
                const existing = row.staffName ? findDuplicateSalary(data.expenses, { staffName: row.staffName, salaryPeriod: period }) : null;
                const err = rowErrors[i] || {};
                return (
                  <tr key={i} className="align-top">
                    <td className="px-3 py-2">
                      <input aria-label="Staff name" value={row.staffName} onChange={(e) => setRow(i, 'staffName', e.target.value)} className={inputClasses(err.staffName, 'h-9 min-w-36')} />
                      {err.staffName ? <p className="mt-1 max-w-64 text-xs text-red-600">{err.staffName}</p> : null}
                      {existing && !err.staffName ? <p className="mt-1 text-xs text-amber-700">Already recorded: {formatINR(existing.amount)}</p> : null}
                    </td>
                    <td className="px-3 py-2">
                      <select aria-label="Category" value={row.category} onChange={(e) => setRow(i, 'category', e.target.value)} className={inputClasses(false, 'h-9 w-auto')}>
                        {SALARY_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {categoryLabel(c)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        aria-label={`Amount for ${row.staffName || 'staff'}`}
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={row.amount}
                        disabled={Boolean(existing)}
                        placeholder={existing ? 'Recorded' : ''}
                        onChange={(e) => setRow(i, 'amount', e.target.value)}
                        className={inputClasses(err.amount, 'h-9 w-32')}
                      />
                      {err.amount ? <p className="mt-1 text-xs text-red-600">{err.amount}</p> : null}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <IconButton icon={Trash2} label="Remove row" variant="danger-ghost" onClick={() => setRows((r) => r.filter((_, j) => j !== i))} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Button size="sm" variant="secondary" icon={Plus} onClick={() => setRows((r) => [...r, { staffName: '', staffRole: 'Other staff', category: 'staff_salary', amount: '' }])}>
          Add person
        </Button>
        <p className="text-xs text-slate-500">Existing salary records for the same person and month are skipped. To add a correction, use “Record expense” and tick the adjustment option.</p>
      </form>
    </Modal>
  );
}
