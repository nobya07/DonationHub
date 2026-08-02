import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getNextReceiptNumber,
  appendDonation,
  getAllDonations,
} from './utils/sheets.js';
import { requireAuth } from './utils/guard.js';
import { formatISTTimestamp } from './utils/time.js';

interface DonationBody {
  donorName?: string;
  phone?: string;
  address?: string;
  amount?: string;
  paymentMode?: string;
  purpose?: string;
  remarks?: string;
}

const REQUIRED_FIELDS = ['donorName', 'phone', 'amount', 'paymentMode'] as const;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = requireAuth(req, res);

  if (!session) return;

  try {
    if (req.method === 'GET') {
      const donations = await getAllDonations();

      const sessionDonations =
        session.role === 'Admin'
          ? donations
          : donations.filter(
              (d) => d.collectorId === session.collectorId
            );

      sessionDonations.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      return res.status(200).json({ donations: sessionDonations });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ message: 'Method not allowed' });
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
    const timestamp = formatISTTimestamp();

    await appendDonation({
      timestamp,
      receiptNo,
      collectorId: session.collectorId,
      collectorName: session.collectorName,
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
