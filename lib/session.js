// Per-tab helpers (sessionStorage) for transient UI state such as the
// visitor's current seat-hold token. Never used for business records.

export function sessionGet(key) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function sessionSet(key, value) {
  try {
    if (value == null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    /* storage unavailable – feature degrades gracefully */
  }
}

export const holdKey = (tripId) => `busops:hold:${tripId}`;
export const flashKey = 'busops:flash';
