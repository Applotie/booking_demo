import { publicData, publicBooking } from '@/lib/server/queries';
import { json, errorResponse, requireId, BadRequestError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/public/data                  -> trips to search, with seat availability
// GET /api/public/data?tripId=…         -> one trip, with seat availability
// GET /api/public/data?bookingId=…      -> one booking (id or booking reference) and its messages
// The caller's own seat-hold tokens travel in the X-Hold-Tokens header.
export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    const bookingId = params.get('bookingId');
    if (bookingId != null) return json({ ok: true, data: await publicBooking(requireId(bookingId, 'booking')) });

    const tripId = params.get('tripId');
    const raw = request.headers.get('x-hold-tokens') || '';
    const holdTokens = raw ? raw.split(',').map((t) => t.trim()).filter(Boolean) : [];
    if (holdTokens.length > 20) throw new BadRequestError('Too many seat holds.');
    holdTokens.forEach((t) => requireId(t, 'seat hold'));
    return json({ ok: true, data: await publicData({ tripId: tripId == null ? null : requireId(tripId, 'trip'), holdTokens }) });
  } catch (err) {
    return errorResponse(err, 'public data');
  }
}
