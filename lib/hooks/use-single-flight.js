'use client';

import { useCallback, useRef } from 'react';

// Wraps an async handler so it cannot run again while a previous call is still
// waiting for the server (e.g. a double-clicked Save button). Form events have
// their default prevented immediately, even when the call is ignored.
export function useSingleFlight() {
  const busy = useRef(false);
  return useCallback(
    (fn) =>
      async (...args) => {
        if (args[0] && typeof args[0].preventDefault === 'function' && args[0].type === 'submit') args[0].preventDefault();
        if (busy.current) return undefined;
        busy.current = true;
        try {
          return await fn(...args);
        } finally {
          busy.current = false;
        }
      },
    []
  );
}
