import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  updateCollector,
  deleteCollectorRow,
  getCollectorById,
} from '../../utils/sheets.js';
import { requireAdmin } from '../../utils/guard.js';

interface CollectorPatchBody {
  username?: string;
  collectorName?: string;
  role?: string;
  active?: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = requireAdmin(req, res);

  if (!session) return;

  const { id } = req.query;

  if (typeof id !== 'string' || !id.trim()) {
    return res.status(400).json({ message: 'Invalid collector id' });
  }

  try {
    if (req.method === 'PATCH') {
      const body = req.body as CollectorPatchBody;

      const existing = await getCollectorById(id);

      if (!existing) {
        return res.status(404).json({ message: 'Collector not found' });
      }

      const collector = await updateCollector(id, {
        username: body.username !== undefined ? body.username : undefined,
        collectorName:
          body.collectorName !== undefined ? body.collectorName : undefined,
        role: body.role === 'Admin' ? 'Admin' : body.role === 'Collector' ? 'Collector' : undefined,
        active: body.active !== undefined ? body.active === true : undefined,
      });

      return res.status(200).json({
        collectorId: collector.collectorId,
        username: collector.username,
        collectorName: collector.collectorName,
        role: collector.role,
        active: collector.active,
      });
    }

    if (req.method === 'DELETE') {
      if (id === session.collectorId) {
        return res.status(400).json({ message: 'Cannot delete your own account' });
      }

      await deleteCollectorRow(id);

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ message: 'Method not allowed' });
  } catch (error) {
    if (error instanceof Error && error.message === 'Collector not found') {
      return res.status(404).json({ message: error.message });
    }

    if (error instanceof Error && error.message === 'Username already exists') {
      return res.status(400).json({ message: error.message });
    }

    console.error('Admin collector update error:', error);
    return res.status(500).json({ message: 'Failed to update collector' });
  }
}
