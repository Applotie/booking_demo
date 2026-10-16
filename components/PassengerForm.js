'use client';

import { Input, Select } from './ui/Field';

/**
 * Collects one name/age per seat plus one main contact number.
 * value = { passengers: { [seatId]: { name, age, gender } }, contactName, contactNumber }
 */
export default function PassengerForm({ seatIds, value, onChange, errors = {} }) {
  const setPassenger = (seatId, field, v) =>
    onChange({ ...value, passengers: { ...value.passengers, [seatId]: { ...(value.passengers[seatId] || {}), [field]: v } } });

  return (
    <div className="space-y-5">
      <fieldset className="space-y-3">
        <legend className="mb-2 text-base font-semibold">Passenger details</legend>
        {seatIds.map((seatId, i) => {
          const p = value.passengers[seatId] || {};
          const e = errors.passengers?.[seatId] || {};
          return (
            <div key={seatId} className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <span className="rounded-md bg-brand-600 px-2 py-0.5 text-xs text-white">Seat {seatId}</span>
                Passenger {i + 1}
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_100px_140px]">
                <Input label="Full name" required autoComplete={i === 0 ? 'name' : 'off'} value={p.name || ''} onChange={(ev) => setPassenger(seatId, 'name', ev.target.value)} error={e.name} />
                <Input label="Age" required type="number" inputMode="numeric" min="1" max="120" value={p.age || ''} onChange={(ev) => setPassenger(seatId, 'age', ev.target.value)} error={e.age} />
                <Select
                  label="Gender"
                  value={p.gender || ''}
                  onChange={(ev) => setPassenger(seatId, 'gender', ev.target.value)}
                  options={['Male', 'Female', 'Other']}
                  placeholder="Prefer not to say"
                />
              </div>
            </div>
          );
        })}
      </fieldset>

      <fieldset className="rounded-xl border border-slate-200 p-4">
        <legend className="px-1 text-base font-semibold">Contact details</legend>
        <p className="mb-3 text-xs text-slate-500">The operator will use this number to contact you. Your booking confirmation is prepared for WhatsApp on this number.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Mobile number"
            required
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="98765 43210"
            value={value.contactNumber}
            onChange={(ev) => onChange({ ...value, contactNumber: ev.target.value })}
            error={errors.contactNumber}
            hint="10-digit Indian mobile number. +91 is optional."
          />
          <Input label="Contact name (optional)" value={value.contactName} onChange={(ev) => onChange({ ...value, contactName: ev.target.value })} error={errors.contactName} />
        </div>
      </fieldset>
    </div>
  );
}
