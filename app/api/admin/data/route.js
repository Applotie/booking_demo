import { requireAdmin } from '@/lib/server/admin-auth';
import { adminData } from '@/lib/server/queries';
import { json, errorResponse } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    return json({ ok: true, ...(await adminData()) });
  } catch (err) {
    return errorResponse(err, 'admin data');
  }
}
