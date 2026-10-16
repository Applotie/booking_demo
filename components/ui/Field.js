'use client';

import { useId } from 'react';

const base =
  'block rounded-lg border bg-white px-3 text-sm text-ink placeholder:text-slate-400 shadow-sm transition-colors focus:outline-none focus:ring-2 disabled:bg-slate-100 disabled:text-slate-500';
const ok = 'border-slate-300 focus:border-brand-500 focus:ring-brand-500/20';
const bad = 'border-red-400 focus:border-red-500 focus:ring-red-500/20';

export function inputClasses(error, extra = '') {
  // Full width unless the caller sets its own width (e.g. compact filter selects).
  const width = /(^|\s)(w-|min-w-)/.test(extra) ? '' : 'w-full';
  return `${base} ${width} ${error ? bad : ok} ${extra}`;
}

export function Field({ label, hint, error, required, children, className = '', htmlFor }) {
  return (
    <div className={className}>
      {label ? (
        <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-700">
          {label}
          {required ? <span className="ml-0.5 text-red-600" aria-hidden="true">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="mt-1 text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ label, hint, error, required, className = '', inputClassName = '', id, ...rest }) {
  const auto = useId();
  const fieldId = id || auto;
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className} htmlFor={fieldId}>
      <input
        id={fieldId}
        aria-invalid={error ? 'true' : undefined}
        required={required}
        className={inputClasses(error, `h-10 ${inputClassName}`)}
        {...rest}
      />
    </Field>
  );
}

export function Select({ label, hint, error, required, className = '', options = [], placeholder, id, children, ...rest }) {
  const auto = useId();
  const fieldId = id || auto;
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className} htmlFor={fieldId}>
      <select id={fieldId} aria-invalid={error ? 'true' : undefined} className={inputClasses(error, 'h-10 pr-8')} {...rest}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) =>
          typeof o === 'string' ? (
            <option key={o} value={o}>
              {o}
            </option>
          ) : (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          )
        )}
        {children}
      </select>
    </Field>
  );
}

export function Textarea({ label, hint, error, required, className = '', rows = 3, id, ...rest }) {
  const auto = useId();
  const fieldId = id || auto;
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className} htmlFor={fieldId}>
      <textarea id={fieldId} rows={rows} aria-invalid={error ? 'true' : undefined} className={inputClasses(error, 'py-2')} {...rest} />
    </Field>
  );
}

export function Checkbox({ label, description, className = '', id, ...rest }) {
  const auto = useId();
  const fieldId = id || auto;
  return (
    <div className={`flex items-start gap-2.5 ${className}`}>
      <input id={fieldId} type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-brand-600" {...rest} />
      <label htmlFor={fieldId} className="text-sm text-slate-700">
        <span className="font-medium">{label}</span>
        {description ? <span className="block text-xs text-slate-500">{description}</span> : null}
      </label>
    </div>
  );
}

export function FormError({ message }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
      {message}
    </div>
  );
}
