'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CircleCheck, CircleAlert, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const STYLES = {
  success: { cls: 'border-emerald-200 bg-white', icon: CircleCheck, iconCls: 'text-emerald-600' },
  error: { cls: 'border-red-200 bg-white', icon: CircleAlert, iconCls: 'text-red-600' },
  info: { cls: 'border-sky-200 bg-white', icon: Info, iconCls: 'text-sky-600' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (type, message) => {
      if (!message) return;
      const id = ++counter.current;
      setToasts((list) => [...list.slice(-3), { id, type, message }]);
      setTimeout(() => dismiss(id), type === 'error' ? 7000 : 4000);
    },
    [dismiss]
  );

  const api = useMemo(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6" aria-live="polite">
        {toasts.map((t) => {
          const s = STYLES[t.type] || STYLES.info;
          const Icon = s.icon;
          return (
            <div key={t.id} className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ${s.cls}`} role={t.type === 'error' ? 'alert' : 'status'}>
              <Icon size={18} className={`mt-0.5 shrink-0 ${s.iconCls}`} aria-hidden="true" />
              <p className="flex-1 text-sm text-ink">{t.message}</p>
              <button type="button" onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-ink" aria-label="Dismiss">
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
