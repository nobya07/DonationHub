import { Capacitor } from '@capacitor/core';

/**
 * Origin of the backend API. The website (Vercel) is served from the same
 * origin as the API, so the web build uses relative URLs. The native Android
 * app serves bundled assets locally (https://localhost), so API requests
 * must target the deployed backend origin explicitly.
 */
const BACKEND_ORIGIN = 'https://donationhub-gamma.vercel.app';

export const API_BASE_URL = Capacitor.isNativePlatform()
  ? BACKEND_ORIGIN
  : '';
