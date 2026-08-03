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

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n]!;

  const ten = Math.floor(n / 10);
  const one = n % 10;

  return one === 0 ? TENS[ten]! : `${TENS[ten]} ${ONES[one]}`;
}

function threeDigits(n: number): string {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;

  if (hundred === 0) return twoDigits(rest);

  const restWords = rest === 0 ? '' : ` ${twoDigits(rest)}`;

  return `${ONES[hundred]} Hundred${restWords}`;
}

/** Converts an integer to English words using the Indian numbering system. */
function integerToWords(n: number): string {
  if (n === 0) return 'Zero';

  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;

  const parts: string[] = [];

  if (crore > 0) parts.push(`${integerToWords(crore)} Crore`);
  if (lakh > 0) parts.push(`${integerToWords(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${integerToWords(thousand)} Thousand`);
  if (rest > 0) parts.push(threeDigits(rest));

  return parts.join(' ');
}

/**
 * Amount in English words, e.g. 1500 -> "One Thousand Five Hundred Only",
 * 1500.50 -> "One Thousand Five Hundred and Fifty Paise Only".
 */
function amountInWords(amount: number): string {
  const rounded = Math.round(amount * 100);
  const rupees = Math.floor(rounded / 100);
  const paise = rounded % 100;

  if (rupees === 0 && paise === 0) return 'Zero Only';

  const parts: string[] = [];

  if (rupees > 0) parts.push(integerToWords(rupees));
  if (paise > 0) parts.push(`${integerToWords(paise)} Paise`);

  return `${parts.join(' and ')} Only`;
}

/** Numeric amount in the template's style, e.g. "₹ 1,500". */
function formatRupeeAmount(value: number): string {
  const formatted = formatCurrency(value).replace(/^[₹\u00A0\u202F\s]+/, '');

  return `₹ ${formatted}`;
}

/** Builds the WhatsApp receipt message with WhatsApp's *bold* formatting. */
export function buildReceiptMessage(input: WhatsAppReceiptPayload): string {
  const separator = '━━━━━━━━━━━━━━━━━━';

  return [
    '*|| श्री गजानन प्रसन्न ||*',
    '',
    '*श्री अष्टविनायक गणेश उत्सव मंडळ*',
    'अष्टविनायक नगर, येळूर रोड, वडगाव, बेळगाव.',
    '',
    `पावती नं. *${input.receiptNo}*`,
    '',
    `*${input.donorName}*,`,
    'यांच्याकडून',
    '',
    'आज अक्षरी रुपये',
    `*${amountInWords(input.amount)}*`,
    'रोख पोचले.',
    '',
    'आभारी आहोत.',
    '',
    `💰 *रक्कम:* ${formatRupeeAmount(input.amount)}`,
    '',
    `💳 *पेमेंटची पद्धत:* ${paymentModeLabel(input.paymentMode)}`,
    '',
    `🎯 *देणगी:* ${input.purpose.trim() || '-'}`,
    '',
    `📅 *तारीख:* ${formatISTReceiptDate(input.date)}`,
    '',
    `👤 *Collector:* ${input.collectorName}`,
    '',
    separator,
    '',
    'परमेश्वर तुम्हाला आणि तुमच्या कुटुंबियांना सुख, समृद्धी आणि उत्तम आरोग्य देवो.',
    '',
    '🙏 धन्यवाद.',
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
