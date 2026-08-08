import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getMyDonations } from '../services/donations';
import { getDonations } from '../services/admin';
import type { DonationRecord } from '../types';
import { buildReceiptLines } from '../utils/receipt';
import { generateReceiptPdf } from '../utils/receiptPdf';
import { parseSheetTimestamp } from '../utils/format';
import { printReceipt } from '../services/printer';
import { shareReceiptOnWhatsApp } from '../services/whatsapp';
import { base64FromDataUrl, isCapacitorAndroid, saveAndOpenFile } from '../utils/exportFile';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PageLoader } from '../components/PageLoader';
import { useToast } from '../components/Toast';

function donationToEpochMs(donation: DonationRecord): number {
  return parseSheetTimestamp(donation.timestamp)?.getTime() ?? Date.now();
}

export function ReceiptDetails() {
  const { receiptNo } = useParams<{ receiptNo: string }>();
  const navigate = useNavigate();
  const showToast = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';

  const [donation, setDonation] = useState<DonationRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [printing, setPrinting] = useState(false);
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    const load = async () => {
      try {
        const records = isAdmin ? await getDonations() : await getMyDonations();
        if (cancelled) return;
        const found = records.find((r) => r.receiptNo === receiptNo);
        if (found) {
          setDonation(found);
        } else {
          setDonation(null);
          setError(`No receipt found with number ${receiptNo}.`);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load the receipt.');
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, receiptNo, reloadKey]);

  const goBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(isAdmin ? '/admin/donations' : '/my-donations');
    }
  }, [isAdmin, navigate]);

  const handlePrint = async () => {
    if (!donation) return;
    setPrinting(true);
    try {
      const result = await printReceipt({
        receiptNumber: donation.receiptNo,
        donorName: donation.donorName,
        phone: donation.phone,
        address: donation.address,
        amount: donation.amount,
        paymentMode: donation.paymentMode,
        purpose: donation.purpose,
        remarks: donation.remarks,
        collectorName: donation.collectorName,
        date: donationToEpochMs(donation),
      });
      showToast(result.success ? 'Receipt Printed Successfully' : 'Printer is offline or not connected');
    } catch {
      showToast('Printer is offline or not connected');
    } finally {
      setPrinting(false);
    }
  };

  const handleWhatsApp = async () => {
    if (!donation) return;
    setSending(true);
    try {
      const result = await shareReceiptOnWhatsApp({
        receiptNo: donation.receiptNo,
        donorName: donation.donorName,
        phone: donation.phone,
        amount: donation.amount,
        paymentMode: donation.paymentMode,
        purpose: donation.purpose,
        collectorName: donation.collectorName,
        date: donationToEpochMs(donation),
        token: donation.token,
      });
      if (!result.success && result.error) showToast(result.error);
    } finally {
      setSending(false);
    }
  };

  const handlePdf = async () => {
    if (!donation) return;
    setDownloading(true);
    try {
      const doc = generateReceiptPdf({
        receiptNo: donation.receiptNo,
        donorName: donation.donorName,
        amount: donation.amount,
        paymentMode: donation.paymentMode,
        purpose: donation.purpose,
        collectorName: donation.collectorName,
        date: donationToEpochMs(donation),
      });
      const filename = `receipt-${donation.receiptNo}.pdf`;

      if (isCapacitorAndroid()) {
        try {
          const location = await saveAndOpenFile({
            filename,
            data: base64FromDataUrl(doc.output('dataurlstring')),
            mimeType: 'application/pdf',
          });
          showToast(`Saved ${filename} to ${location.replace(/^file:\/\//, '')}`);
        } catch (err) {
          showToast(
            err instanceof Error ? `Could not save ${filename}: ${err.message}` : `Could not save ${filename}`,
          );
        }
      } else {
        doc.save(filename);
      }
    } finally {
      setDownloading(false);
    }
  };

  if (error && !donation) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300" role="alert">
          <div className="flex items-center justify-between gap-3">
            <p>{error}</p>
            <Button variant="secondary" size="sm" className="shrink-0" onClick={() => setReloadKey((k) => k + 1)}>
              Retry
            </Button>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={goBack}>
          &larr; Back
        </Button>
      </div>
    );
  }

  if (!donation) {
    return <PageLoader />;
  }

  const lines = buildReceiptLines({
    receiptNo: donation.receiptNo,
    donorName: donation.donorName,
    amount: donation.amount,
    paymentMode: donation.paymentMode,
    purpose: donation.purpose,
    collectorName: donation.collectorName,
    date: donationToEpochMs(donation),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Receipt</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {donation.receiptNo} &middot; {donation.donorName}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={goBack}>
          &larr; Back
        </Button>
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

      <Card padding="md">
        <div className="flex flex-wrap gap-3">
          <Button onClick={handlePrint} disabled={printing}>
            {printing ? 'Printing…' : 'Reprint Receipt'}
          </Button>
          <Button variant="success" onClick={handleWhatsApp} disabled={sending}>
            {sending ? 'Opening…' : 'Send WhatsApp'}
          </Button>
          <Button variant="secondary" onClick={handlePdf} disabled={downloading}>
            {downloading ? 'Saving…' : 'Download PDF'}
          </Button>
          <Button variant="ghost" onClick={goBack}>
            Back
          </Button>
        </div>
      </Card>
    </div>
  );
}
