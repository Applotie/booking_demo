import Link from 'next/link';

const VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm disabled:bg-brand-300',
  dark: 'bg-ink text-white hover:bg-slate-800 shadow-sm disabled:bg-slate-400',
  secondary: 'bg-white text-ink border border-slate-300 hover:bg-slate-50 hover:border-slate-400 shadow-sm disabled:text-slate-400',
  ghost: 'text-slate-700 hover:bg-slate-100 disabled:text-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm disabled:bg-red-300',
  'danger-ghost': 'text-red-700 hover:bg-red-50 disabled:text-red-300',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm disabled:bg-emerald-300',
};

const SIZES = {
  xs: 'h-7 px-2 text-xs gap-1',
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

export function buttonClasses({ variant = 'primary', size = 'md', block = false, className = '' } = {}) {
  return [
    'inline-flex items-center justify-center rounded-lg font-medium transition-colors whitespace-nowrap disabled:cursor-not-allowed',
    VARIANTS[variant] || VARIANTS.primary,
    SIZES[size] || SIZES.md,
    block ? 'w-full' : '',
    className,
  ].join(' ');
}

export default function Button({ variant, size, block, className, icon: Icon, href, children, type = 'button', ...rest }) {
  const cls = buttonClasses({ variant, size, block, className });
  const iconSize = size === 'xs' ? 14 : size === 'lg' ? 18 : 16;
  const content = (
    <>
      {Icon ? <Icon size={iconSize} aria-hidden="true" className="shrink-0" /> : null}
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls} {...rest}>
        {content}
      </Link>
    );
  }
  return (
    <button type={type} className={cls} {...rest}>
      {content}
    </button>
  );
}

export function IconButton({ icon: Icon, label, variant = 'ghost', size = 'sm', className = '', ...rest }) {
  const dims = size === 'xs' ? 'h-7 w-7' : 'h-8 w-8';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`${buttonClasses({ variant, size, className })} ${dims} !px-0`}
      {...rest}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}
