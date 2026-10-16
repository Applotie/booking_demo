// Demo provider: records the message locally and reports it honestly as
// "generated". Nothing leaves the browser.

export const demoProvider = {
  id: 'demo',
  label: 'Demo mode',
  description: 'Messages are generated and stored in this browser only. No WhatsApp message is sent.',
  isConfigured: () => true,
  send({ message, recipient }) {
    if (!message || !recipient) {
      return { status: 'failed', error: 'Missing message or recipient.', sentAt: null, providerMessageId: null };
    }
    return { status: 'generated', error: null, sentAt: null, providerMessageId: null };
  },
};
