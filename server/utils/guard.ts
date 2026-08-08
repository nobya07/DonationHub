import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  verifySessionToken,
  getTokenFromCookies,
  type SessionPayload,
} from './session.js';
import { getCollectorById } from './sheets.js';

export const SESSION_REPLACED_CODE = 'SESSION_REPLACED';
export const SESSION_REPLACED_MESSAGE =
  'Your account has been logged in on another device.';

export type AuthResult =
  | { session: SessionPayload }
  | { reason: 'no-token' | 'invalid-token' | 'session-replaced' | 'not-found' };

/**
 * Validates the request's JWT and the active single-device session: the
 * session id embedded in the token must match the latest session stored in
 * the database for that user. A mismatch means another device took over the
 * login, so the request is rejected.
 */
export async function authenticate(req: VercelRequest): Promise<AuthResult> {
  const token = getTokenFromCookies(req.headers.cookie);

  if (!token) return { reason: 'no-token' };

  const payload = verifySessionToken(token);

  if (!payload || typeof payload.sessionId !== 'string') {
    return { reason: 'invalid-token' };
  }

  const collector = await getCollectorById(payload.collectorId);

  if (!collector) return { reason: 'not-found' };

  if (!collector.sessionId || collector.sessionId !== payload.sessionId) {
    return { reason: 'session-replaced' };
  }

  return { session: payload };
}

export async function getSession(
  req: VercelRequest
): Promise<SessionPayload | null> {
  const result = await authenticate(req);

  return 'session' in result ? result.session : null;
}

export async function requireAuth(
  req: VercelRequest,
  res: VercelResponse
): Promise<SessionPayload | null> {
  const result = await authenticate(req);

  if ('session' in result) return result.session;

  if (result.reason === 'session-replaced') {
    res.status(401).json({
      code: SESSION_REPLACED_CODE,
      message: SESSION_REPLACED_MESSAGE,
    });
    return null;
  }

  res.status(401).json({ message: 'Not authenticated' });
  return null;
}

export async function requireAdmin(
  req: VercelRequest,
  res: VercelResponse
): Promise<SessionPayload | null> {
  const session = await requireAuth(req, res);

  if (!session) return null;

  if (session.role !== 'Admin') {
    res.status(403).json({ message: 'Admin access required' });
    return null;
  }

  return session;
}
