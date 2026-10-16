'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Ban, Wallet, Undo2, ExternalLink, TriangleAlert } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { StatusBadge } from '../ui/Badge';
import { Alert } from '../ui/Misc';
import { Input, Select } from '../ui/Field';
import BookingSummary from '../BookingSummary';
import NotificationPanel from '../NotificationPanel';
import { useToast } from '../ui/Toast';
import { cancelBooking, setBookingPayment } from '@/lib/booking-service';
import { getNotificationsForBooking } from '@/lib/notifications';
import { formatDateTime, formatINR } from '@/lib/formatters';
import { PAYMENT_METHODS } from '@/lib/constants';

export default function BookingDetails({ booking, notifications, onClose }) {
  const [mode, setMode] = useState(null); // 'pay' | 'cancel'
  const [method, setMethod] = useState('Cash');
  const [reason, setReason] = useState('');
  const toast = useToast();

  useEffect(() => {
    setMode(null);
    setReason('');
    setMethod('Cash');
  }, [booking?.id]);

  if (!booking) return null;
  const list = getNotificationsForBooking(booking.id, notifications);
  const active = booking.bookingStatus === 'Confirmed';

  const markPaid = () => {
    const res = setBookingPayment(booking.id, 'Paid', { method });
    if (res.ok) toast.success(`${booking.bookingReference} marked as paid (${method}).`);
    else toast.error(res.message);
    setMode(null);
  };
  const markUnpaid = () => {
    const res = setBookingPayment(booking.id, 'Unpaid');
    if (res.ok) toast.success(`${booking.bookingReference} marked as unpaid.`);
    else toast.error(res.message);
  };
  const cancel = () => {
    const res = cancelBooking(booking.id, { reason, by: 'operator' });
    if (res.ok) toast.success(`Booking ${booking.bookingReference} cancelled. Seats ${booking.seatIds.join(', ')} are available again.`);
    else toast.error(res.message);
    setMode(null);
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Booking ${booking.bookingReference}`}
      description={`Booked ${formatDateTime(booking.createdAt)}`}
      footer={
        <>
          <Link href={`/booking/${booking.id}`} target="_blank" className="mr-auto inline-flex items-center gap-1 self-center text-sm font-medium text-slate-600 hover:text-ink">
            <ExternalLink size={14} /> Passenger view
          </Link>
          {active && booking.paymentStatus !== 'Paid' ? (
            <Button variant="success" icon={Wallet} onClick={() => setMode('pay')}>
              Mark paid
            </Button>
          ) : null}
          {active && booking.paymentStatus === 'Paid' ? (
            <Button variant="secondary" icon={Undo2} onClick={markUnpaid}>
              Mark unpaid
            </Button>
          ) : null}
          {active ? (
            <Button variant="danger" icon={Ban} onClick={() => setMode('cancel')}>
              Cancel booking
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={booking.bookingStatus} />
          <StatusBadge status={booking.paymentStatus} />
          {booking.paymentStatus === 'Paid' && booking.paidAt ? (
            <span className="text-xs text-slate-500">
              Paid {formatDateTime(booking.paidAt)}
              {booking.paymentMethod ? ` via ${booking.paymentMethod}` : ''}
            </span>
          ) : null}
          {booking.contactName ? <span className="text-xs text-slate-500">Contact: {booking.contactName}</span> : null}
        </div>

        {booking.bookingStatus === 'Cancelled' ? (
          <Alert tone="danger" icon={Ban} title="Cancelled">
            {formatDateTime(booking.cancelledAt)} by {booking.cancelledBy || 'operator'}
            {booking.cancellationReason ? ` — ${booking.cancellationReason}` : ''}. Seats were released.
            {booking.paymentStatus === 'Paid' ? ` This booking was paid (${formatINR(booking.totalFare)}); handle any refund outside the app.` : ''}
          </Alert>
        ) : null}

        {mode === 'pay' ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-900">Record payment of {formatINR(booking.totalFare)} received from the passenger.</p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Select label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)} options={PAYMENT_METHODS} className="w-48" />
              <Button variant="success" onClick={markPaid}>
                Confirm payment
              </Button>
              <Button variant="ghost" onClick={() => setMode(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {mode === 'cancel' ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-red-900">
              <TriangleAlert size={16} /> Cancel this booking? Seats {booking.seatIds.join(', ')} will be released. The record is kept in history.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Input label="Reason (optional, shared with passenger)" value={reason} onChange={(e) => setReason(e.target.value)} className="min-w-60 flex-1" />
              <Button variant="danger" onClick={cancel}>
                Confirm cancellation
              </Button>
              <Button variant="ghost" onClick={() => setMode(null)}>
                Keep booking
              </Button>
            </div>
          </div>
        ) : null}

        <BookingSummary booking={booking} showStatus />

        <div>
          <h3 className="mb-2 text-sm font-semibold">Notification history</h3>
          {list.length ? (
            <div className="space-y-3">
              {list.map((n) => (
                <NotificationPanel key={n.id} notification={n} audience="operator" showHistory />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No notifications recorded.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
