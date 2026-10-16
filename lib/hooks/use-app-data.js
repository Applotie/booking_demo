'use client';

import { useEffect, useState } from 'react';
import { readAll, subscribe, ensureSchema, getStorageIssues } from '../storage.js';
import { COLLECTIONS } from '../storage-keys.js';

const EMPTY = Object.freeze(Object.fromEntries(COLLECTIONS.map((c) => [c, []])));

/**
 * Loads all collections after hydration and re-reads them whenever any tab
 * changes the data. `ready` is false during SSR and the first client render,
 * so pages can show a skeleton instead of misleading zeroes.
 */
export function useAppData() {
  const [state, setState] = useState({ ready: false, data: EMPTY, issues: [] });
  useEffect(() => {
    ensureSchema();
    const load = () => setState({ ready: true, data: readAll(), issues: getStorageIssues() });
    load();
    return subscribe(load);
  }, []);
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
