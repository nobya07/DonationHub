import { createContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import * as authService from '../services/auth';
import type { Collector } from '../types';

interface AuthContextValue {
  user: Collector | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
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
    setUser({
      collectorId: data.collectorId,
      username: data.username,
      collectorName: data.collectorName,
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const isAuthenticated = user !== null;

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
}
