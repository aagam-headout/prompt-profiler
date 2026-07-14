import { useEffect, useState } from 'react';

// useState backed by localStorage so a choice (tool, mode, rank key) survives
// a page reload. Falls back to `initial` on any storage/parse error.
export function usePersistedState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw != null ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota / private-mode write failures */
    }
  }, [key, value]);

  return [value, setValue];
}
