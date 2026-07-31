import { useEffect, useMemo, useState } from 'react';
import { getMyDonations } from '../../services/donations';
import type { DonationRecord } from '../../types';
import { Card } from '../../components/ui/Card';
import { StatCard } from '../../components/StatCard';
import { PageLoader } from '../../components/PageLoader';
import { formatCurrency, formatDateTime, isToday } from '../../utils/format';

export function MyDonations() {
  const [donations, setDonations] = useState<DonationRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyDonations()
      .then(setDonations)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load donations');
        setDonations([]);
      });
  }, []);

  const todayTotal = useMemo(
    () => (donations ?? []).filter((d) => isToday(d.timestamp)).reduce((sum, d) => sum + d.amount, 0),
    [donations],
  );

  const totalCollected = useMemo(
    () => (donations ?? []).reduce((sum, d) => sum + d.amount, 0),
    [donations],
  );

  if (!donations) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">My Donations</h2>
        <p className="mt-1 text-sm text-gray-500">
          Donations collected by you.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Today's Collections" value={formatCurrency(todayTotal)} accent="primary" />
        <StatCard label="Total Donations" value={String(donations.length)} accent="blue" />
        <StatCard label="Total Collected" value={formatCurrency(totalCollected)} accent="green" />
      </div>

      <Card padding="md">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 font-medium">Receipt Number</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Donor Name</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Payment Mode</th>
                <th className="px-3 py-2 font-medium">Purpose</th>
                <th className="px-3 py-2 font-medium">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {donations.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-gray-500">
                    No donations found.
                  </td>
                </tr>
              )}
              {donations.map((d) => (
                <tr key={d.receiptNo} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2.5 font-mono text-xs font-medium text-gray-900">{d.receiptNo}</td>
                  <td className="px-3 py-2.5 text-gray-600">{formatDateTime(d.timestamp)}</td>
                  <td className="px-3 py-2.5 font-medium text-gray-900">{d.donorName}</td>
                  <td className="px-3 py-2.5 text-gray-600">{d.phone}</td>
                  <td className="px-3 py-2.5 font-semibold text-gray-900">{formatCurrency(d.amount)}</td>
                  <td className="px-3 py-2.5 capitalize text-gray-600">{d.paymentMode}</td>
                  <td className="px-3 py-2.5 text-gray-600">{d.purpose || '-'}</td>
                  <td className="px-3 py-2.5 text-gray-600">{d.remarks || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
