import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAllDonations } from '../utils/sheets.js';
import { requireAdmin } from '../utils/guard.js';

function dateKey(timestamp: string): string {
  return timestamp.slice(0, 10);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = requireAdmin(req, res);

  if (!session) return;

  try {
    const { collectorId, paymentMode, from, to, search } = req.query;

    let donations = await getAllDonations();

    if (typeof collectorId === 'string' && collectorId.trim() !== '') {
      donations = donations.filter((d) => d.collectorId === collectorId.trim());
    }

    if (typeof paymentMode === 'string' && paymentMode.trim() !== '') {
      const mode = paymentMode.trim().toLowerCase();
      donations = donations.filter(
        (d) => d.paymentMode.trim().toLowerCase() === mode
      );
    }

    if (typeof from === 'string' && from.trim() !== '') {
      donations = donations.filter((d) => dateKey(d.timestamp) >= from.trim());
    }

    if (typeof to === 'string' && to.trim() !== '') {
      donations = donations.filter((d) => dateKey(d.timestamp) <= to.trim());
    }

    if (typeof search === 'string' && search.trim() !== '') {
      const query = search.trim().toLowerCase();

      donations = donations.filter(
        (d) =>
          d.donorName.toLowerCase().includes(query) ||
          d.phone.toLowerCase().includes(query) ||
          d.receiptNo.toLowerCase().includes(query)
      );
    }

    donations.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return res.status(200).json({ donations });
  } catch (error) {
    console.error('Admin donations error:', error);
    return res.status(500).json({ message: 'Failed to load donations' });
  }
}
