import { lazy, Suspense, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { CollectorRoute } from './components/CollectorRoute';
import { ToastProvider, useToast } from './components/Toast';
import { PageLoader } from './components/PageLoader';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AdminLayout } from './layouts/AdminLayout';
import { CollectorLayout } from './layouts/CollectorLayout';
import {
  initPrinterService,
  subscribeToPrinterStatus,
} from './services/printer';
import { isBackGuarded } from './services/backGuard';
import { initOfflineSync } from './services/offlineQueue';
import { useAuth } from './hooks/useAuth';

const Login = lazy(() =>
  import('./pages/Login').then((m) => ({ default: m.Login })),
);
const Unauthorized = lazy(() =>
  import('./pages/Unauthorized').then((m) => ({ default: m.Unauthorized })),
);
const AdminDashboard = lazy(() =>
  import('./pages/admin/Dashboard').then((m) => ({ default: m.Dashboard })),
);
const Collectors = lazy(() =>
  import('./pages/admin/Collectors').then((m) => ({ default: m.Collectors })),
);
const AdminDonations = lazy(() =>
  import('./pages/admin/Donations').then((m) => ({ default: m.Donations })),
);
const Reports = lazy(() =>
  import('./pages/admin/Reports').then((m) => ({ default: m.Reports })),
);
const CollectorDashboard = lazy(() =>
  import('./pages/collector/Dashboard').then((m) => ({ default: m.Dashboard })),
);
const Donation = lazy(() =>
  import('./pages/collector/Donation').then((m) => ({ default: m.Donation })),
);
const MyDonations = lazy(() =>
  import('./pages/collector/MyDonations').then((m) => ({ default: m.MyDonations })),
);
const PrinterSettings = lazy(() =>
  import('./pages/collector/PrinterSettings').then((m) => ({ default: m.PrinterSettings })),
);
const Settings = lazy(() =>
  import('./pages/collector/Settings').then((m) => ({ default: m.Settings })),
);

function PrinterMonitor() {
  const showToast = useToast();
  const wasConnected = useRef<boolean | null>(null);

  useEffect(() => {
    initPrinterService();
    initOfflineSync();
    const unsubscribe = subscribeToPrinterStatus((status) => {
      if (wasConnected.current === true && !status.connected && status.address) {
        showToast('Printer Disconnected');
      }
      wasConnected.current = status.connected;
    });
    return unsubscribe;
  }, [showToast]);

  return null;
}

function BackButtonHandler() {
  const showToast = useToast();
  const navigate = useNavigate();
  const lastBackAt = useRef(0);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let remove: (() => void) | undefined;
    void CapApp.addListener('backButton', ({ canGoBack }) => {
      if (isBackGuarded()) return;

      const { pathname } = window.location;
      if (pathname === '/') {
        const now = Date.now();
        if (now - lastBackAt.current < 2500) {
          void CapApp.exitApp();
        } else {
          lastBackAt.current = now;
          showToast('Press back again to exit');
        }
        return;
      }

      if (canGoBack) {
        window.history.back();
      } else {
        navigate('/');
      }
    }).then((handle) => {
      remove = handle.remove;
    });

    return () => remove?.();
  }, [navigate, showToast]);

  return null;
}

function ForegroundManager() {
  const { refreshSession } = useAuth();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let remove: (() => void) | undefined;
    void CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      void refreshSession();
      window.dispatchEvent(new Event('app:foreground'));
    }).then((handle) => {
      remove = handle.remove;
    });

    return () => remove?.();
  }, [refreshSession]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <ThemeProvider>
            <PrinterMonitor />
            <ForegroundManager />
            <BackButtonHandler />
            <ErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/unauthorized" element={<Unauthorized />} />

          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <AdminLayout />
                </AdminRoute>
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="collectors" element={<Collectors />} />
            <Route path="donations" element={<AdminDonations />} />
            <Route path="reports" element={<Reports />} />
          </Route>

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <CollectorRoute>
                  <CollectorLayout />
                </CollectorRoute>
              </ProtectedRoute>
            }
          >
            <Route index element={<CollectorDashboard />} />
            <Route path="donation" element={<Donation />} />
            <Route path="my-donations" element={<MyDonations />} />
            <Route path="printer-settings" element={<PrinterSettings />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
            </ErrorBoundary>
          </ThemeProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
