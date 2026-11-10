'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { COLLECTIONS, CHANGE_EVENT } from '../storage-keys.js';
import { redirectToAdminLogin } from '../api-client.js';
import { beginActivity } from '../activity.js';

const EMPTY = Object.freeze(Object.fromEntries(COLLECTIONS.map((c) => [c, []])));
export const LOAD_STATUS_EVENT = 'busops:load-status';
const HOLD_KEY_PREFIX = 'busops:hold:';

// Seat-hold tokens this browser tab owns (see lib/session.js), so the server
// can return the visitor's own holds and bookings.
function ownHoldTokens(extra) {
  const tokens = new Set(extra ? [extra] : []);
  // The booking page carries its hold in the URL (?hold=…).
  const fromUrl = new URLSearchParams(window.location.search).get('hold');
  if (fromUrl) tokens.add(fromUrl);
  try {
    const s = window.sessionStorage;
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i);
      if (key && key.startsWith(HOLD_KEY_PREFIX)) {
        const value = s.getItem(key);
        if (value) tokens.add(value);
      }
    }
  } catch {
    /* sessionStorage unavailable */
  }
  return [...tokens].slice(0, 20);
}

function requestFor({ scope, tripId, bookingId, holdToken }) {
  if (scope !== 'public') return { url: '/api/admin/data', headers: {} };
  if (bookingId) return { url: `/api/public/data?bookingId=${encodeURIComponent(bookingId)}`, headers: {} };
  const tokens = ownHoldTokens(holdToken);
  return {
    url: tripId ? `/api/public/data?tripId=${encodeURIComponent(tripId)}` : '/api/public/data',
    headers: tokens.length ? { 'X-Hold-Tokens': tokens.join(',') } : {},
  };
}

function reportStatus(ok) {
  try {
    window.dispatchEvent(new CustomEvent(LOAD_STATUS_EVENT, { detail: { ok } }));
  } catch {
    /* ignore */
  }
}

/**
 * Loads the data a page needs from the server (MongoDB) and reloads it after
 * every change made in this tab, when the tab regains focus, and — on public
 * pages, where other passengers book the same seats — every 15 seconds.
 *
 * `ready` is false until the first successful load, so pages show a skeleton
 * instead of misleading zeroes.
 *
 * Options: { scope: 'admin' | 'public', tripId, bookingId, holdToken }.
 * Admin pages call useAppData() with no options.
 */
export function useAppData(options = {}) {
  const { scope = 'admin', tripId = null, bookingId = null, holdToken = null } = options;
  const [state, setState] = useState({ ready: false, data: EMPTY, storageBytes: null, error: null });
  const seq = useRef(0);
  const retry = useRef(null);

  // `quiet` loads (background refresh, tab focus) do not show the progress bar.
  const load = useCallback(async ({ quiet = false } = {}) => {
    const id = ++seq.current;
    clearTimeout(retry.current);
    const endActivity = quiet ? () => {} : beginActivity('load');
    const { url, headers } = requestFor({ scope, tripId, bookingId, holdToken });
    try {
      const res = await fetch(url, { headers, cache: 'no-store', credentials: 'same-origin' });
      const body = await res.json().catch(() => null);
      if (res.status === 401 && body?.code === 'UNAUTHENTICATED') {
        redirectToAdminLogin();
        return;
      }
      if (!res.ok || !body?.ok) throw new Error(body?.message || 'Could not load data.');
      if (id !== seq.current) return;
      const data = { ...EMPTY, ...body.data };
      setState({ ready: true, data, storageBytes: body.storageBytes ?? null, error: null });
      reportStatus(true);
    } catch (err) {
      if (id !== seq.current) return;
      setState((s) => ({ ...s, error: err.message || 'Could not load data.' }));
      reportStatus(false);
      // Try again shortly (e.g. the database was briefly unavailable).
      retry.current = setTimeout(() => id === seq.current && load({ quiet: true }), 10000);
    } finally {
      endActivity();
    }
  }, [scope, tripId, bookingId, holdToken]);

  useEffect(() => {
    load();
    const onChange = () => load();
    const onFocus = () => load({ quiet: true });
    const onVisible = () => document.visibilityState === 'visible' && load({ quiet: true });
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    const timer =
      scope === 'public' && !bookingId
        ? setInterval(() => document.visibilityState === 'visible' && load({ quiet: true }), 15000)
        : null;
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      if (timer) clearInterval(timer);
      clearTimeout(retry.current);
      seq.current++;
    };
  }, [load, scope, bookingId]);

  return state;
}

// Current time, refreshed on an interval (for countdowns and hold expiry).
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// Reads a query parameter once on mount without needing a Suspense boundary.
// With `consume`, the parameter is removed from the URL afterwards so that a
// refresh does not repeat one-off actions such as opening a "new" form.
export function useQueryParam(name, { consume = false } = {}) {
  const [value, setValue] = useState(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setValue(params.get(name));
    if (consume && params.has(name)) {
      params.delete(name);
      const qs = params.toString();
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    }
  }, [name, consume]);
  return value;
}
