import { getDatabase } from '@/lib/server/mongodb';
import { json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Liveness check for the hosting platform: 200 when MongoDB answers, 503 otherwise.
export async function GET() {
  try {
    const { db } = await getDatabase();
    await db.command({ ping: 1 });
    return json({ ok: true, database: 'up' });
  } catch (err) {
    console.error('[api] health: database unavailable:', err?.cause?.message || err?.message);
    return json({ ok: false, database: 'down' }, 503);
  }
}
