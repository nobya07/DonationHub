import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../utils/guard.js';
import { getWhatsAppMessageStatus } from '../utils/sheets.js';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'GET') {
    res.status(405).json({ message: 'Method not allowed' });
    return;
  }

  const session = requireAuth(req, res);
  if (!session) return;

  const messageId = req.query.messageId;

  if (typeof messageId !== 'string' || !messageId) {
    res.status(400).json({ message: 'messageId is required' });
    return;
  }

  try {
    const status = await getWhatsAppMessageStatus(messageId);

    if (!status) {
      res.status(404).json({ message: 'Message not found' });
      return;
    }

    res.status(200).json({ messageId, status });
  } catch (error) {
    res.status(500).json({
      message:
        error instanceof Error
          ? error.message
          : 'Failed to fetch message status',
    });
  }
}
