import type { VercelRequest, VercelResponse } from '@vercel/node';
import { clearSessionCookie } from '../server/utils/session.js';
import {
  applyCorsHeaders,
  isCrossOriginRequest,
  sendCorsPreflight,
} from '../server/utils/cors.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (sendCorsPreflight(req, res)) return;
  applyCorsHeaders(req, res);

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    res.setHeader('Set-Cookie', clearSessionCookie(isCrossOriginRequest(req)));
    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}
