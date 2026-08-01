import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './utils/guard.js';
import {
  buildReceiptMessage,
  getWhatsAppConfig,
  normalizePhone,
  sendTextMessage,
} from './utils/whatsapp.js';
import {
  recordWhatsAppMessage,
  updateWhatsAppMessageStatus,
  getWhatsAppMessageStatus,
} from './utils/sheets.js';

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

interface WhatsAppWebhookBody {
  entry?: Array<{
    changes?: Array<{
      value?: {
        statuses?: Array<{
          id?: string;
          status?: string;
        }>;
      };
    }>;
  }>;
}

async function handleSendReceipt(req: VercelRequest, res: VercelResponse) {
  const body = (req.body ?? {}) as SendReceiptBody;

  if (!body.phone) {
    return res.status(400).json({ message: 'Phone number is required' });
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

    return res.status(200).json({
      success: true,
      messageId,
      status: 'sent',
      to,
    });
  } catch (error) {
    return res.status(500).json({
      message:
        error instanceof Error
          ? error.message
          : 'Failed to send WhatsApp message',
    });
  }
}

async function handleGetStatus(req: VercelRequest, res: VercelResponse) {
  const messageId = req.query.messageId;

  if (typeof messageId !== 'string' || !messageId) {
    return res.status(400).json({ message: 'messageId is required' });
  }

  try {
    const status = await getWhatsAppMessageStatus(messageId);

    if (!status) {
      return res.status(404).json({ message: 'Message not found' });
    }

    return res.status(200).json({ messageId, status });
  } catch (error) {
    return res.status(500).json({
      message:
        error instanceof Error
          ? error.message
          : 'Failed to fetch message status',
    });
  }
}

async function handleWebhook(req: VercelRequest, res: VercelResponse) {
  try {
    const body = (req.body ?? {}) as WhatsAppWebhookBody;

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const statuses = change.value?.statuses ?? [];

        for (const status of statuses) {
          if (status.id && status.status) {
            await updateWhatsAppMessageStatus(status.id, status.status);
          }
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    return res.status(500).json({ message: 'Failed to process webhook' });
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method === 'GET' && req.query['hub.mode']) {
    const mode = req.query['hub.mode'];
    const verifyToken = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (
      mode === 'subscribe' &&
      verifyToken === process.env.WHATSAPP_VERIFY_TOKEN &&
      typeof challenge === 'string'
    ) {
      res.status(200).send(challenge);
      return;
    }

    res.status(403).json({ message: 'Webhook verification failed' });
    return;
  }

  const action = req.query.action;

  if (req.method === 'POST') {
    const webhookBody = (req.body ?? {}) as WhatsAppWebhookBody;

    if (action === 'webhook' || Array.isArray(webhookBody.entry)) {
      return handleWebhook(req, res);
    }
  }

  const session = requireAuth(req, res);
  if (!session) return;

  if (req.method === 'POST' && action === 'send-receipt') {
    return handleSendReceipt(req, res);
  }

  if (req.method === 'GET' && action === 'status') {
    return handleGetStatus(req, res);
  }

  res.status(400).json({ message: 'Unknown route' });
}
