'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Info } from 'lucide-react';
import Modal from '../ui/Modal';
import Button, { IconButton } from '../ui/Button';
import { Input, Select, Textarea, FormError, inputClasses } from '../ui/Field';
import { Alert } from '../ui/Misc';
import SeatLayoutEditor from '../SeatLayoutEditor';
import { useToast } from '../ui/Toast';
import { createBus, updateBus } from '@/lib/bus-service';
import { generateId } from '@/lib/storage';
import { BUS_TYPES, BUS_STATUSES, DOCUMENT_FIELDS } from '@/lib/constants';

const EMPTY = {
  name: '',
  registrationNumber: '',
  type: '',
  operationalStatus: 'Active',
  purchaseDate: '',
  odometer: '',
  layout: { capacity: 20, leftSeats: 2, rightSeats: 1, blockedSeatIds: [] },
  driver: { name: '', phone: '' },
  conductor: { name: '', phone: '' },
  staff: [],
  documents: Object.fromEntries(DOCUMENT_FIELDS.map((d) => [d.key, ''])),
  notes: '',
};

function fromBus(bus) {
  if (!bus) return EMPTY;
  return {
    name: bus.name,
    registrationNumber: bus.registrationNumber,
    type: bus.type,
    operationalStatus: bus.operationalStatus,
    purchaseDate: bus.purchaseDate || '',
    odometer: bus.odometer != null ? String(bus.odometer) : '',
    layout: {
      capacity: bus.seatLayout?.capacity ?? 20,
      leftSeats: bus.seatLayout?.leftSeats ?? 2,
      rightSeats: bus.seatLayout?.rightSeats ?? 1,
      blockedSeatIds: [...(bus.seatLayout?.blockedSeatIds || [])],
    },
    driver: { name: bus.driver?.name || '', phone: bus.driver?.phone || '' },
    conductor: { name: bus.conductor?.name || '', phone: bus.conductor?.phone || '' },
    staff: (bus.staff || []).map((s) => ({ ...s })),
    documents: { ...EMPTY.documents, ...(bus.documents || {}) },
    notes: bus.notes || '',
  };
}

function Section({ title, description, children }) {
  return (
    <fieldset className="space-y-4 rounded-xl border border-slate-200 p-4">
      <legend className="px-1 text-sm font-semibold text-ink">{title}</legend>
      {description ? <p className="-mt-2 text-xs text-slate-500">{description}</p> : null}
      {children}
    </fieldset>
  );
}

