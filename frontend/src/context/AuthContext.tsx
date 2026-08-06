import {
  createContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import * as authService from '../services/auth';
import {
  storeSessionId,
  subscribeSessionInvalidated,
  isSessionReplacedCode,
} from '../services/session';
import { useToast } from '../components/Toast';
import type { Collector } from '../types';

const SESSION_REPLACED_MESSAGE =
  'Your account has been logged in on another device.';

interface AuthContextValue {
  user: Collector | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<Collector>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  isAuthenticated: boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Collector | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const showToast = useToast();
  const invalidationHandledRef = useRef(false);

  /** Single-device session was invalidated by the server (logged in on
   *  another device): clear the stored session id and cached user, redirect
   *  to the login screen and inform the user. Idempotent. */
  const handleSessionInvalidated = useCallback(() => {
    if (invalidationHandledRef.current) return;
    invalidationHandledRef.current = true;

    void storeSessionId(null);
    setUser(null);
    showToast(SESSION_REPLACED_MESSAGE);
    navigate('/login', { replace: true });
  }, [navigate, showToast]);

  useEffect(() => {
    const unsubscribe = subscribeSessionInvalidated(handleSessionInvalidated);

    authService
      .verify()
      .then((data) => {
        void storeSessionId(data.sessionId);
        setUser({
          collectorId: data.collectorId,
          username: data.username,
          collectorName: data.collectorName,
          role: data.role,
        });
      })
      .catch((err: unknown) => {
        setUser(null);

        if (isSessionReplacedCode((err as Error & { code?: string }).code)) {
          handleSessionInvalidated();
        }
      })
      .finally(() => {
        setLoading(false);
      });

    return unsubscribe;
  }, [handleSessionInvalidated]);

  const login = useCallback(async (username: string, password: string) => {
    const data = await authService.login(username, password);

    invalidationHandledRef.current = false;
    await storeSessionId(data.sessionId);

    const nextUser: Collector = {
      collectorId: data.collectorId,
      username: data.username,
      collectorName: data.collectorName,
      role: data.role,
    };

    setUser(nextUser);

    return nextUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      invalidationHandledRef.current = false;
      await storeSessionId(null);
      setUser(null);
    }
  }, []);

  /** Re-checks the session (e.g. when the app returns to the foreground). A
   *  network blip must not log collectors out, but a session invalidated by
   *  a login on another device signs the current device out. */
  const refreshSession = useCallback(async () => {
    try {
      const data = await authService.verify();
      await storeSessionId(data.sessionId);
      setUser({
        collectorId: data.collectorId,
        username: data.username,
        collectorName: data.collectorName,
        role: data.role,
      });
    } catch (err: unknown) {
      if (isSessionReplacedCode((err as Error & { code?: string }).code)) {
        handleSessionInvalidated();
      }
      // other failures keep the current session; protected API calls will
      // surface errors
    }
  }, [handleSessionInvalidated]);

  const isAuthenticated = user !== null;

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        refreshSession,
        isAuthenticated,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
