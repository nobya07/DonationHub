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
  const lines = [
    '*DONATIONHUB - Donation Receipt*',
    '',
    `Receipt No: ${input.receiptNo}`,
    `Date: ${input.date}`,
    `Collected By: ${input.collectorName}`,
    '------------------------------',
    `Donor: ${input.donorName}`,
    `Phone: ${input.phone}`,
    `Amount: ${input.amount}`,
    `Mode: ${input.paymentMode}`,
  ];

  if (input.purpose.trim()) {
    lines.push(`Purpose: ${input.purpose}`);
  }

  lines.push('------------------------------');
  lines.push('Thank you for your generous support!');

  return lines.join('\n');
}
