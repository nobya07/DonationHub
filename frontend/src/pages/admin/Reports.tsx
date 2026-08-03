import { useEffect, useMemo, useState } from 'react';
import { getDonations, getCollectors } from '../../services/admin';
import type { AdminCollector, DonationRecord } from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { StatCard } from '../../components/StatCard';
import { PageLoader } from '../../components/PageLoader';
import { formatCurrency, isWithinRange, monthKey, formatMonth, currentMonthStart, todayKey } from '../../utils/format';
import { downloadCsv, toCsv } from '../../utils/csv';
import { useToast } from '../../components/Toast';
import { base64FromUtf8, isCapacitorAndroid, saveAndOpenFile } from '../../utils/exportFile';

export function Reports() {
  const showToast = useToast();
  const [donations, setDonations] = useState<DonationRecord[] | null>(null);
  const [collectors, setCollectors] = useState<AdminCollector[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState(currentMonthStart());
  const [to, setTo] = useState(todayKey());
  const [collectorId, setCollectorId] = useState('');

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

  const report = useMemo(() => {
    const inRange = (donations ?? []).filter(
      (d) =>
        isWithinRange(d.timestamp, from || undefined, to || undefined) &&
        (!collectorId || d.collectorId === collectorId),
    );

    const totalAmount = inRange.reduce((sum, d) => sum + d.amount, 0);
    const uniqueDonors = new Set(inRange.map((d) => d.phone)).size;

    const monthlyMap = new Map<string, { count: number; amount: number }>();

    for (const d of inRange) {
      const key = monthKey(d.timestamp);
      const entry = monthlyMap.get(key) ?? { count: 0, amount: 0 };
      entry.count += 1;
      entry.amount += d.amount;
      monthlyMap.set(key, entry);
    }

    const monthly = [...monthlyMap.entries()]
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => a.key.localeCompare(b.key));

    const collectorMap = new Map<string, { name: string; count: number; amount: number }>();

    for (const d of inRange) {
      const entry = collectorMap.get(d.collectorId) ?? {
        name: d.collectorName,
        count: 0,
        amount: 0,
      };
      entry.count += 1;
      entry.amount += d.amount;
      collectorMap.set(d.collectorId, entry);
    }

    const byCollector = [...collectorMap.entries()]
      .map(([, value]) => value)
      .sort((a, b) => b.amount - a.amount);

    const modeMap = new Map<string, { count: number; amount: number }>();

    for (const d of inRange) {
      const key = d.paymentMode || 'unknown';
      const entry = modeMap.get(key) ?? { count: 0, amount: 0 };
      entry.count += 1;
      entry.amount += d.amount;
      modeMap.set(key, entry);
    }

    const byMode = [...modeMap.entries()]
      .map(([mode, value]) => ({ mode, ...value }))
      .sort((a, b) => b.amount - a.amount);

    return {
      count: inRange.length,
      totalAmount,
      average: inRange.length > 0 ? totalAmount / inRange.length : 0,
      uniqueDonors,
      monthly,
      byCollector,
      byMode,
    };
  }, [donations, from, to, collectorId]);

  const handleExport = async () => {
    const filename = `donation-report-${from}-to-${to}.csv`;
    const headers = ['Month', 'Donations', 'Amount'];
    const rows = report.monthly.map((m) => [formatMonth(m.key), m.count, Number(m.amount.toFixed(2))]);

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
          <h2 className="text-xl font-semibold text-gray-900">Reports</h2>
          <p className="mt-1 text-sm text-gray-500">
            Summarize donations over a period.
          </p>
        </div>
        <Button onClick={handleExport}>Download Report (CSV)</Button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <Card padding="md">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          <Select
            label="Collector"
            options={[
              { value: '', label: 'All Collectors' },
              ...collectors.map((c) => ({ value: c.collectorId, label: c.collectorName })),
            ]}
            value={collectorId}
            onChange={(e) => setCollectorId(e.target.value)}
          />
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Collected" value={formatCurrency(report.totalAmount)} accent="primary" />
        <StatCard label="Donations" value={String(report.count)} accent="blue" />
        <StatCard label="Average Donation" value={formatCurrency(report.average)} accent="amber" />
        <StatCard label="Unique Donors" value={String(report.uniqueDonors)} accent="violet" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card padding="md">
          <h3 className="mb-3 text-base font-semibold text-gray-900">Monthly Collection</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 font-medium">Month</th>
                  <th className="px-3 py-2 font-medium">Donations</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {report.monthly.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-gray-500">
                      No donations in this period.
                    </td>
                  </tr>
                )}
                {report.monthly.map((m) => (
                  <tr key={m.key} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-2.5 font-medium text-gray-900">{formatMonth(m.key)}</td>
                    <td className="px-3 py-2.5 text-gray-600">{m.count}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-gray-900">{formatCurrency(m.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card padding="md">
          <h3 className="mb-3 text-base font-semibold text-gray-900">By Collector</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 font-medium">Collector</th>
                  <th className="px-3 py-2 font-medium">Donations</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {report.byCollector.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-gray-500">
                      No donations in this period.
                    </td>
                  </tr>
                )}
                {report.byCollector.map((c) => (
                  <tr key={c.name} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-2.5 font-medium text-gray-900">{c.name}</td>
                    <td className="px-3 py-2.5 text-gray-600">{c.count}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-gray-900">{formatCurrency(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card padding="md">
        <h3 className="mb-3 text-base font-semibold text-gray-900">By Payment Mode</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 font-medium">Payment Mode</th>
                <th className="px-3 py-2 font-medium">Donations</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {report.byMode.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-gray-500">
                    No donations in this period.
                  </td>
                </tr>
              )}
              {report.byMode.map((m) => (
                <tr key={m.mode} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2.5 font-medium capitalize text-gray-900">{m.mode}</td>
                  <td className="px-3 py-2.5 text-gray-600">{m.count}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-gray-900">{formatCurrency(m.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
