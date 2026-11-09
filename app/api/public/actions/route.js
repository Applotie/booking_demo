import { handleAction } from '@/lib/server/action-route';
import { PUBLIC_ACTIONS } from '@/lib/server/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Passenger actions only: seat holds, bookings and WhatsApp message events.
export async function POST(request) {
  return handleAction(request, PUBLIC_ACTIONS, 'public action');
}
