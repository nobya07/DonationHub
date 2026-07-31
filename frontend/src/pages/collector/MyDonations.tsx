import { useEffect, useMemo, useState } from 'react';
import { getMyDonations } from '../../services/donations';
import type { DonationRecord } from '../../types';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { StatCard } from '../../components/StatCard';
import { PageLoader } from '../../components/PageLoader';
import { formatCurrency, formatDateTime, isToday, isWithinRange } from '../../utils/format';

const PAYMENT_MODES = [
  { value: '', label: 'All Modes' },
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
];

export function MyDonations() {
  const [donations, setDonations] = useState<DonationRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    getMyDonations()
      .then(setDonations)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load donations');
        setDonations([]);
      });
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return (donations ?? []).filter((d) => {
      if (
        query &&
        !d.donorName.toLowerCase().includes(query) &&
        !d.phone.toLowerCase().includes(query) &&
        !d.receiptNo.toLowerCase().includes(query)
      ) {
        return false;
      }

      if (paymentMode && d.paymentMode.toLowerCase() !== paymentMode.toLowerCase()) {
        return false;
      }

      if (!isWithinRange(d.timestamp, from || undefined, to || undefined)) {
        return false;
      }

      return true;
    });
  }, [donations, search, paymentMode, from, to]);

  const todayTotal = useMemo(
    () => (donations ?? []).filter((d) => isToday(d.timestamp)).reduce((sum, d) => sum + d.amount, 0),
    [donations],
  );

  const filteredTotal = useMemo(
    () => filtered.reduce((sum, d) => sum + d.amount, 0),
    [filtered],
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
        <StatCard label="Showing Total" value={formatCurrency(filteredTotal)} accent="green" />
      </div>

      <Card padding="md">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="Search"
            type="search"
            placeholder="Donor, phone or receipt"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            label="Payment Mode"
            options={PAYMENT_MODES}
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value)}
          />
          <Input
            label="From Date"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <Input
            label="To Date"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </Card>

      <Card padding="md">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 font-medium">Receipt</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Donor</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Mode</th>
                <th className="px-3 py-2 font-medium">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                    No donations found.
                  </td>
                </tr>
              )}
              {filtered.map((d) => (
                <tr key={d.receiptNo} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2.5 font-mono text-xs font-medium text-gray-900">{d.receiptNo}</td>
                  <td className="px-3 py-2.5 text-gray-600">{formatDateTime(d.timestamp)}</td>
                  <td className="px-3 py-2.5 font-medium text-gray-900">{d.donorName}</td>
                  <td className="px-3 py-2.5 text-gray-600">{d.phone}</td>
                  <td className="px-3 py-2.5 font-semibold text-gray-900">{formatCurrency(d.amount)}</td>
                  <td className="px-3 py-2.5 capitalize text-gray-600">{d.paymentMode}</td>
                  <td className="px-3 py-2.5 text-gray-600">{d.purpose || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
