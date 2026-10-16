'use client';

import { useParams } from 'next/navigation';
import { CircleCheck, Ban, Printer, TriangleAlert, ArrowLeft } from 'lucide-react';
import BookingSummary from '@/components/BookingSummary';
import NotificationPanel from '@/components/NotificationPanel';
import Button from '@/components/ui/Button';
import { EmptyState, Alert } from '@/components/ui/Misc';
import { useAppData } from '@/lib/hooks/use-app-data';
import { findBooking } from '@/lib/booking-service';
import { getNotificationsForBooking } from '@/lib/notifications';
import { formatDateTime } from '@/lib/formatters';
import { BRAND_NAME } from '@/lib/constants';

export default function BookingReceiptPage() {
  const { bookingId } = useParams();
  const { ready, data } = useAppData();

  if (!ready) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6" aria-busy="true">
        <div className="h-32 animate-pulse rounded-xl bg-slate-200/70" />
        <div className="mt-4 h-96 animate-pulse rounded-xl bg-slate-200/70" />
      </div>
    );
  }

  const booking = findBooking(decodeURIComponent(bookingId), data.bookings);
  if (!booking) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <EmptyState
          icon={TriangleAlert}
          title="Booking not found"
          description="We could not find this booking in this browser. This demo stores bookings locally, so a booking made on another device or browser cannot be opened here."
          action={<Button href="/" variant="secondary" icon={ArrowLeft}>Back to trips</Button>}
        />
      </div>
    );
  }

  const notifications = getNotificationsForBooking(booking.id, data.notifications);
  const confirmation = notifications.find((n) => n.type === 'booking_confirmation');
  const cancellation = notifications.find((n) => n.type === 'booking_cancellation');
  const cancelled = booking.bookingStatus === 'Cancelled';

  return (
    <div className="mx-auto max-w-3xl px-4 pb-10 pt-6 sm:px-6">
      <div className={`rounded-xl border p-5 shadow-sm ${cancelled ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {cancelled ? <Ban size={28} className="shrink-0 text-red-600" aria-hidden="true" /> : <CircleCheck size={28} className="shrink-0 text-emerald-600" aria-hidden="true" />}
            <div>
              <h1 className={`text-xl font-bold ${cancelled ? 'text-red-800' : 'text-emerald-900'}`}>{cancelled ? 'Booking cancelled' : 'Booking confirmed'}</h1>
              <p className={`text-sm ${cancelled ? 'text-red-700' : 'text-emerald-800'}`}>
                {cancelled ? `Cancelled on ${formatDateTime(booking.cancelledAt)}${booking.cancellationReason ? ` · ${booking.cancellationReason}` : ''}` : `Booked on ${formatDateTime(booking.createdAt)}`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Booking ID</div>
            <div className="font-mono text-2xl font-bold tracking-wider text-ink">{booking.bookingReference}</div>
          </div>
        </div>
      </div>

      {!cancelled ? (
        <Alert tone="info" className="mt-4">
          Keep your booking ID. Pay {BRAND_NAME} for this booking later — at boarding or as arranged with the operator. You can reopen this page any time from this browser.
        </Alert>
      ) : null}

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Journey details</h2>
          <Button size="sm" variant="ghost" icon={Printer} onClick={() => window.print()} className="no-print">
            Print
          </Button>
        </div>
        <BookingSummary booking={booking} showStatus />
      </section>

      <section className="no-print mt-4">
        <h2 className="mb-2 text-base font-semibold">WhatsApp notification</h2>
        {cancellation ? <div className="mb-3"><NotificationPanel notification={cancellation} /></div> : null}
        {confirmation ? <NotificationPanel notification={confirmation} /> : <p className="text-sm text-slate-500">No notification was generated for this booking.</p>}
      </section>

      <div className="no-print mt-6 text-center">
        <Button href="/" variant="secondary" icon={ArrowLeft}>
          Book another trip
        </Button>
      </div>
    </div>
  );
}
