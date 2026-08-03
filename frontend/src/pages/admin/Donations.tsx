import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDonations, getCollectors } from '../../services/admin';
import type { AdminCollector, DonationRecord } from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { StatCard } from '../../components/StatCard';
import { PageLoader } from '../../components/PageLoader';
import { formatCurrency, formatDateTime, isWithinRange, todayKey } from '../../utils/format';
import { downloadCsv, toCsv } from '../../utils/csv';
import { useToast } from '../../components/Toast';
import { base64FromUtf8, isCapacitorAndroid, saveAndOpenFile } from '../../utils/exportFile';

const PAYMENT_MODES = [
  { value: '', label: 'All Modes' },
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
];

export function Donations() {
  const showToast = useToast();
  const [donations, setDonations] = useState<DonationRecord[] | null>(null);
  const [collectors, setCollectors] = useState<AdminCollector[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [collectorId, setCollectorId] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    Promise.all([getDonations(), getCollectors()])
      .then(([donationData, collectorData]) => {
        setDonations(donationData);
        setCollectors(collectorData);
      })
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

      if (collectorId && d.collectorId !== collectorId) {
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
  }, [donations, search, collectorId, paymentMode, from, to]);

  const totalAmount = useMemo(
    () => filtered.reduce((sum, d) => sum + d.amount, 0),
    [filtered],
  );

  const resetFilters = () => {
    setSearch('');
    setCollectorId('');
    setPaymentMode('');
    setFrom('');
    setTo('');
  };

  const handleExport = async () => {
    const filename = `donations-${todayKey()}.csv`;
    const headers = [
      'Receipt No',
      'Date',
      'Collector ID',
      'Collector',
      'Donor',
      'Phone',
      'Address',
      'Amount',
      'Payment Mode',
      'Purpose',
      'Remarks',
    ];
    const rows = filtered.map((d) => [
      d.receiptNo,
      d.timestamp,
      d.collectorId,
      d.collectorName,
      d.donorName,
      d.phone,
      d.address,
      d.amount,
      d.paymentMode,
      d.purpose,
      d.remarks,
    ]);

    if (isCapacitorAndroid()) {
      try {
        const location = await saveAndOpenFile({
          filename,
          data: base64FromUtf8(toCsv(headers, rows)),
          mimeType: 'text/csv',
        });
        showToast(`Saved ${filename} to ${location.replace(/^file:\/\//, '')}`);
      } catch (err) {
        showToast(
          err instanceof Error ? `Could not save ${filename}: ${err.message}` : `Could not save ${filename}`,
        );
      }
      return;
    }

    downloadCsv(filename, headers, rows);
  };

  if (!donations) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">All Donations</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            View, search and export every donation.
          </p>
        </div>
        <Button onClick={handleExport}>Download CSV</Button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300" role="alert">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Donations in view" value={String(filtered.length)} accent="blue" />
        <StatCard label="Total in view" value={formatCurrency(totalAmount)} accent="primary" />
      </div>

      <Card padding="md">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input
            label="Search"
            type="search"
            placeholder="Donor, phone or receipt"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            label="Collector"
            options={[
              { value: '', label: 'All Collectors' },
              ...collectors.map((c) => ({ value: c.collectorId, label: c.collectorName })),
            ]}
            value={collectorId}
            onChange={(e) => setCollectorId(e.target.value)}
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
          <div className="flex items-end">
            <Button variant="secondary" onClick={resetFilters}>
              Reset Filters
            </Button>
          </div>
        </div>
      </Card>

      <Card padding="md">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-gray-500 dark:border-line-dark dark:text-gray-400">
                <th className="px-3 py-2 font-medium">Receipt</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Collector</th>
                <th className="px-3 py-2 font-medium">Donor</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Mode</th>
                <th className="px-3 py-2 font-medium">Purpose</th>
                <th className="px-3 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                    No donations match your filters.
                  </td>
                </tr>
              )}
              {filtered.map((d) => (
                <tr key={d.receiptNo} className="border-b border-line last:border-0 hover:bg-gray-50 dark:border-line-dark dark:hover:bg-surface-raised">
                  <td className="px-3 py-2.5 font-mono text-xs font-medium text-gray-900 dark:text-white">{d.receiptNo}</td>
                  <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300">{formatDateTime(d.timestamp)}</td>
                  <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300">{d.collectorName}</td>
                  <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-white">{d.donorName}</td>
                  <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300">{d.phone}</td>
                  <td className="px-3 py-2.5 font-semibold text-gray-900 dark:text-white">{formatCurrency(d.amount)}</td>
                  <td className="px-3 py-2.5 capitalize text-gray-600 dark:text-gray-300">{d.paymentMode}</td>
                  <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300">{d.purpose || '-'}</td>
                  <td className="px-3 py-2.5">
                    <Link
                      to={`/admin/receipt/${encodeURIComponent(d.receiptNo)}`}
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
      </Card>
    </div>
  );
}
