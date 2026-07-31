import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getNextReceiptNumber, appendDonation } from './utils/sheets';
import { verifySessionToken, getTokenFromCookies } from './utils/session';

interface DonationBody {
  collectorId?: string;
  collectorName?: string;
  donorName?: string;
  phone?: string;
  address?: string;
  amount?: string;
  paymentMode?: string;
  purpose?: string;
  remarks?: string;
}

const REQUIRED_FIELDS = ['donorName', 'phone', 'amount', 'paymentMode'] as const;

function formatTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const token = getTokenFromCookies(req.headers.cookie);
    const session = token ? verifySessionToken(token) : null;

    if (!session) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const body = req.body as DonationBody;

    const missing = REQUIRED_FIELDS.filter(
      (field) => !body[field] || String(body[field]).trim() === '',
    );

    if (missing.length > 0) {
      return res.status(400).json({
        message: `Required fields missing: ${missing.join(', ')}`,
      });
    }

    const receiptNo = await getNextReceiptNumber();
    const timestamp = formatTimestamp();

    await appendDonation({
      timestamp,
      receiptNo,
      collectorId: body.collectorId ?? session.collectorId,
      collectorName: body.collectorName ?? session.collectorName,
      donorName: body.donorName!.trim(),
      phone: body.phone!.trim(),
      address: (body.address ?? '').trim(),
      amount: String(body.amount).trim(),
      paymentMode: body.paymentMode!.trim(),
      purpose: (body.purpose ?? '').trim(),
      remarks: (body.remarks ?? '').trim(),
    });

    return res.status(200).json({
      success: true,
      receiptNumber: receiptNo,
    });
  } catch (error) {
    console.error('Donation error:', error);
    return res.status(500).json({ message: 'Failed to save donation. Please try again.' });
  }
}
