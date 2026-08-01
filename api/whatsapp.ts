import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './utils/guard.js';
import {
  buildReceiptMessage,
  getWhatsAppConfig,
  normalizePhone,
  sendTextMessage,
} from './utils/whatsapp.js';
import { recordWhatsAppMessage } from './utils/sheets.js';

interface SendReceiptBody {
  receiptNo?: string;
  donorName?: string;
  phone?: string;
  amount?: string;
  paymentMode?: string;
  purpose?: string;
  collectorName?: string;
  date?: string;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method not allowed' });
    return;
  }

  const session = requireAuth(req, res);
  if (!session) return;

  const body = (req.body ?? {}) as SendReceiptBody;

  if (!body.phone) {
    res.status(400).json({ message: 'Phone number is required' });
    return;
  }

  try {
    const { countryCode } = getWhatsAppConfig();
    const to = normalizePhone(body.phone, countryCode);

    const message = buildReceiptMessage({
      receiptNo: body.receiptNo ?? '',
      donorName: body.donorName ?? '',
      phone: body.phone,
      amount: body.amount ?? '',
      paymentMode: body.paymentMode ?? '',
      purpose: body.purpose ?? '',
      collectorName: body.collectorName ?? '',
      date: body.date ?? '',
    });

    const { messageId } = await sendTextMessage(to, message);

    try {
      await recordWhatsAppMessage(messageId, body.receiptNo ?? '', to);
    } catch (recordError) {
      console.error('Failed to record WhatsApp message:', recordError);
    }

    res.status(200).json({
      success: true,
      messageId,
      status: 'sent',
      to,
    });
  } catch (error) {
    res.status(500).json({
      message:
        error instanceof Error
          ? error.message
          : 'Failed to send WhatsApp message',
    });
  }
}
