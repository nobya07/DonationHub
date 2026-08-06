import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const SESSION_ID_KEY = 'dh_session_id';
const SESSION_REPLACED_CODE = 'SESSION_REPLACED';

/** Error code sent by the server when the active session was replaced by
 *  a login on another device. */
export function isSessionReplacedCode(code: unknown): boolean {
  return code === SESSION_REPLACED_CODE;
}

/** Reads the session id saved on this device during login/verify. */
export async function getStoredSessionId(): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { value } = await Preferences.get({ key: SESSION_ID_KEY });
      if (value) return value;
    } catch {
      // fall through to localStorage
    }
  }
  try {
    return localStorage.getItem(SESSION_ID_KEY);
  } catch {
    return null;
  }
}

/** Saves (or clears) the session id on this device. */
export async function storeSessionId(id: string | null): Promise<void> {
  const persist = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        if (id) {
          await Preferences.set({ key: SESSION_ID_KEY, value: id });
        } else {
          await Preferences.remove({ key: SESSION_ID_KEY });
        }
        return;
      } catch {
        // fall through to localStorage below
      }
    }
    if (id) {
      localStorage.setItem(SESSION_ID_KEY, id);
    } else {
      localStorage.removeItem(SESSION_ID_KEY);
    }
  };
  await persist();
}

type SessionInvalidatedListener = () => void;

const listeners = new Set<SessionInvalidatedListener>();

/** Notifies the app that the server rejected the session (logged in
 *  elsewhere). Called by the API response interceptors. */
export function notifySessionInvalidated(): void {
  listeners.forEach((listener) => listener());
}

/** Subscribes to session-invalidation events. Returns an unsubscribe fn. */
export function subscribeSessionInvalidated(
  listener: SessionInvalidatedListener
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}