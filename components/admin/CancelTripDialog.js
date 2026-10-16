'use client';

import { useState, useEffect } from 'react';
import { TriangleAlert } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Input, Checkbox } from '../ui/Field';
import { Alert } from '../ui/Misc';
import { useToast } from '../ui/Toast';
import { cancelTrip } from '@/lib/trip-service';
import { activeBookingsForTrip } from '@/lib/booking-service';
import { formatDateTime, formatINR } from '@/lib/formatters';

// Safe cancellation: if a trip has active bookings the admin must explicitly
// acknowledge that every booking will be cancelled too.
export default function CancelTripDialog({ trip, bookings, onClose }) {
  const [reason, setReason] = useState('');
  const [ack, setAck] = useState(false);
  const toast = useToast();
  useEffect(() => {
    setReason('');
    setAck(false);
  }, [trip]);
  if (!trip) return null;
  const active = activeBookingsForTrip(trip.id, bookings);
  const paid = active.filter((b) => b.paymentStatus === 'Paid');
  const passengers = active.reduce((s, b) => s + b.passengers.length, 0);

  const confirm = () => {
    const res = cancelTrip(trip.id, { reason, cancelBookings: active.length > 0 && ack });
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success(res.cancelledBookings ? `Trip cancelled along with ${res.cancelledBookings} booking(s). Cancellation messages are ready to send.` : 'Trip cancelled.');
    onClose(true);
  };

  return (
    <Modal
      open
      onClose={() => onClose(false)}
      title="Cancel trip"
      description={`${trip.routeSnapshot.source} → ${trip.routeSnapshot.destination} · ${formatDateTime(trip.departureAt)}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onClose(false)}>
            Keep trip
          </Button>
          <Button variant="danger" onClick={confirm} disabled={active.length > 0 && !ack}>
            Cancel trip
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {active.length ? (
          <Alert tone="danger" icon={TriangleAlert} title={`${active.length} active booking(s), ${passengers} passenger(s)`}>
            All of these bookings will be cancelled and their seats released. A cancellation message is prepared for each passenger in the booking
            details; you still need to send it.
            {paid.length ? (
              <span className="mt-1 block font-medium">
                {paid.length} booking(s) are marked paid ({formatINR(paid.reduce((s, b) => s + b.totalFare, 0))}). Arrange refunds outside this app.
              </span>
            ) : null}
          </Alert>
        ) : (
          <p className="text-slate-600">This trip has no active bookings. It will no longer be shown to passengers.</p>
        )}
        <Input label="Reason (shared with passengers)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Vehicle breakdown" />
        {active.length ? <Checkbox label={`Also cancel ${active.length} booking(s)`} description="Required to cancel a trip that has bookings." checked={ack} onChange={(e) => setAck(e.target.checked)} /> : null}
      </div>
    </Modal>
  );
}
