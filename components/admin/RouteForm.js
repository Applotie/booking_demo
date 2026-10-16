'use client';

import { useState, useEffect } from 'react';
import { Plus, ArrowUp, ArrowDown, Trash2, MapPin } from 'lucide-react';
import Modal from '../ui/Modal';
import Button, { IconButton } from '../ui/Button';
import { Input, Textarea, Checkbox, FormError, inputClasses } from '../ui/Field';
import { createRoute, updateRoute } from '@/lib/route-service';
import { useToast } from '../ui/Toast';

const EMPTY = { name: '', source: '', destination: '', stops: [], defaultFare: '', durationHours: '', durationMinutes: '0', description: '', isActive: true };

function fromRoute(route) {
  if (!route) return EMPTY;
  return {
    name: route.name,
    source: route.source,
    destination: route.destination,
    stops: [...(route.stops || [])],
    defaultFare: String(route.defaultFare),
    durationHours: String(Math.floor(route.duration / 60)),
    durationMinutes: String(route.duration % 60),
    description: route.description || '',
    isActive: route.isActive,
  };
}

export default function RouteForm({ open, route, onClose }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const toast = useToast();

  useEffect(() => {
    if (open) {
      setForm(fromRoute(route));
      setErrors({});
      setMessage('');
    }
  }, [open, route]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const setStop = (i, value) => setForm((f) => ({ ...f, stops: f.stops.map((s, j) => (j === i ? value : s)) }));
  const moveStop = (i, dir) =>
    setForm((f) => {
      const stops = [...f.stops];
      const j = i + dir;
      if (j < 0 || j >= stops.length) return f;
      [stops[i], stops[j]] = [stops[j], stops[i]];
      return { ...f, stops };
    });
  const removeStop = (i) => setForm((f) => ({ ...f, stops: f.stops.filter((_, j) => j !== i) }));

  const submit = (e) => {
    e.preventDefault();
    const result = route ? updateRoute(route.id, form) : createRoute(form);
    if (!result.ok) {
      setErrors(result.errors || {});
      setMessage(result.message);
      return;
    }
    toast.success(route ? 'Route updated.' : 'Route created.');
    onClose(result.record);
  };

  return (
    <Modal
      open={open}
      onClose={() => onClose(null)}
      title={route ? 'Edit route' : 'New route'}
      description="A route is the journey path. Trips are scheduled departures on a route."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => onClose(null)}>
            Cancel
          </Button>
          <Button type="submit" form="route-form">
            {route ? 'Save changes' : 'Create route'}
          </Button>
        </>
      }
    >
      <form id="route-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={Object.keys(errors).length ? message : ''} />
        <Input label="Route name" required value={form.name} onChange={set('name')} error={errors.name} placeholder="e.g. Pune – Mumbai Express" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Source city / stop" required value={form.source} onChange={set('source')} error={errors.source} placeholder="Pune" />
          <Input label="Destination city / stop" required value={form.destination} onChange={set('destination')} error={errors.destination} placeholder="Mumbai" />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Intermediate stops</span>
            <Button size="xs" variant="secondary" icon={Plus} onClick={() => setForm((f) => ({ ...f, stops: [...f.stops, ''] }))}>
              Add stop
            </Button>
          </div>
          {form.stops.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500">No intermediate stops. The route runs directly from source to destination.</p>
          ) : (
            <ol className="space-y-2">
              {form.stops.map((stop, i) => (
                <li key={i}>
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{i + 1}</span>
                    <input
                      aria-label={`Stop ${i + 1}`}
                      value={stop}
                      onChange={(e) => setStop(i, e.target.value)}
                      className={inputClasses(errors.stops?.[i], 'h-9')}
                      placeholder="Stop name"
                    />
                    <IconButton icon={ArrowUp} label="Move up" onClick={() => moveStop(i, -1)} disabled={i === 0} />
                    <IconButton icon={ArrowDown} label="Move down" onClick={() => moveStop(i, 1)} disabled={i === form.stops.length - 1} />
                    <IconButton icon={Trash2} label="Remove stop" variant="danger-ghost" onClick={() => removeStop(i)} />
                  </div>
                  {errors.stops?.[i] ? <p className="ml-9 mt-1 text-xs font-medium text-red-600">{errors.stops[i]}</p> : null}
                </li>
              ))}
            </ol>
          )}
          {form.source || form.destination ? (
            <p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-slate-500">
              <MapPin size={12} aria-hidden="true" />
              {[form.source || '?', ...form.stops.filter(Boolean), form.destination || '?'].join(' → ')}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Default fare (₹)"
            required
            type="number"
            inputMode="decimal"
            min="1"
            step="0.01"
            value={form.defaultFare}
            onChange={set('defaultFare')}
            error={errors.defaultFare}
            hint="Per seat. Trips can override it."
          />
          <Input label="Duration – hours" required type="number" inputMode="numeric" min="0" max="72" value={form.durationHours} onChange={set('durationHours')} error={errors.duration} />
          <Input label="Duration – minutes" type="number" inputMode="numeric" min="0" max="59" value={form.durationMinutes} onChange={set('durationMinutes')} />
        </div>
        <Textarea label="Description" value={form.description} onChange={set('description')} placeholder="Optional notes shown to the operator" />
        <Checkbox label="Route is active" description="Inactive routes cannot be used for new trips. Existing trips are not affected." checked={form.isActive} onChange={set('isActive')} />
        {route ? <p className="text-xs text-slate-500">Changing the default fare does not change fares on trips that are already scheduled.</p> : null}
      </form>
    </Modal>
  );
}