export default function BusForm({ open, bus, onClose, tripCount = 0 }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const toast = useToast();

  useEffect(() => {
    if (open) {
      setForm(fromBus(bus));
      setErrors({});
      setMessage('');
    }
  }, [open, bus]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const setPerson = (who, field) => (e) => setForm((f) => ({ ...f, [who]: { ...f[who], [field]: e.target.value } }));
  const setDoc = (key) => (e) => setForm((f) => ({ ...f, documents: { ...f.documents, [key]: e.target.value } }));
  const setStaff = (i, field, value) => setForm((f) => ({ ...f, staff: f.staff.map((s, j) => (j === i ? { ...s, [field]: value } : s)) }));

  const submit = (e) => {
    e.preventDefault();
    const result = bus ? updateBus(bus.id, form) : createBus(form);
    if (!result.ok) {
      setErrors(result.errors || {});
      setMessage(result.message);
      return;
    }
    toast.success(bus ? (result.layoutChanged && tripCount ? 'Bus updated. Existing trips keep their saved seat layout.' : 'Bus updated.') : 'Bus added.');
    onClose(result.record);
  };

  return (
    <Modal
      open={open}
      onClose={() => onClose(null)}
      title={bus ? `Edit ${bus.name}` : 'Add bus'}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={() => onClose(null)}>
            Cancel
          </Button>
          <Button type="submit" form="bus-form">
            {bus ? 'Save changes' : 'Add bus'}
          </Button>
        </>
      }
    >
      <form id="bus-form" onSubmit={submit} className="space-y-5" noValidate>
        <FormError message={Object.keys(errors).length ? message : ''} />

        <Section title="Bus details">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Input label="Bus name" required value={form.name} onChange={set('name')} error={errors.name} placeholder="e.g. Shivneri 01" />
            <Input
              label="Registration number"
              required
              value={form.registrationNumber}
              onChange={set('registrationNumber')}
              error={errors.registrationNumber}
              placeholder="MH 12 AB 1234"
              autoCapitalize="characters"
            />
            <Select label="Bus type" required value={form.type} onChange={set('type')} options={BUS_TYPES} placeholder="Select type" error={errors.type} />
            <Select label="Operational status" value={form.operationalStatus} onChange={set('operationalStatus')} options={BUS_STATUSES} />
            <Input label="Purchase date" type="date" value={form.purchaseDate} onChange={set('purchaseDate')} error={errors.purchaseDate} />
            <Input label="Current odometer (km)" type="number" inputMode="numeric" min="0" value={form.odometer} onChange={set('odometer')} error={errors.odometer} />
          </div>
        </Section>

        <Section title="Seating layout" description="Configure capacity and arrangement. The preview shows exactly what passengers will see.">
          {bus && tripCount ? (
            <Alert tone="info" icon={Info}>
              This bus has {tripCount} trip(s). Each trip keeps the layout saved when it was scheduled, so changes here only apply to new trips. You can
              apply the new layout to a trip without bookings from the Trips page.
            </Alert>
          ) : null}
          <SeatLayoutEditor value={form.layout} onChange={(layout) => setForm((f) => ({ ...f, layout }))} errors={errors.layout || {}} />
        </Section>

        <Section title="Staff assignment" description="Changing staff keeps a history and never alters past salary records.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Driver name" value={form.driver.name} onChange={setPerson('driver', 'name')} error={errors.driver?.name} />
            <Input label="Driver phone" type="tel" inputMode="tel" value={form.driver.phone} onChange={setPerson('driver', 'phone')} error={errors.driver?.phone} placeholder="98765 43210" />
            <Input label="Conductor / helper name" value={form.conductor.name} onChange={setPerson('conductor', 'name')} error={errors.conductor?.name} />
            <Input
              label="Conductor / helper phone"
              type="tel"
              inputMode="tel"
              value={form.conductor.phone}
              onChange={setPerson('conductor', 'phone')}
              error={errors.conductor?.phone}
            />
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Other staff</span>
              <Button size="xs" variant="secondary" icon={Plus} onClick={() => setForm((f) => ({ ...f, staff: [...f.staff, { id: generateId('stf'), name: '', role: '', phone: '' }] }))}>
                Add staff
              </Button>
            </div>
            {form.staff.length === 0 ? <p className="text-xs text-slate-500">No other staff assigned.</p> : null}
            <div className="space-y-2">
              {form.staff.map((s, i) => (
                <div key={s.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <div>
                    <input aria-label="Staff name" placeholder="Name" value={s.name} onChange={(e) => setStaff(i, 'name', e.target.value)} className={inputClasses(errors.staff?.[i]?.name, 'h-9')} />
                    {errors.staff?.[i]?.name ? <p className="mt-1 text-xs text-red-600">{errors.staff[i].name}</p> : null}
                  </div>
                  <div>
                    <input aria-label="Staff role" placeholder="Role (e.g. Cleaner)" value={s.role} onChange={(e) => setStaff(i, 'role', e.target.value)} className={inputClasses(errors.staff?.[i]?.role, 'h-9')} />
                    {errors.staff?.[i]?.role ? <p className="mt-1 text-xs text-red-600">{errors.staff[i].role}</p> : null}
                  </div>
                  <div className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
                    <input aria-label="Staff phone" placeholder="Phone (optional)" value={s.phone} onChange={(e) => setStaff(i, 'phone', e.target.value)} className={inputClasses(errors.staff?.[i]?.phone, 'h-9')} />
                    {errors.staff?.[i]?.phone ? <p className="mt-1 text-xs text-red-600">{errors.staff[i].phone}</p> : null}
                  </div>
                  <IconButton icon={Trash2} label="Remove staff" variant="danger-ghost" onClick={() => setForm((f) => ({ ...f, staff: f.staff.filter((_, j) => j !== i) }))} />
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Documents & compliance" description="Expiry dates drive the reminders on the dashboard and maintenance pages.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {DOCUMENT_FIELDS.map((d) => (
              <Input key={d.key} label={`${d.label} expiry`} type="date" value={form.documents[d.key]} onChange={setDoc(d.key)} error={errors.documents?.[d.key]} />
            ))}
          </div>
        </Section>

        <Textarea label="Notes" value={form.notes} onChange={set('notes')} />
      </form>
    </Modal>
  );
}
