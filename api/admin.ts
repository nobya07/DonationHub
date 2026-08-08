import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getAllCollectors,
  addCollector,
  updateCollector,
  deleteCollectorRow,
  getCollectorById,
  getAllDonations,
  resetCollectorPassword,
  type Collector,
} from './utils/sheets.js';
import { requireAdmin } from './utils/guard.js';
import { createReceiptToken } from './utils/receiptToken.js';
import { applyCorsHeaders, sendCorsPreflight } from './utils/cors.js';

interface CollectorBody {
  username?: string;
  password?: string;
  collectorName?: string;
  role?: string;
  active?: boolean;
}

interface CollectorPatchBody {
  username?: string;
  collectorName?: string;
  role?: string;
  active?: boolean;
}

interface ResetPasswordBody {
  newPassword?: string;
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

function dateKey(timestamp: string): string {
  return timestamp.slice(0, 10);
}

async function handleListDonations(req: VercelRequest, res: VercelResponse) {
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

    return res.status(200).json({
      donations: donations.map((d) => ({
        ...d,
        token: createReceiptToken(d.receiptNo),
      })),
    });
  } catch (error) {
    console.error('Admin donations error:', error);
    return res.status(500).json({ message: 'Failed to load donations' });
  }
}

async function handleListCollectors(_req: VercelRequest, res: VercelResponse) {
  try {
    const collectors = await getAllCollectors();

    return res.status(200).json({
      collectors: collectors.map(toPublicCollector),
    });
  } catch (error) {
    console.error('Admin collectors error:', error);
    return res.status(500).json({ message: 'Failed to manage collectors' });
  }
}

async function handleCreateCollector(req: VercelRequest, res: VercelResponse) {
  try {
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
  } catch (error) {
    if (error instanceof Error && error.message === 'Username already exists') {
      return res.status(400).json({ message: error.message });
    }

    console.error('Admin collectors error:', error);
    return res.status(500).json({ message: 'Failed to manage collectors' });
  }
}

async function handleUpdateCollector(
  req: VercelRequest,
  res: VercelResponse,
  id: string
) {
  try {
    const body = req.body as CollectorPatchBody;

    const existing = await getCollectorById(id);

    if (!existing) {
      return res.status(404).json({ message: 'Collector not found' });
    }

    const collector = await updateCollector(id, {
      username: body.username !== undefined ? body.username : undefined,
      collectorName:
        body.collectorName !== undefined ? body.collectorName : undefined,
      role:
        body.role === 'Admin'
          ? 'Admin'
          : body.role === 'Collector'
            ? 'Collector'
            : undefined,
      active: body.active !== undefined ? body.active === true : undefined,
    });

    return res.status(200).json({
      collectorId: collector.collectorId,
      username: collector.username,
      collectorName: collector.collectorName,
      role: collector.role,
      active: collector.active,
    });
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

async function handleDeleteCollector(
  req: VercelRequest,
  res: VercelResponse,
  currentCollectorId: string,
  id: string
) {
  try {
    if (id === currentCollectorId) {
      return res
        .status(400)
        .json({ message: 'Cannot delete your own account' });
    }

    await deleteCollectorRow(id);

    return res.status(200).json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Collector not found') {
      return res.status(404).json({ message: error.message });
    }

    console.error('Admin collector update error:', error);
    return res.status(500).json({ message: 'Failed to update collector' });
  }
}

async function handleResetPassword(
  req: VercelRequest,
  res: VercelResponse,
  id: string
) {
  try {
    const existing = await getCollectorById(id);

    if (!existing) {
      return res.status(404).json({ message: 'Collector not found' });
    }

    const { newPassword } = req.body as ResetPasswordBody;

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

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (sendCorsPreflight(req, res)) return;
  applyCorsHeaders(req, res);

  const session = await requireAdmin(req, res);

  if (!session) return;

  const action = req.query.action;
  const id = typeof req.query.id === 'string' ? req.query.id : '';

  try {
    if (req.method === 'GET' && action === 'donations') {
      return handleListDonations(req, res);
    }

    if (req.method === 'GET' && action === 'collectors') {
      return handleListCollectors(req, res);
    }

    if (req.method === 'POST' && action === 'collectors') {
      return handleCreateCollector(req, res);
    }

    if (action === 'collector') {
      if (!id.trim()) {
        return res.status(400).json({ message: 'Invalid collector id' });
      }

      if (req.method === 'PATCH') {
        return handleUpdateCollector(req, res, id);
      }

      if (req.method === 'DELETE') {
        return handleDeleteCollector(req, res, session.collectorId, id);
      }
    }

    if (req.method === 'POST' && action === 'reset-password') {
      if (!id.trim()) {
        return res.status(400).json({ message: 'Invalid collector id' });
      }

      return handleResetPassword(req, res, id);
    }

    return res.status(400).json({ message: 'Unknown route' });
  } catch (error) {
    console.error('Admin API error:', error);
    return res.status(500).json({ message: 'Failed to process request' });
  }
}
