import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { API_BASE_URL } from '../services/api';
import { buildReceiptLines } from '../utils/receipt';
import { parseSheetTimestamp } from '../utils/format';
import { Card } from '../components/ui/Card';
import { PageLoader } from '../components/PageLoader';
import { CollectorRoute } from '../components/CollectorRoute';
import { CollectorLayout } from '../layouts/CollectorLayout';
import { ReceiptDetails } from './ReceiptDetails';

const RECEIPT_TOKEN_PATTERN = /^[0-9a-f]{32}$/;

interface PublicReceiptData {
  receiptNo: string;
  donorName: string;
  amount: number;
  paymentMode: string;
  purpose: string;
  collectorName: string;
  timestamp: string;
}

export function PublicReceipt() {
  const { receiptNo } = useParams<{ receiptNo: string }>();
  const [receipt, setReceipt] = useState<PublicReceiptData | null>(null);
  const [error, setError] = useState(false);

  const isToken = receiptNo ? RECEIPT_TOKEN_PATTERN.test(receiptNo) : false;

  useEffect(() => {
    if (!isToken || !receiptNo) return;

    let active = true;
    setError(false);
    setReceipt(null);

    fetch(`${API_BASE_URL}/api/receipt/${encodeURIComponent(receiptNo)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Receipt not found');
        const data = (await response.json()) as { receipt: PublicReceiptData };
        if (active) setReceipt(data.receipt);
      })
      .catch(() => {
        if (active) setError(true);
      });

    return () => {
      active = false;
    };
  }, [receiptNo, isToken]);

  if (!receiptNo) {
    return <Navigate to="/" replace />;
  }

  if (!isToken) {
    // Collector receipt page: same URL and layout as before, but rendered
    // here so the /receipt/:receiptNo public route can share the path.
    return (
      <Routes>
        <Route
          element={
            <CollectorRoute>
              <CollectorLayout />
            </CollectorRoute>
          }
        >
          <Route index element={<ReceiptDetails />} />
        </Route>
      </Routes>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
          role="alert"
        >
          <p>Receipt not found. Please check the link and try again.</p>
        </div>
      </div>
    );
  }

  if (!receipt) {
    return <PageLoader />;
  }

  const lines = buildReceiptLines({
    receiptNo: receipt.receiptNo,
    donorName: receipt.donorName,
    amount: receipt.amount,
    paymentMode: receipt.paymentMode,
    purpose: receipt.purpose,
    collectorName: receipt.collectorName,
    date: parseSheetTimestamp(receipt.timestamp)?.getTime() ?? Date.now(),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Receipt</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {receipt.receiptNo} &middot; {receipt.donorName}
          </p>
        </div>
      </div>

      <Card padding="md">
        <div className="flex justify-center">
          <div className="w-full max-w-sm overflow-x-auto rounded-lg border border-line bg-surface px-6 py-5 font-mono text-[13px] leading-relaxed text-gray-900 dark:border-line-dark dark:bg-surface-dark dark:text-gray-100">
            {lines.map((line, i) => (
              <div
                key={i}
                className={
                  (line.align === 'center' ? 'text-center ' : '') +
                  (line.segments.every((s) => s.text.trim() === '') ? 'h-4' : '')
                }
              >
                {line.segments.map((segment, j) =>
                  segment.bold ? (
                    <strong key={j}>{segment.text}</strong>
                  ) : (
                    <span key={j}>{segment.text}</span>
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
