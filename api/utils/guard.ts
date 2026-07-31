import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  verifySessionToken,
  getTokenFromCookies,
  type SessionPayload,
} from './session.js';

export function getSession(req: VercelRequest): SessionPayload | null {
  const token = getTokenFromCookies(req.headers.cookie);

  if (!token) return null;

  return verifySessionToken(token);
}

export function requireAuth(
  req: VercelRequest,
  res: VercelResponse
): SessionPayload | null {
  const session = getSession(req);

  if (!session) {
    res.status(401).json({ message: 'Not authenticated' });
    return null;
  }

  return session;
}

export function requireAdmin(
  req: VercelRequest,
  res: VercelResponse
): SessionPayload | null {
  const session = getSession(req);

  if (!session) {
    res.status(401).json({ message: 'Not authenticated' });
    return null;
  }

  if (session.role !== 'Admin') {
    res.status(403).json({ message: 'Admin access required' });
    return null;
  }

  return session;
}
