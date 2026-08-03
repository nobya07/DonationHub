import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDonations, getCollectors } from '../../services/admin';
import type { AdminCollector, DonationRecord } from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/StatCard';
import { PageLoader } from '../../components/PageLoader';
import { formatCurrency, formatDateTime, isToday, todayKey, monthKey } from '../../utils/format';

export function Dashboard() {
  const navigate = useNavigate();
  const [donations, setDonations] = useState<DonationRecord[] | null>(null);
  const [collectors, setCollectors] = useState<AdminCollector[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getDonations(), getCollectors()])
      .then(([donationData, collectorData]) => {
        setDonations(donationData);
        setCollectors(collectorData);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
        setDonations([]);
        setCollectors([]);
      });
  }, []);

  const stats = useMemo(() => {
    const all = donations ?? [];
    const today = todayKey();
    const currentMonth = monthKey(today);

    const todayDonations = all.filter((d) => isToday(d.timestamp));
    const monthDonations = all.filter((d) => monthKey(d.timestamp) === currentMonth);
    const uniqueDonors = new Set(all.map((d) => d.phone)).size;

    return {
      totalAmount: all.reduce((sum, d) => sum + d.amount, 0),
      totalCount: all.length,
      todayAmount: todayDonations.reduce((sum, d) => sum + d.amount, 0),
      todayCount: todayDonations.length,
      monthAmount: monthDonations.reduce((sum, d) => sum + d.amount, 0),
      monthCount: monthDonations.length,
      uniqueDonors,
    };
  }, [donations]);

  const recentDonations = useMemo(
    () => (donations ?? []).slice(0, 10),
    [donations],
  );

  if (!donations || !collectors) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Admin Dashboard</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Overview of all collections.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate('/admin/donations')}>
            View Donations
          </Button>
          <Button variant="secondary" onClick={() => navigate('/admin/reports')}>
            Reports
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300" role="alert">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Donations" value={formatCurrency(stats.totalAmount)} accent="primary" />
        <StatCard label="Today's Collection" value={formatCurrency(stats.todayAmount)} accent="green" />
        <StatCard label="Monthly Collection" value={formatCurrency(stats.monthAmount)} accent="blue" />
        <StatCard label="Total Donors" value={String(stats.uniqueDonors)} accent="violet" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Donation Count" value={String(stats.totalCount)} accent="rose" />
        <StatCard label="Today's Count" value={String(stats.todayCount)} accent="amber" />
        <StatCard label="Active Collectors" value={String(collectors.filter((c) => c.active).length)} accent="blue" />
      </div>

      <Card padding="md">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Recent Donations</h3>
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/donations')}>
            View all
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-gray-500 dark:border-line-dark dark:text-gray-400">
                <th className="px-3 py-2 font-medium">Receipt</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Collector</th>
                <th className="px-3 py-2 font-medium">Donor</th>
                <th className="px-3 py-2 font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Mode</th>
              </tr>
            </thead>
            <tbody>
              {recentDonations.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                    No donations yet.
                  </td>
                </tr>
              )}
              {recentDonations.map((d) => (
                <tr key={d.receiptNo} className="border-b border-line last:border-0 hover:bg-gray-50 dark:border-line-dark dark:hover:bg-surface-raised">
                  <td className="px-3 py-2.5 font-mono text-xs font-medium text-gray-900 dark:text-white">{d.receiptNo}</td>
                  <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300">{formatDateTime(d.timestamp)}</td>
                  <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300">{d.collectorName}</td>
                  <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-white">{d.donorName}</td>
                  <td className="px-3 py-2.5 font-semibold text-gray-900 dark:text-white">{formatCurrency(d.amount)}</td>
                  <td className="px-3 py-2.5 capitalize text-gray-600 dark:text-gray-300">{d.paymentMode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
