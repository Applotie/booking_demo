'use client';

import { useState, useEffect } from 'react';
import { Info } from 'lucide-react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { Input, Select, Textarea, FormError } from './ui/Field';
import { Alert } from './ui/Misc';
import { useToast } from './ui/Toast';
import { createMaintenance, updateMaintenance, defaultCategoryFor } from '@/lib/maintenance-service';
import { SERVICE_TYPES, MAINTENANCE_EXPENSE_CATEGORIES, EXPENSE_PAYMENT_STATUSES, PAYMENT_METHODS, categoryLabel } from '@/lib/constants';
import { todayKey } from '@/lib/dates';
import { formatKm } from '@/lib/formatters';

function blank(bus) {
  return {
    busId: bus?.id || '',
    serviceDate: todayKey(),
    odometer: bus ? String(bus.odometer || '') : '',
    serviceType: 'Routine service',
    workPerformed: '',
    provider: '',
    cost: '',
    expenseCategory: 'routine_servicing',
    paymentStatus: 'Paid',
    paymentMethod: 'Cash',
    receiptReference: '',
    nextServiceDate: '',
    nextServiceOdometer: '',
    notes: '',
  };
}

export default function MaintenanceForm({ open, record, defaultBusId, data, onClose }) {
  const [form, setForm] = useState(blank());
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setMessage('');
    if (record) {
      const linked = data.expenses.find((e) => e.id === record.expenseId);
      setForm({
        ...blank(),
        ...record,
        odometer: String(record.odometer ?? ''),
        cost: record.cost ? String(record.cost) : '',
        nextServiceOdometer: record.nextServiceOdometer != null ? String(record.nextServiceOdometer) : '',
        paymentStatus: linked?.paymentStatus || record.paymentStatus || 'Paid',
        paymentMethod: linked?.paymentMethod ?? record.paymentMethod ?? '',
      });
    } else {
      setForm(blank(data.buses.find((b) => b.id === defaultBusId)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record, defaultBusId]);

  const bus = data.buses.find((b) => b.id === form.busId);
  const set = (field) => (e) =>
    setForm((f) => {
      const next = { ...f, [field]: e.target.value };
      if (field === 'serviceType') next.expenseCategory = defaultCategoryFor(e.target.value);
      if (field === 'busId' && !record) {
        const b = data.buses.find((x) => x.id === e.target.value);
        next.odometer = b ? String(b.odometer || '') : '';
      }
      return next;
    });

  const submit = (e) => {
    e.preventDefault();
    const result = record ? updateMaintenance(record.id, form) : createMaintenance(form);
    if (!result.ok) {
      setErrors(result.errors || {});
      setMessage(result.message);
      return;
    }
    toast.success(
      result.record.cost > 0
        ? `Maintenance ${record ? 'updated' : 'recorded'}. Linked expense ${record?.expenseId ? 'updated' : 'saved'}.`
        : `Maintenance ${record ? 'updated' : 'recorded'}.`
    );
    onClose(result.record);
  };

  const hasCost = Number(form.cost) > 0;

  return (
    <Modal
      open={open}
      onClose={() => onClose(null)}
      title={record ? 'Edit maintenance record' : 'Record maintenance'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => onClose(null)}>
            Cancel
          </Button>
          <Button type="submit" form="maintenance-form">
            {record ? 'Save changes' : 'Save record'}
          </Button>
        </>
      }
    >
      <form id="maintenance-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={message} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            label="Bus"
            required
            value={form.busId}
            onChange={set('busId')}
            placeholder="Select bus"
            options={data.buses.map((b) => ({ value: b.id, label: `${b.name} (${b.registrationNumber})` }))}
            error={errors.busId}
            className="sm:col-span-2"
          />
          <Input label="Service date" required type="date" max={todayKey()} value={form.serviceDate} onChange={set('serviceDate')} error={errors.serviceDate} />
          <Select label="Service type" required value={form.serviceType} onChange={set('serviceType')} options={SERVICE_TYPES.map((s) => s.value)} error={errors.serviceType} />
          <Input
            label="Odometer reading (km)"
            required
            type="number"
            inputMode="numeric"
            min="0"
            value={form.odometer}
            onChange={set('odometer')}
            error={errors.odometer}
            hint={bus ? `Bus currently at ${formatKm(bus.odometer)}. Higher readings update the bus.` : undefined}
          />
          <Input label="Garage / service provider" value={form.provider} onChange={set('provider')} />
        </div>
        <Textarea label="Work performed" required value={form.workPerformed} onChange={set('workPerformed')} error={errors.workPerformed} rows={2} />

        <div className="rounded-xl border border-slate-200 p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Service cost (₹)" type="number" inputMode="decimal" min="0" step="0.01" value={form.cost} onChange={set('cost')} error={errors.cost} hint="Leave blank if free (e.g. warranty)." />
            {hasCost ? (
              <>
                <Select
                  label="Expense category"
                  value={form.expenseCategory}
                  onChange={set('expenseCategory')}
                  options={MAINTENANCE_EXPENSE_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }))}
                />
                <Select label="Payment status" value={form.paymentStatus} onChange={set('paymentStatus')} options={EXPENSE_PAYMENT_STATUSES} error={errors.paymentStatus} />
                <Select label="Payment method" value={form.paymentMethod} onChange={set('paymentMethod')} options={PAYMENT_METHODS} placeholder="Not specified" />
                <Input label="Invoice / receipt ref." value={form.receiptReference} onChange={set('receiptReference')} />
              </>
            ) : null}
          </div>
          <Alert tone="info" icon={Info} className="mt-3">
            {hasCost
              ? record?.expenseId
                ? 'The linked expense will be updated with this cost — it is never counted twice.'
                : 'One linked expense will be created automatically. Edit the cost here, not on the Expenses page.'
              : record?.expenseId
                ? 'Removing the cost will delete the linked expense.'
                : 'No expense is created when there is no cost.'}
          </Alert>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Next service date" type="date" value={form.nextServiceDate} onChange={set('nextServiceDate')} error={errors.nextServiceDate} />
          <Input label="Next service at odometer (km)" type="number" inputMode="numeric" min="0" value={form.nextServiceOdometer} onChange={set('nextServiceOdometer')} error={errors.nextServiceOdometer} />
        </div>
        <Textarea label="Notes" value={form.notes} onChange={set('notes')} rows={2} />
      </form>
    </Modal>
  );
}
