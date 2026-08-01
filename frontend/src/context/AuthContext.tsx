import { createContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import * as authService from '../services/auth';
import type { Collector } from '../types';

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

  useEffect(() => {
    authService
      .verify()
      .then((data) => {
        setUser({
          collectorId: data.collectorId,
          username: data.username,
          collectorName: data.collectorName,
          role: data.role,
        });
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const data = await authService.login(username, password);

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
      setUser(null);
    }
  }, []);

  /** Re-checks the session (e.g. when the app returns to the foreground). A
   *  failed check never signs the user out — a network blip must not log
   *  collectors out of the app. */
  const refreshSession = useCallback(async () => {
    try {
      const data = await authService.verify();
      setUser({
        collectorId: data.collectorId,
        username: data.username,
        collectorName: data.collectorName,
        role: data.role,
      });
    } catch {
      // keep the current session; protected API calls will surface errors
    }
  }, []);

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
