import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';
import { formatCurrency, formatISTReceiptDate } from '../utils/format';

export interface WhatsAppReceiptPayload {
  receiptNo: string;
  donorName: string;
  phone: string;
  amount: number;
  paymentMode: string;
  purpose: string;
  collectorName: string;
  /** Epoch milliseconds (IST wall time) of the donation. */
  date: number;
}

export interface WhatsAppShareResult {
  success: boolean;
  error?: string;
}

/**
 * Cleans a raw phone number and converts it to an Indian mobile number in
 * international format (91XXXXXXXXXX). Accepts:
 *   9876543210, +919876543210, 919876543210, 09876543210
 * Returns null when the number is not a valid Indian mobile number.
 */
export function normalizeIndianPhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s\-()+]/g, '');

  if (!/^\d+$/.test(cleaned) || cleaned.length < 10) return null;

  let digits = cleaned;

  if (digits.length === 10) {
    digits = `91${digits}`;
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = `91${digits.slice(1)}`;
  } else if (digits.length === 12 && digits.startsWith('91')) {
    // already in international format
  } else {
    return null;
  }

  // Indian mobile numbers: 10 digits, first digit 6-9.
  const national = digits.slice(2);

  if (!/^[6-9]\d{9}$/.test(national)) return null;

  return digits;
}

const PAYMENT_MODE_LABELS: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
};

function paymentModeLabel(mode: string): string {
  const lower = mode.trim().toLowerCase();

  if (PAYMENT_MODE_LABELS[lower]) return PAYMENT_MODE_LABELS[lower]!;

  if (!lower) return '-';

  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Builds the WhatsApp receipt message with WhatsApp's *bold* formatting. */
export function buildReceiptMessage(input: WhatsAppReceiptPayload): string {
  const separator = '━━━━━━━━━━━━━━━━━━';

  return [
    '🛕 *DONATION RECEIPT*',
    '',
    separator,
    '',
    '🙏 *Thank You for Your Donation!*',
    '',
    `Dear *${input.donorName}*,`,
    '',
    'Your contribution has been received successfully.',
    '',
    `🧾 *Receipt No:* ${input.receiptNo}`,
    '',
    `💰 *Amount:* ${formatCurrency(input.amount)}`,
    '',
    `💳 *Payment Mode:* ${paymentModeLabel(input.paymentMode)}`,
    '',
    `🎯 *Purpose:* ${input.purpose.trim() || '-'}`,
    '',
    `📅 *Date:* ${formatISTReceiptDate(input.date)}`,
    '',
    `👤 *Collector:* ${input.collectorName}`,
    '',
    separator,
    '',
    '🌸 Your generosity helps us continue our service.',
    '',
    'May God bless you and your family with happiness, prosperity and good health.',
    '',
    '🙏 Thank you for your support.',
    '',
    '*अष्टविनायक युवक मंडळ*',
  ].join('\n');
}

/**
 * Opens the collector's installed WhatsApp app with the donor's chat open
 * and the receipt message pre-filled, so the collector only presses Send.
 * On the web it uses the official https://wa.me/ link instead.
 */
export async function shareReceiptOnWhatsApp(
  input: WhatsAppReceiptPayload,
): Promise<WhatsAppShareResult> {
  if (!input.phone.trim()) {
    return {
      success: false,
      error: 'Phone number is required to share the receipt on WhatsApp.',
    };
  }

  const phone = normalizeIndianPhone(input.phone);

  if (!phone) {
    return {
      success: false,
      error: 'Invalid phone number. Please enter a valid Indian mobile number (e.g. 9876543210).',
    };
  }

  const message = buildReceiptMessage(input);
  const waMeUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  if (Capacitor.isNativePlatform()) {
    // Direct intent to WhatsApp: only WhatsApp handles the whatsapp://
    // scheme, so a failed launch reliably means it is not installed.
    const result = await AppLauncher.openUrl({
      url: `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`,
    });

    if (!result.completed) {
      return {
        success: false,
        error: 'WhatsApp is not installed on this device.',
      };
    }

    return { success: true };
  }

  const opened = window.open(waMeUrl, '_blank');

  if (!opened) {
    return {
      success: false,
      error: 'Could not open WhatsApp. Please allow pop-ups for this site and try again.',
    };
  }

  return { success: true };
}
