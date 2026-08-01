import type { VercelRequest, VercelResponse } from '@vercel/node';
import { updateWhatsAppMessageStatus } from '../utils/sheets.js';

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

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method === 'GET') {
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

  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method not allowed' });
    return;
  }

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

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    res.status(500).json({ message: 'Failed to process webhook' });
  }
}
