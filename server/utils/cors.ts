import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Origins that are allowed to call the API cross-origin. The native Android
 * app serves its bundled assets from https://localhost (Capacitor
 * WebViewAssetLoader), so requests from it carry these origins. The website
 * itself is same-origin and never needs CORS.
 */
const ALLOWED_CROSS_ORIGINS = new Set([
  'https://localhost',
  'https://capacitor.localhost',
  'http://localhost',
]);

export function isCrossOriginRequest(req: VercelRequest): boolean {
  const origin = req.headers.origin;

  return typeof origin === 'string' && ALLOWED_CROSS_ORIGINS.has(origin);
}

/** Adds CORS headers when the request comes from the native app. */
export function applyCorsHeaders(req: VercelRequest, res: VercelResponse): void {
  const origin = req.headers.origin;

  if (typeof origin !== 'string' || !ALLOWED_CROSS_ORIGINS.has(origin)) {
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

/** Handles CORS preflight (OPTIONS) requests; returns true when consumed. */
export function sendCorsPreflight(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method !== 'OPTIONS') return false;

  applyCorsHeaders(req, res);
  res.status(204).end();

  return true;
}
