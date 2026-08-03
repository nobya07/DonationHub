import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import { useAuth } from '../../hooks/useAuth';
import { getMyDonations } from '../../services/donations';
import type { DonationRecord } from '../../types';
import { Card } from '../../components/ui/Card';
import { StatCard } from '../../components/StatCard';
import { PageLoader } from '../../components/PageLoader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { useToast } from '../../components/Toast';
import { downloadCsv, toCsv } from '../../utils/csv';
import {
  base64FromDataUrl,
  base64FromUtf8,
  isCapacitorAndroid,
  saveAndOpenFile,
} from '../../utils/exportFile';
import {
  formatCurrency,
  formatDateTime,
  formatISTNow,
  isToday,
  istDateKey,
  parseSheetTimestamp,
  todayKey,
} from '../../utils/format';

type SearchField = 'receiptNo' | 'donorName' | 'phone' | 'date' | 'paymentMode';
type SortBy = 'newest' | 'oldest' | 'amount';

const SEARCH_FIELDS = [
  { value: 'donorName', label: 'Donor Name' },
  { value: 'receiptNo', label: 'Receipt Number' },
  { value: 'phone', label: 'Phone' },
  { value: 'date', label: 'Date' },
  { value: 'paymentMode', label: 'Payment Mode' },
];

const PAYMENT_MODES = [
  { value: '', label: 'All Modes' },
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'amount', label: 'Amount' },
];

const EXPORT_COLUMNS = [
  { header: 'Receipt No', width: 80 },
  { header: 'Date', width: 95 },
  { header: 'Donor Name', width: 80 },
  { header: 'Phone', width: 70 },
  { header: 'Amount', width: 50 },
  { header: 'Mode', width: 40 },
  { header: 'Purpose', width: 60 },
  { header: 'Remarks', width: 40 },
];

/**
 * Renders the Devanagari title on a canvas (the browser applies proper
 * complex-script shaping) and returns a PNG data URL at PDF point size,
 * since jsPDF's built-in fonts cannot render Devanagari glyphs.
 */
function renderDevanagariTitle(
  text: string,
  fontSizePt: number,
): { dataUrl: string; width: number; height: number } | null {
  const scale = 4;
  const fontSizePx = fontSizePt * (96 / 72);
  const font =
    `${fontSizePx * scale}px 'Noto Sans Devanagari', 'Mangal', 'Nirmala UI', 'Sanskrit Text', sans-serif`;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) return null;

  ctx.font = font;
  const width = Math.ceil(ctx.measureText(text).width / scale);
  const height = Math.ceil(fontSizePx * 1.5);
  canvas.width = width * scale;
  canvas.height = height * scale;

  ctx.font = font;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#000';
  ctx.fillText(text, 0, 0);

  return { dataUrl: canvas.toDataURL('image/png'), width, height };
}

function recordDateKey(d: DonationRecord): string {
  return istDateKey(d.timestamp) ?? d.timestamp.slice(0, 10);
}

function recordTime(d: DonationRecord): number {
  return parseSheetTimestamp(d.timestamp)?.getTime() ?? 0;
}

