import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  authenticate,
  SESSION_REPLACED_CODE,
  SESSION_REPLACED_MESSAGE,
} from '../server/utils/guard.js';
import { applyCorsHeaders, sendCorsPreflight } from '../server/utils/cors.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (sendCorsPreflight(req, res)) return;
  applyCorsHeaders(req, res);

  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const result = await authenticate(req);

    if (!('session' in result)) {
      if (result.reason === 'session-replaced') {
        return res.status(401).json({
          code: SESSION_REPLACED_CODE,
          message: SESSION_REPLACED_MESSAGE,
        });
      }

      return res.status(401).json({ message: 'Not authenticated' });
    }

    return res.status(200).json({
      collectorId: result.session.collectorId,
      collectorName: result.session.collectorName,
      username: result.session.username,
      role: result.session.role === 'Admin' ? 'Admin' : 'Collector',
      sessionId: result.session.sessionId,
    });
  } catch (error) {
    console.error('Verify error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}