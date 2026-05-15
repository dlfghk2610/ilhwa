import { useEffect, useState } from "react";

/**
 * Per-user localStorage state. The actual storage key is suffixed with the
 * current user id so that switching accounts on the same browser keeps
 * preferences fully isolated.
 */
export function useUserStorage<T>(baseKey: string, defaultValue: T, userId: string | undefined | null) {
  const key = userId ? `${baseKey}:${userId}` : null;
  const [value, setValue] = useState<T>(defaultValue);

  // Load whenever the scope (user) changes
  useEffect(() => {
    if (!key) { setValue(defaultValue); return; }
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        setValue(JSON.parse(raw) as T);
      } else {
        setValue(defaultValue);
      }
    } catch {
      setValue(defaultValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Persist on change
  useEffect(() => {
    if (!key) return;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }, [key, value]);

  return [value, setValue] as const;
}
