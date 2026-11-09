import { requireAdmin } from '@/lib/server/admin-auth';
import { handleAction } from '@/lib/server/action-route';
import { ADMIN_ACTIONS } from '@/lib/server/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  return (await requireAdmin(request)) || handleAction(request, ADMIN_ACTIONS, 'admin action');
}
