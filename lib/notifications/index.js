// Notification service. Booking code calls these functions and never talks
// to a provider directly, so the demo provider can be replaced later.

import { readCollection, writeCollection, generateId, nowISO } from '../storage.js';
import { normalizeIndianMobile } from '../validators.js';
import { demoProvider } from './demo-provider.js';
import { whatsappBusinessProvider, buildWhatsAppLink } from './whatsapp-provider.js';
import { buildBookingConfirmationMessage, buildCancellationMessage } from './templates.js';

export { buildWhatsAppLink };

const PROVIDERS = { demo: demoProvider, 'whatsapp-business': whatsappBusinessProvider };

export function getActiveProvider() {
  // Swap to PROVIDERS['whatsapp-business'] once a server integration exists.
  return PROVIDERS.demo;
}

export const NOTIFICATION_STATUS = {
  generated: { label: 'Demo notification generated', tone: 'info' },
  queued: { label: 'Queued', tone: 'neutral' },
  sent: { label: 'Sent via provider', tone: 'success' },
  delivered: { label: 'Delivered', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
};

export const NOTIFICATION_TYPES = {
  booking_confirmation: 'Booking confirmation',
  booking_cancellation: 'Booking cancellation',
};

function buildRecord({ bookingId, type, recipient, message }) {
  const provider = getActiveProvider();
  const normalized = normalizeIndianMobile(recipient);
  const now = nowISO();
  const result = normalized
    ? provider.send({ message, recipient: normalized.whatsapp })
    : { status: 'failed', error: 'Invalid recipient number.', sentAt: null, providerMessageId: null };
  return {
    id: generateId('ntf'),
    bookingId,
    type,
    channel: 'whatsapp',
    provider: provider.id,
    recipient: normalized ? normalized.whatsapp : String(recipient || ''),
    message,
    status: result.status,
    error: result.error || null,
    attempts: 1,
    providerMessageId: result.providerMessageId || null,
    createdAt: now,
    sentAt: result.sentAt || null,
    events: [{ type: result.status, at: now }],
  };
}

// Returns the notification record without saving it, so callers that already
// write several collections can include it in the same write.
export function prepareBookingConfirmation(booking) {
  return buildRecord({
    bookingId: booking.id,
    type: 'booking_confirmation',
    recipient: booking.contactNumber,
    message: buildBookingConfirmationMessage(booking),
  });
}

export function prepareBookingCancellation(booking) {
  return buildRecord({
    bookingId: booking.id,
    type: 'booking_cancellation',
    recipient: booking.contactNumber,
    message: buildCancellationMessage(booking),
  });
}

export function getNotificationsForBooking(bookingId, notifications = readCollection('notifications')) {
  return notifications
    .filter((n) => n.bookingId === bookingId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function appendEvent(notificationId, event) {
  const list = readCollection('notifications');
  const existing = list.find((n) => n.id === notificationId);
  if (!existing) return null;
  const updated = { ...existing, events: [...(existing.events || []), { ...event, at: nowISO() }] };
  writeCollection('notifications', list.map((n) => (n.id === notificationId ? updated : n)));
  return updated;
}

// Opening wa.me only pre-fills a chat. We record that the link was opened
// but deliberately do not change the status to sent/delivered.
export function recordWhatsAppOpened(notificationId, by = 'passenger') {
  return appendEvent(notificationId, { type: 'whatsapp_link_opened', by });
}

export function recordMessageCopied(notificationId, by = 'passenger') {
  return appendEvent(notificationId, { type: 'message_copied', by });
}

export function whatsappLinkFor(notification) {
  return buildWhatsAppLink(notification.recipient, notification.message);
}

export const EVENT_LABELS = {
  generated: 'Message generated (demo — not sent)',
  failed: 'Generation failed',
  sent: 'Sent via provider',
  delivered: 'Delivered',
  whatsapp_link_opened: 'WhatsApp chat opened (delivery not confirmed)',
  message_copied: 'Message copied',
};
