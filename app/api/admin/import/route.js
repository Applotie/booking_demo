import '@/lib/server/runtime';
import { requireAdmin } from '@/lib/server/admin-auth';
import { importLegacyData } from '@/lib/server/import';
import { json, readJson, errorResponse } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// localStorage is limited to about 5 MB of UTF-16 text, so 12 MB of JSON is ample.
const MAX_IMPORT_BYTES = 12 * 1024 * 1024;

export async function POST(request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    return json(await importLegacyData(await readJson(request, MAX_IMPORT_BYTES, { maxArray: 20000 })));
  } catch (err) {
    return errorResponse(err, 'admin import');
  }
}
