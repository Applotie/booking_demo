'use client';

// Tracks server operations in progress so the UI can show a loading state.
// kind 'load' -> thin progress bar only (page data being fetched)
// kind 'save' -> progress bar plus a "Saving…" screen that blocks clicks

import { useSyncExternalStore } from 'react';

let nextId = 1;
const active = new Map(); // id -> { kind, label }
const listeners = new Set();
let snapshot = { loading: false, saving: false, label: '' };

function publish() {
  const list = [...active.values()];
  const saves = list.filter((a) => a.kind === 'save');
  snapshot = { loading: list.length > 0, saving: saves.length > 0, label: saves.length ? saves[saves.length - 1].label : '' };
  listeners.forEach((l) => l());
}

export function beginActivity(kind, label = '') {
  const id = nextId++;
  active.set(id, { kind, label });
  publish();
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    active.delete(id);
    publish();
  };
}

// Runs `promiseFn` while showing the matching loading state.
export async function withActivity(kind, label, promiseFn) {
  const end = beginActivity(kind, label);
  try {
    return await promiseFn();
  } finally {
    end();
  }
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const SERVER_SNAPSHOT = { loading: false, saving: false, label: '' };

export function useActivity() {
  return useSyncExternalStore(subscribe, () => snapshot, () => SERVER_SNAPSHOT);
}
