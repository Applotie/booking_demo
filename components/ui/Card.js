export default function Card({ title, description, actions, children, className = '', bodyClassName = '', as: Tag = 'section' }) {
  return (
    <Tag className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {title || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title ? <h2 className="text-base font-semibold text-ink">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={bodyClassName || 'p-4 sm:p-5'}>{children}</div>
    </Tag>
  );
}
