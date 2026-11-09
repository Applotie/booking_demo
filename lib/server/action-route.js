import './runtime.js';
import { readJson, json, errorResponse, requireString, BadRequestError } from './http.js';

const MAX_ACTION_BYTES = 256 * 1024;

// POST { action: "createRoute", args: [...] } -> the service's result object.
// Business failures (validation, seat taken, …) come back as 200 with
// `ok: false` exactly as the services return them; only malformed requests and
// server problems use error status codes.
export async function handleAction(request, registry, context) {
  try {
    const body = await readJson(request, MAX_ACTION_BYTES);
    const action = requireString(body?.action, 'action', 60);
    if (!Object.hasOwn(registry, action)) throw new BadRequestError('Unknown action.', 404);
    const args = body.args == null ? [] : body.args;
    if (!Array.isArray(args) || args.length > 5) throw new BadRequestError('Invalid arguments.');
    const result = await registry[action](args);
    return json(result ?? { ok: true });
  } catch (err) {
    return errorResponse(err, context);
  }
}
