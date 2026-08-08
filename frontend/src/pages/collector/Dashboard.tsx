import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { formatCurrency, formatDateTime, isToday, currentISTHour, parseSheetTimestamp } from '../../utils/format';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

const REFRESH_INTERVAL_MS = 60_000;
const RECENT_DONATIONS_COUNT = 5;

function StatusPill({ online, label }: { online: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
        online
          ? 'bg-success-100 text-success-700 dark:bg-success-950 dark:text-success-300'
          : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
      }`}
    >
      {online ? '🟢' : '🔴'} {label}
    </span>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const [donations, setDonations] = useState<DonationRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const isNative = isNativeApp();
  const [printerStatus, setPrinterStatus] = useState<PrinterStatus | null>(null);
  const isOnline = useNetworkStatus();
  const [offlineCount, setOfflineCount] = useState(0);
  const lastOfflineCount = useRef(0);

  useEffect(() => {
    let active = true;
    setError(null);
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
    const hour = currentISTHour();
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

  const recentDonations = useMemo(
    () =>
      [...(donations ?? [])]
        .sort(
          (a, b) =>
            (parseSheetTimestamp(b.timestamp)?.getTime() ?? 0) -
            (parseSheetTimestamp(a.timestamp)?.getTime() ?? 0),
        )
        .slice(0, RECENT_DONATIONS_COUNT),
    [donations],
  );

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
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
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

      <div className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2 lg:grid-cols-3">
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
          label="Today's Donation Count"
          value={String(todayCount)}
          accent="primary"
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          }
        />
        <StatCard
          label="Pending Offline Sync"
          value={String(offlineCount)}
          accent="amber"
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
            </svg>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2">
        <Card padding="sm" className="h-full">
          <div className="flex h-full flex-col items-start gap-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">Printer Status</span>
            {isNative ? (
              printerStatus ? (
                <StatusPill
                  online={printerStatus.connected}
                  label={printerStatus.connected ? 'Connected' : 'Disconnected'}
                />
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  ⚪ Checking…
                </span>
              )
            ) : (
              <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
            )}
          </div>
        </Card>
        <Card padding="sm" className="h-full">
          <div className="flex h-full flex-col items-start gap-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">Network Status</span>
            <StatusPill online={isOnline} label={isOnline ? 'Online' : 'Offline'} />
          </div>
        </Card>
      </div>

      <Card padding="md">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Recent Donations</h3>
          <Link
            to="/my-donations"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            View all
          </Link>
        </div>
        {recentDonations.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
            No donations yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <th className="px-3 py-2 font-medium">Receipt Number</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Donor Name</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {recentDonations.map((d) => (
                  <tr key={d.receiptNo} className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-3 py-2.5 font-mono text-xs font-medium text-gray-900 dark:text-white">{d.receiptNo}</td>
                    <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300">{formatDateTime(d.timestamp)}</td>
                    <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-white">{d.donorName}</td>
                    <td className="px-3 py-2.5 font-semibold text-gray-900 dark:text-white">{formatCurrency(d.amount)}</td>
                    <td className="px-3 py-2.5">
                      <Link
                        to={`/receipt/${encodeURIComponent(d.receiptNo)}`}
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                      >
                        View Receipt
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
