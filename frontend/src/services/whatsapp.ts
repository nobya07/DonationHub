import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';
import { buildWhatsAppReceipt } from '../utils/receipt';
import { API_ORIGIN } from './api';

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
  /** Secure token; appends a clickable "View Receipt" link to the message. */
  token?: string;
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

/** Builds the WhatsApp receipt message from the shared receipt template. */
export function buildReceiptMessage(input: WhatsAppReceiptPayload): string {
  const receipt = buildWhatsAppReceipt({
    receiptNo: input.receiptNo,
    donorName: input.donorName,
    amount: input.amount,
    paymentMode: input.paymentMode,
    purpose: input.purpose,
    collectorName: input.collectorName,
    date: input.date,
  });

  if (!input.token) return receipt;

  return `${receipt}\n\nView Receipt:\n${API_ORIGIN}/api/receipt/${input.token}`;
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
