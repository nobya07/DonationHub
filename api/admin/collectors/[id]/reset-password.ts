import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resetCollectorPassword, getCollectorById } from '../../../utils/sheets.js';
import { requireAdmin } from '../../../utils/guard.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = requireAdmin(req, res);

  if (!session) return;

  const { id } = req.query;

  if (typeof id !== 'string' || !id.trim()) {
    return res.status(400).json({ message: 'Invalid collector id' });
  }

  try {
    const existing = await getCollectorById(id);

    if (!existing) {
      return res.status(404).json({ message: 'Collector not found' });
    }

    const { newPassword } = req.body as { newPassword?: string };

    if (!newPassword || newPassword.trim().length < 4) {
      return res.status(400).json({
        message: 'New password must be at least 4 characters',
      });
    }

    await resetCollectorPassword(id, newPassword.trim());

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ message: 'Failed to reset password' });
  }
}
