import jwt from 'jsonwebtoken';
import { serialize, parse } from 'cookie';

function getSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET environment variable must be at least 32 characters'
    );
  }

  return secret;
}

export interface SessionPayload {
  collectorId: string;
  username: string;
  collectorName: string;
  role: 'Admin' | 'Collector';
}

export function createSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, getSecret(), {
    expiresIn: '24h',
  });
}

export function verifySessionToken(
  token: string
): SessionPayload | null {
  try {
    return jwt.verify(token, getSecret()) as SessionPayload;
  } catch {
    return null;
  }
}

export function createSessionCookie(
  token: string,
  crossOrigin: boolean
): string {
  return serialize('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // SameSite=None + Secure is required so the cookie is sent on requests
    // from the native app (https://localhost) to the deployed API.
    sameSite: crossOrigin ? 'none' : 'lax',
    path: '/',
    maxAge: 60 * 60 * 24,
  });
}

export function clearSessionCookie(crossOrigin: boolean): string {
  return serialize('session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: crossOrigin ? 'none' : 'lax',
    path: '/',
    maxAge: 0,
  });
}

export function getTokenFromCookies(
  cookieHeader: string | null | undefined
): string | null {
  if (!cookieHeader) return null;

  const cookies = parse(cookieHeader);
  return cookies.session || null;
}