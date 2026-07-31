import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySessionToken, getTokenFromCookies } from './utils/session';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const token = getTokenFromCookies(req.headers.cookie);

    if (!token) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const payload = verifySessionToken(token);

    if (!payload) {
      return res.status(401).json({ message: 'Invalid or expired session' });
    }

    return res.status(200).json({
      collectorId: payload.collectorId,
      collectorName: payload.collectorName,
      username: payload.username,
    });
  } catch (error) {
    console.error('Verify error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}