export function MyDonations() {
  const { user } = useAuth();
  const showToast = useToast();
  const [donations, setDonations] = useState<DonationRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [searchField, setSearchField] = useState<SearchField>('donorName');
  const [searchText, setSearchText] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [searchPaymentMode, setSearchPaymentMode] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('newest');

  useEffect(() => {
    setError(null);
    getMyDonations()
      .then(setDonations)
      .catch((err) => {
        setError(
          err instanceof Error
            ? `Could not load your donations. ${err.message}`
            : 'Could not load your donations. Please try again.',
        );
        setDonations([]);
      });
  }, [reloadKey]);

  const filtered = useMemo(() => {
    const list = donations ?? [];
    const query = searchText.trim().toLowerCase();

    const result = list.filter((d) => {
      if (searchField === 'paymentMode') {
        if (searchPaymentMode && d.paymentMode.toLowerCase() !== searchPaymentMode) {
          return false;
        }
        return true;
      }

      if (searchField === 'date') {
        if (!searchDate) return true;
        return recordDateKey(d) === searchDate;
      }

      if (!query) return true;

      const haystack =
        searchField === 'receiptNo'
          ? d.receiptNo
          : searchField === 'phone'
            ? d.phone
            : d.donorName;

      return haystack.toLowerCase().includes(query);
    });

    return result.sort((a, b) => {
      if (sortBy === 'oldest') return recordTime(a) - recordTime(b);
      if (sortBy === 'amount') return b.amount - a.amount;
      return recordTime(b) - recordTime(a);
    });
  }, [donations, searchField, searchText, searchDate, searchPaymentMode, sortBy]);

  const todayTotal = useMemo(
    () => (donations ?? []).filter((d) => isToday(d.timestamp)).reduce((sum, d) => sum + d.amount, 0),
    [donations],
  );

  const totalCollected = useMemo(
    () => (donations ?? []).reduce((sum, d) => sum + d.amount, 0),
    [donations],
  );

  const resetFilters = () => {
    setSearchField('donorName');
    setSearchText('');
    setSearchDate('');
    setSearchPaymentMode('');
    setSortBy('newest');
  };

  const handleExportCsv = async () => {
    const filename = `my-donations-${todayKey()}.csv`;
    const headers = [
      'Receipt No',
      'Date',
      'Donor Name',
      'Phone',
      'Amount',
      'Payment Mode',
      'Purpose',
      'Remarks',
    ];
    const rows = filtered.map((d) => [
      d.receiptNo,
      d.timestamp,
      d.donorName,
      d.phone,
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

  const handleExportPdf = async () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;
    const fontSize = 8.5;
    const lineHeight = fontSize + 3;

    let y = 52;

    const titleImage = renderDevanagariTitle('अष्टविनायक युवक मंडळ - My Donations', 16);
    if (titleImage) {
      doc.addImage(titleImage.dataUrl, 'PNG', margin, y, titleImage.width, titleImage.height);
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('Astavinayak - My Donations', margin, y);
    }
    y += 20;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text(`Collector: ${user?.collectorName ?? ''}`, margin, y);
    doc.text(
      `Exported: ${formatISTNow()} (${filtered.length} donations)`,
      pageWidth - margin,
      y,
      { align: 'right' },
    );
    y += 26;

    doc.setTextColor(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSize);

    const drawRow = (cells: string[], bold?: boolean) => {
      const wrapped = cells.map((cell, i) =>
        doc.splitTextToSize(String(cell), EXPORT_COLUMNS[i]!.width - 8),
      );
      const lines = Math.max(...wrapped.map((w) => w.length));
      const height = Math.max(18, lines * lineHeight + 6);

      if (y + height > 780) {
        doc.addPage();
        y = 50;
        doc.setFont('helvetica', 'bold');
      }

      let x = margin;
      wrapped.forEach((textLines, i) => {
        if (bold) doc.setFont('helvetica', 'bold');
        else doc.setFont('helvetica', 'normal');
        doc.text(textLines, x + 4, y + 13);
        x += EXPORT_COLUMNS[i]!.width;
      });
      y += height;
    };

    drawRow(
      EXPORT_COLUMNS.map((c) => c.header),
      true,
    );
    doc.setDrawColor(200);
    doc.line(margin, y - 8, pageWidth - margin, y - 8);

    filtered.forEach((d) => {
      drawRow([
        d.receiptNo,
        formatDateTime(d.timestamp),
        d.donorName,
        d.phone,
        formatCurrency(d.amount),
        d.paymentMode,
        d.purpose || '-',
        d.remarks || '-',
      ]);
    });

    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.text(
      `Total (${filtered.length} donations): ${formatCurrency(
        filtered.reduce((sum, d) => sum + d.amount, 0),
      )}`,
      pageWidth - margin,
      y,
      { align: 'right' },
    );

    const filename = `my-donations-${todayKey()}.pdf`;

    if (isCapacitorAndroid()) {
      try {
        const location = await saveAndOpenFile({
          filename,
          data: base64FromDataUrl(doc.output('datauristring')),
          mimeType: 'application/pdf',
        });
        showToast(`Saved ${filename} to ${location.replace(/^file:\/\//, '')}`);
      } catch (err) {
        showToast(
          err instanceof Error ? `Could not save ${filename}: ${err.message}` : `Could not save ${filename}`,
        );
      }
      return;
    }

    doc.save(filename);
  };

  if (!donations) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">My Donations</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Donations collected by you. {filtered.length} of {donations.length} shown.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={handleExportCsv} disabled={filtered.length === 0}>
            Export CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExportPdf} disabled={filtered.length === 0}>
            Export PDF
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300" role="alert">
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

      <Card padding="md">
        <div className="grid gap-4 md:grid-cols-4">
          <Select
            label="Search by"
            value={searchField}
            onChange={(e) => setSearchField(e.target.value as SearchField)}
            options={SEARCH_FIELDS}
          />
          {searchField === 'paymentMode' ? (
            <Select
              label="Payment Mode"
              value={searchPaymentMode}
              onChange={(e) => setSearchPaymentMode(e.target.value)}
              options={PAYMENT_MODES}
            />
          ) : searchField === 'date' ? (
            <Input
              label="Date"
              type="date"
              value={searchDate}
              onChange={(e) => setSearchDate(e.target.value)}
            />
          ) : (
            <Input
              label={SEARCH_FIELDS.find((f) => f.value === searchField)?.label ?? 'Search'}
              type="text"
              placeholder={
                searchField === 'phone' ? 'e.g. 98765 43210' : 'Type to search…'
              }
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          )}
          <Select
            label="Sort by"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            options={SORT_OPTIONS}
          />
          <div className="flex items-end">
            <Button variant="ghost" size="sm" className="w-full" onClick={resetFilters}>
              Clear
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Today's Collections" value={formatCurrency(todayTotal)} accent="primary" />
        <StatCard label="Total Donations" value={String(donations.length)} accent="blue" />
        <StatCard label="Total Collected" value={formatCurrency(totalCollected)} accent="green" />
      </div>

      <Card padding="md">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <th className="px-3 py-2 font-medium">Receipt Number</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Donor Name</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Payment Mode</th>
                <th className="px-3 py-2 font-medium">Purpose</th>
                <th className="px-3 py-2 font-medium">Remarks</th>
                <th className="px-3 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                    {donations.length === 0
                      ? 'No donations found.'
                      : 'No donations match your search.'}
                  </td>
                </tr>
              )}
              {filtered.map((d) => (
                <tr key={d.receiptNo} className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-surface-raised">
                  <td className="px-3 py-2.5 font-mono text-xs font-medium text-gray-900 dark:text-white">{d.receiptNo}</td>
                  <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300">{formatDateTime(d.timestamp)}</td>
                  <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-white">{d.donorName}</td>
                  <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300">{d.phone}</td>
                  <td className="px-3 py-2.5 font-semibold text-gray-900 dark:text-white">{formatCurrency(d.amount)}</td>
                  <td className="px-3 py-2.5 capitalize text-gray-600 dark:text-gray-300">{d.paymentMode}</td>
                  <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300">{d.purpose || '-'}</td>
                  <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300">{d.remarks || '-'}</td>
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
      </Card>
    </div>
  );
}
