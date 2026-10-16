// Small presentational building blocks shared across pages.

export function PageHeader({ title, description, actions, eyebrow }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-700">{eyebrow}</div> : null}
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center ${className}`}>
      {Icon ? (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <Icon size={22} aria-hidden="true" />
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-sm text-slate-600">{description}</p> : null}
      {action ? <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

const STAT_TONES = {
  neutral: 'text-ink',
  success: 'text-emerald-700',
  danger: 'text-red-700',
  warning: 'text-amber-700',
  brand: 'text-brand-700',
};

export function StatCard({ label, value, hint, icon: Icon, tone = 'neutral', href }) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
        {Icon ? <Icon size={16} className="shrink-0 text-slate-400" aria-hidden="true" /> : null}
      </div>
      <div className={`mt-2 text-2xl font-semibold tabular ${STAT_TONES[tone] || STAT_TONES.neutral}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </>
  );
  const cls = 'block rounded-xl border border-slate-200 bg-white p-4 shadow-sm';
  if (href) {
    return (
      <a href={href} className={`${cls} transition-colors hover:border-slate-300 hover:bg-slate-50`}>
        {inner}
      </a>
    );
  }
  return <div className={cls}>{inner}</div>;
}

export function Tabs({ tabs, active, onChange, className = '' }) {
  return (
    <div className={`-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 ${className}`}>
      <div role="tablist" className="flex min-w-max gap-1 border-b border-slate-200">
        {tabs.map((t) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => onChange(t.id)}
              className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                selected ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-ink'
              }`}
            >
              {t.label}
              {t.count != null ? <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{t.count}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label={label}>
      <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-200/70" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-slate-200/70" />
    </div>
  );
}

export function Alert({ tone = 'info', title, children, icon: Icon, className = '', action }) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-red-200 bg-red-50 text-red-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    neutral: 'border-slate-200 bg-slate-50 text-slate-800',
  };
  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${tones[tone]} ${className}`} role={tone === 'danger' ? 'alert' : undefined}>
      {Icon ? <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" /> : null}
      <div className="min-w-0 flex-1">
        {title ? <div className="font-semibold">{title}</div> : null}
        {children ? <div className={title ? 'mt-0.5' : ''}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}

export function KeyValue({ items, columns = 2 }) {
  const grid = columns === 3 ? 'sm:grid-cols-3' : columns === 1 ? '' : 'sm:grid-cols-2';
  return (
    <dl className={`grid grid-cols-1 gap-x-6 gap-y-3 ${grid}`}>
      {items.filter(Boolean).map(({ label, value }) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink">{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
