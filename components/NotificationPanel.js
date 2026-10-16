'use client';

import { useState } from 'react';
import { Copy, Check, MessageCircle, Info } from 'lucide-react';
import Badge from './ui/Badge';
import Button, { buttonClasses } from './ui/Button';
import { useToast } from './ui/Toast';
import { NOTIFICATION_STATUS, NOTIFICATION_TYPES, EVENT_LABELS, whatsappLinkFor, recordWhatsAppOpened, recordMessageCopied } from '@/lib/notifications';
import { formatDateTime, formatPhone } from '@/lib/formatters';

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall back below */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function NotificationPanel({ notification, audience = 'passenger', showHistory = false }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  if (!notification) return null;
  const status = NOTIFICATION_STATUS[notification.status] || { label: notification.status, tone: 'neutral' };
  const link = whatsappLinkFor(notification);
  const national = notification.recipient?.startsWith('91') ? notification.recipient.slice(2) : notification.recipient;

  const onCopy = async () => {
    const ok = await copyText(notification.message);
    if (ok) {
      setCopied(true);
      recordMessageCopied(notification.id, audience);
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error('Could not copy automatically. Select the message text and copy it manually.');
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <MessageCircle size={16} aria-hidden="true" />
          </span>
          <div>
            <div className="text-sm font-semibold">{NOTIFICATION_TYPES[notification.type] || 'WhatsApp message'}</div>
            <div className="text-xs text-slate-500">
              To {formatPhone(national)} · {formatDateTime(notification.createdAt)}
            </div>
          </div>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <div className="p-4">
        <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg bg-[#e7f7e9] p-3 font-sans text-sm leading-relaxed text-ink">{notification.message}</pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={copied ? Check : Copy} onClick={onCopy}>
            {copied ? 'Copied' : 'Copy message'}
          </Button>
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => recordWhatsAppOpened(notification.id, audience)}
              className={buttonClasses({ variant: 'success', size: 'sm' })}
            >
              <MessageCircle size={16} aria-hidden="true" /> Open WhatsApp
            </a>
          ) : null}
        </div>
        <p className="mt-3 flex gap-1.5 text-xs text-slate-500">
          <Info size={14} className="mt-px shrink-0" aria-hidden="true" />
          Demo mode: this message was generated and saved, but not sent automatically. “Open WhatsApp” opens a pre-filled chat — the message is
          only sent if you press Send in WhatsApp, and delivery is not tracked here.
        </p>
        {showHistory && notification.events?.length ? (
          <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
            {notification.events.map((e, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>
                  {EVENT_LABELS[e.type] || e.type}
                  {e.by ? <span className="text-slate-400"> · {e.by}</span> : null}
                </span>
                <span className="tabular text-slate-400">{formatDateTime(e.at)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
