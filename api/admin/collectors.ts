import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getAllCollectors,
  addCollector,
  type Collector,
} from '../utils/sheets.js';
import { requireAdmin } from '../utils/guard.js';

interface CollectorBody {
  username?: string;
  password?: string;
  collectorName?: string;
  role?: string;
  active?: boolean;
}

function toPublicCollector(collector: Collector) {
  return {
    collectorId: collector.collectorId,
    username: collector.username,
    collectorName: collector.collectorName,
    role: collector.role,
    active: collector.active,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = requireAdmin(req, res);

  if (!session) return;

  try {
    if (req.method === 'GET') {
      const collectors = await getAllCollectors();

      return res.status(200).json({
        collectors: collectors.map(toPublicCollector),
      });
    }

    if (req.method === 'POST') {
      const body = req.body as CollectorBody;

      const username = body.username?.trim() ?? '';
      const password = body.password ?? '';
      const collectorName = body.collectorName?.trim() ?? '';
      const role = body.role === 'Admin' ? 'Admin' : 'Collector';

      if (!username || !password || !collectorName) {
        return res.status(400).json({
          message: 'Username, password and collector name are required',
        });
      }

      const collector = await addCollector({
        username,
        password,
        collectorName,
        role,
        active: body.active === true,
      });

      return res.status(201).json(toPublicCollector(collector));
    }

    return res.status(405).json({ message: 'Method not allowed' });
  } catch (error) {
    if (error instanceof Error && error.message === 'Username already exists') {
      return res.status(400).json({ message: error.message });
    }

    console.error('Admin collectors error:', error);
    return res.status(500).json({ message: 'Failed to manage collectors' });
  }
}
