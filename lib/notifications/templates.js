import { BRAND_NAME } from '../constants.js';
import { formatDateLong, formatTime, formatRupeesPlain } from '../formatters.js';
import { sortSeatIds } from '../seat-service.js';

function journeyLines(booking) {
  const route = booking.routeSnapshot || {};
  const departure = `${booking.travelDate}T${booking.departureTime}`;
  return [
    `Booking ID: ${booking.bookingReference}`,
    `Route: ${route.source} → ${route.destination}`,
    `Travel Date: ${formatDateLong(booking.travelDate)}`,
    `Departure: ${formatTime(departure)}`,
    `Bus: ${booking.busSnapshot?.name || ''} (${booking.busSnapshot?.registrationNumber || ''})`,
    `Seats: ${sortSeatIds(booking.seatIds).join(', ')}`,
    `Passengers: ${booking.passengers.length} (${booking.passengers.map((p) => p.name).join(', ')})`,
  ];
}

export function buildBookingConfirmationMessage(booking) {
  return [
    'Your bus booking is confirmed!',
    '',
    ...journeyLines(booking),
    `Total Fare: ${formatRupeesPlain(booking.totalFare)}`,
    'Payment: Pay the operator later.',
    '',
    'Please keep your booking ID for reference.',
    `Thank you for booking with ${BRAND_NAME}!`,
  ].join('\n');
}

export function buildCancellationMessage(booking) {
  const lines = [
    'Your bus booking has been cancelled.',
    '',
    ...journeyLines(booking),
    `Fare: ${formatRupeesPlain(booking.totalFare)}`,
  ];
  if (booking.cancellationReason) lines.push(`Reason: ${booking.cancellationReason}`);
  if (booking.paymentStatus === 'Paid') lines.push('', 'Our team will contact you about your refund.');
  lines.push('', `For help, please contact ${BRAND_NAME} with your booking ID.`);
  return lines.join('\n');
}
