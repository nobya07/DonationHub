import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAllDonations } from '../../server/utils/sheets.js';
import {
  createReceiptToken,
  isReceiptToken,
} from '../../server/utils/receiptToken.js';
import { generateReceiptPdfBuffer } from '../../server/utils/receiptPdf.js';
import { applyCorsHeaders, sendCorsPreflight } from '../../server/utils/cors.js';
import { parseSheetTimestamp } from '../../frontend/src/utils/format.js';

/**
 * Public receipt PDF: GET /api/receipt/:token
 *
 * No authentication. The token is an unpredictable HMAC derived from the
 * receipt number, so only a holder of the exact link can download that one
 * receipt. The response is the receipt rendered as a PDF, inline.
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

    const pdf = await generateReceiptPdfBuffer({
      receiptNo: match.receiptNo,
      donorName: match.donorName,
      amount: Number(match.amount) || 0,
      paymentMode: match.paymentMode,
      purpose: match.purpose,
      collectorName: match.collectorName,
      date: parseSheetTimestamp(match.timestamp)?.getTime() ?? Date.now(),
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${match.receiptNo}.pdf"`);
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    return res.status(200).send(Buffer.from(pdf));
  } catch (error) {
    console.error('Receipt PDF error:', error);
    return res
      .status(500)
      .json({ message: 'Failed to generate the receipt.' });
  }
}
