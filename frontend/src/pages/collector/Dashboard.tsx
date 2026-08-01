import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getMyDonations } from '../../services/donations';
import {
  getPrinterStatus,
  isNativeApp,
  subscribeToPrinterStatus,
  type PrinterStatus,
} from '../../services/printer';
import {
  pendingDonationsCount,
  subscribeToOfflineQueue,
} from '../../services/offlineQueue';
import type { DonationRecord } from '../../types';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { StatCard } from '../../components/StatCard';
import { PageLoader } from '../../components/PageLoader';
import { formatCurrency, isToday, isWithinRange } from '../../utils/format';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

const REFRESH_INTERVAL_MS = 60_000;
const WEEK_DAYS = 7;

interface ActionCardProps {
  label: string;
  hint: string;
  icon: React.ReactNode;
  accent: string;
  onClick: () => void;
}

const accentStyles: Record<string, string> = {
  primary: 'bg-primary-100 text-primary-600',
  blue: 'bg-blue-100 text-blue-600',
  green: 'bg-green-100 text-green-600',
  gray: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300',
};

function ActionCard({ label, hint, icon, accent, onClick }: ActionCardProps) {
  return (
    <Card
      padding="sm"
      className="card-shadow-hover cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${
            accentStyles[accent] ?? accentStyles.gray
          }`}
        >
          {icon}
        </div>
        <div className="text-left">
          <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500">{hint}</p>
        </div>
      </div>
    </Card>
  );
}

function StatusPill({ online, label }: { online: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
        online ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}
    >
      {online ? '🟢' : '🔴'} {label}
    </span>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [donations, setDonations] = useState<DonationRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const isNative = isNativeApp();
  const [printerStatus, setPrinterStatus] = useState<PrinterStatus | null>(null);
  const isOnline = useNetworkStatus();
  const [offlineCount, setOfflineCount] = useState(0);
  const lastOfflineCount = useRef(0);

  useEffect(() => {
    let active = true;
    setError(null);
    setRefreshing(true);
    getMyDonations()
      .then((data) => {
        if (active) setDonations(data);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof Error
            ? `Could not load your donations. ${err.message}`
            : 'Could not load your donations. Please try again.',
        );
        setDonations([]);
      })
      .finally(() => {
        if (active) setRefreshing(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    const handleOnline = () => {
      setReloadKey((k) => k + 1);
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  useEffect(() => {
    const handleForeground = () => setReloadKey((k) => k + 1);
    window.addEventListener('app:foreground', handleForeground);
    return () => window.removeEventListener('app:foreground', handleForeground);
  }, []);

  useEffect(() => {
    const id = window.setInterval(
      () => setReloadKey((k) => k + 1),
      REFRESH_INTERVAL_MS,
    );
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isNative) return;
    getPrinterStatus()
      .then(setPrinterStatus)
      .catch(() => {});
    const unsubscribe = subscribeToPrinterStatus(setPrinterStatus);
    return unsubscribe;
  }, [isNative]);

  useEffect(() => {
    pendingDonationsCount()
      .then((count) => {
        setOfflineCount(count);
        lastOfflineCount.current = count;
      })
      .catch(() => {});
    const unsubscribe = subscribeToOfflineQueue((count) => {
      setOfflineCount(count);
      if (count < lastOfflineCount.current) {
        setReloadKey((k) => k + 1);
      }
      lastOfflineCount.current = count;
    });
    return unsubscribe;
  }, []);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }, []);

  const todaysDonations = useMemo(
    () => (donations ?? []).filter((d) => isToday(d.timestamp)),
    [donations],
  );

  const todayCount = todaysDonations.length;

  const todayTotal = useMemo(
    () => todaysDonations.reduce((sum, d) => sum + d.amount, 0),
    [todaysDonations],
  );

  const weekTotal = useMemo(() => {
    const fromKey = new Date(
      Date.now() - (WEEK_DAYS - 1) * 86_400_000,
    )
      .toISOString()
      .slice(0, 10);
    return (donations ?? [])
      .filter((d) => isWithinRange(d.timestamp, fromKey))
      .reduce((sum, d) => sum + d.amount, 0);
  }, [donations]);

  if (!donations) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-6">
      <Card padding="lg">
        <div className="space-y-1 text-center">
          <p className="text-sm font-medium text-primary-600">{greeting},</p>
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            {user?.collectorName}
          </h2>
        </div>
      </Card>

      {error && (
        <div
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          <div className="flex items-center justify-between gap-3">
            <p>{error}</p>
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0"
              onClick={() => setReloadKey((k) => k + 1)}
            >
              Retry
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Today's Donations"
          value={String(todayCount)}
          accent="primary"
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          }
        />
        <StatCard
          label="Today's Collection"
          value={formatCurrency(todayTotal)}
          accent="green"
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 8.25H9a6 6 0 000 12h6a6 6 0 000-12zm-3 3v6m3-6.75a2.25 2.25 0 012.25 2.25M9 8.25V6a3 3 0 013-3" />
            </svg>
          }
        />
        <StatCard
          label="Weekly Collection"
          value={formatCurrency(weekTotal)}
          accent="violet"
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          }
        />
        <StatCard
          label="Offline Pending"
          value={String(offlineCount)}
          accent="amber"
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
            </svg>
          }
        />
      </div>

      <Card padding="sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex items-center justify-between rounded-xl bg-gray-50 dark:bg-gray-800 px-4 py-3">
            <span className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">Printer Status</span>
            {isNative ? (
              printerStatus ? (
                <StatusPill
                  online={printerStatus.connected}
                  label={printerStatus.connected ? 'Connected' : 'Disconnected'}
                />
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1 text-sm font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500">
                  ⚪ Checking…
                </span>
              )
            ) : (
              <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
            )}
          </div>
          <div className="flex items-center justify-between rounded-xl bg-gray-50 dark:bg-gray-800 px-4 py-3">
            <span className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">WhatsApp Status</span>
            <StatusPill
              online={isOnline}
              label={isOnline ? 'Available' : 'Unavailable'}
            />
          </div>
          <div className="flex items-center justify-between rounded-xl bg-gray-50 dark:bg-gray-800 px-4 py-3">
            <span className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">Network Status</span>
            <StatusPill online={isOnline} label={isOnline ? 'Online' : 'Offline'} />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <ActionCard
          label="New Donation"
          hint="Generate a new receipt"
          accent="primary"
          onClick={() => navigate('/donation')}
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <ActionCard
          label="My Donations"
          hint="View your collected donations"
          accent="blue"
          onClick={() => navigate('/my-donations')}
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          }
        />
        <ActionCard
          label="Printer Settings"
          hint="Manage the Bluetooth receipt printer"
          accent="green"
          onClick={() => navigate('/printer-settings')}
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5z" />
            </svg>
          }
        />
        <ActionCard
          label="Refresh"
          hint={
            refreshing
              ? 'Updating your data…'
              : 'Sync the latest donations and status'
          }
          accent="gray"
          onClick={() => setReloadKey((k) => k + 1)}
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          }
        />
      </div>
    </div>
  );
}
