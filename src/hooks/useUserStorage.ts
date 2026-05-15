import { useEffect, useRef, useState } from "react";

/**
 * Per-user localStorage state. The actual storage key is suffixed with the
 * current user id so that switching accounts on the same browser keeps
 * preferences fully isolated.
 */
export function useUserStorage<T>(baseKey: string, defaultValue: T, userId: string | undefined | null) {
  const key = userId ? `${baseKey}:${userId}` : null;
  const [value, setValue] = useState<T>(defaultValue);
  const loadedKeyRef = useRef<string | null>(null);

  // Load whenever the scope (user) changes
  useEffect(() => {
    if (!key) {
      loadedKeyRef.current = null;
      setValue(defaultValue);
      return;
    }
    try {
      const raw = localStorage.getItem(key);
      setValue(raw !== null ? (JSON.parse(raw) as T) : defaultValue);
    } catch {
      setValue(defaultValue);
    }
    loadedKeyRef.current = key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Persist on change — but only after load for THIS key has completed,
  // so we don't overwrite a new user's storage with the previous user's value.
  useEffect(() => {
    if (!key || loadedKeyRef.current !== key) return;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }, [key, value]);

  return [value, setValue] as const;
}
