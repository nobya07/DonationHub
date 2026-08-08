const GRAPH_API_BASE = 'https://graph.facebook.com';
const GRAPH_API_VERSION = 'v21.0';

export interface WhatsAppConfig {
  token: string;
  phoneNumberId: string;
  countryCode: string;
}

export function getWhatsAppConfig(): WhatsAppConfig {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    throw new Error(
      'WhatsApp is not configured. Set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID environment variables.'
    );
  }

  return {
    token,
    phoneNumberId,
    countryCode: process.env.WHATSAPP_COUNTRY_CODE ?? '91',
  };
}

export function normalizePhone(raw: string, countryCode: string): string {
  const digits = raw.replace(/\D/g, '');

  if (digits.length === 10) {
    return `${countryCode}${digits}`;
  }

  if (digits.length === 12 && digits.startsWith(countryCode)) {
    return digits;
  }

  throw new Error('Invalid phone number. A 10-digit number is required.');
}

/**
 * Formats the amount in Indian Rupees. The app already sends a formatted
 * value (e.g. "₹1,250"); any other numeric value is formatted here so the
 * receipt always shows the rupee symbol and Indian grouping.
 */
function formatAmountForMessage(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) return '';

  if (trimmed.includes('₹')) return trimmed;

  const numeric = Number(trimmed.replace(/[^0-9.]/g, ''));

  if (!Number.isFinite(numeric)) return trimmed;

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numeric);
}

export async function sendTextMessage(
  to: string,
  body: string
): Promise<{ messageId: string }> {
  const { token, phoneNumberId } = getWhatsAppConfig();

  const response = await fetch(
    `${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body },
      }),
    }
  );

  const data = (await response.json().catch(() => ({}))) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(
      data.error?.message ?? `WhatsApp API request failed (${response.status})`
    );
  }

  const messageId = data.messages?.[0]?.id;

  if (!messageId) {
    throw new Error('WhatsApp API did not return a message id');
  }

  return { messageId };
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
 * Amount in English words, e.g. 1500 -> "One Thousand Five Hundred Rupees
 * Only", 1500.50 -> "One Thousand Five Hundred Rupees and Fifty Paise Only".
 */
function amountInWords(amount: number): string {
  const rounded = Math.round(amount * 100);
  const rupees = Math.floor(rounded / 100);
  const paise = rounded % 100;

  if (rupees === 0 && paise === 0) return 'Zero Only';

  const parts: string[] = [];

  if (rupees > 0) parts.push(`${integerToWords(rupees)} Rupees`);
  if (paise > 0) parts.push(`${integerToWords(paise)} Paise`);

  return `${parts.join(' and ')} Only`;
}

function paymentModeLabel(mode: string): string {
  const lower = mode.trim().toLowerCase();

  if (lower === 'cash') return 'Cash';
  if (lower === 'upi') return 'UPI';
  if (!lower) return '-';

  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Numeric rupees extracted from a formatted or plain amount string. */
function amountNumber(value: string): number {
  const numeric = Number(value.replace(/[^0-9.]/g, ''));

  return Number.isFinite(numeric) ? numeric : 0;
}

export function buildReceiptMessage(input: {
  receiptNo: string;
  donorName: string;
  phone: string;
  amount: string;
  paymentMode: string;
  purpose: string;
  collectorName: string;
  date: string;
}): string {
  const amount = formatAmountForMessage(input.amount);
  const words = amountInWords(amountNumber(input.amount));
  const purpose = input.purpose.trim() || '-';

  return [
    '|| श्री गजानन प्रसन्न ||',
    '',
    'वडगावचा अष्टविनायक',
    '',
    '*श्री सार्वजनिक गणेश उत्सव मंडळ*',
    'अष्टविनायक नगर, येळूर रोड,',
    'वडगाव, बेळगाव.',
    '',
    `पावती नं.: *${input.receiptNo}*`,
    `श्री. रा. रा *${input.donorName}* ,`,
    'यांच्याकडून',
    `आज अक्षरी रुपये *${words}* रोख पोहोचले.`,
    '',
    `*रक्कम:* ${amount}`,
    `*पेमेंट पद्धत:* ${paymentModeLabel(input.paymentMode)}`,
    `*देणगी:* ${purpose}`,
    `*तारीख:* ${input.date}`,
    `*Collector:* ${input.collectorName}`,
    '',
    '━━━━━━━━━━━━━━━━━━',
    '',
    'परमेश्वर तुम्हाला आणि तुमच्या कुटुंबियांना सुख, समृद्धी आणि उत्तम आरोग्य देवो.',
    'धन्यवाद.',
    '',
    '*अष्टविनायक युवक मंडळ*',
  ].join('\n');
}
