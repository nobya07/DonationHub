import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAllDonations } from '../utils/sheets.js';
import {
  createReceiptToken,
  isReceiptToken,
} from '../utils/receiptToken.js';
import { applyCorsHeaders, sendCorsPreflight } from '../utils/cors.js';

/**
 * Public receipt lookup: GET /api/receipt/:token
 *
 * No authentication. The token is an unpredictable HMAC derived from the
 * receipt number, so only a holder of the exact link can view that one
 * receipt. The response contains only the fields the receipt displays.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (sendCorsPreflight(req, res)) return;
  applyCorsHeaders(req, res);

  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const token = String(req.query.token ?? '').toLowerCase();

  if (!isReceiptToken(token)) {
    return res.status(404).json({ message: 'Receipt not found' });
  }

  try {
    const donations = await getAllDonations();

    const match = donations.find(
      (d) => createReceiptToken(d.receiptNo) === token,
    );

    if (!match) {
      return res.status(404).json({ message: 'Receipt not found' });
    }

    return res.status(200).json({
      receipt: {
        receiptNo: match.receiptNo,
        donorName: match.donorName,
        amount: Number(match.amount) || 0,
        paymentMode: match.paymentMode,
        purpose: match.purpose,
        collectorName: match.collectorName,
        timestamp: match.timestamp,
      },
    });
  } catch (error) {
    console.error('Receipt lookup error:', error);
    return res
      .status(500)
      .json({ message: 'Failed to load the receipt.' });
  }
}
