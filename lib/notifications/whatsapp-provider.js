// WhatsApp helpers.
//
// 1. buildWhatsAppLink – a click-to-chat URL (https://wa.me/...) that opens
//    WhatsApp with the message pre-filled. The person still has to press
//    "Send" in WhatsApp, so opening the link is NOT proof of delivery.
//
// 2. whatsappBusinessProvider – placeholder for the official WhatsApp
//    Business Platform (Cloud API) or a compatible BSP. A real
//    implementation must run on a server (e.g. a Next.js route handler) so the
//    access token is never exposed to the browser, and must use an approved
//    message template for business-initiated messages. Until it is wired up
//    it reports itself as not configured and never claims a message was sent.

export function buildWhatsAppLink(whatsappNumber, message) {
  const digits = String(whatsappNumber || '').replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message || '')}`;
}

export const whatsappBusinessProvider = {
  id: 'whatsapp-business',
  label: 'WhatsApp Business Platform',
  description: 'Not configured in this demo. Requires a server-side integration and provider credentials.',
  isConfigured: () => false,
  // Expected future shape:
  //   const res = await fetch('/api/notifications/whatsapp', { method: 'POST', body: JSON.stringify({ to, template, params }) });
  //   return { status: 'sent', providerMessageId: res.id, sentAt: new Date().toISOString() };
  send() {
    return {
      status: 'failed',
      error: 'WhatsApp Business provider is not configured.',
      sentAt: null,
      providerMessageId: null,
    };
  },
};
