'use client';

import { useState, useEffect } from 'react';
import Modal from './Modal';
import Button from './Button';
import { Input } from './Field';

/**
 * Confirmation for destructive actions. When `confirmText` is set, the user
 * must type it before the confirm button enables.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Go back',
  tone = 'danger',
  confirmText,
  disabled = false,
  busy = false,
  onConfirm,
  onCancel,
  children,
}) {
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);
  const blocked = disabled || busy || (confirmText && typed.trim().toUpperCase() !== confirmText.toUpperCase());
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} disabled={blocked}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-slate-700">
        {typeof message === 'string' ? <p>{message}</p> : message}
        {children}
        {confirmText ? (
          <Input
            label={`Type ${confirmText} to confirm`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
          />
        ) : null}
      </div>
    </Modal>
  );
}
