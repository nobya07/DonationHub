import { useEffect, useState } from 'react';

const PROBE_INTERVAL_MS = 20_000;
const PROBE_TIMEOUT_MS = 5_000;

async function probeOnline(): Promise<boolean> {
  if (!navigator.onLine) return false;
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const response = await fetch('/api/verify', {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    });
    window.clearTimeout(timer);
    // Any HTTP response means the server is reachable.
    void response;
    return true;
  } catch {
    return false;
  }
}

/**
 * Tracks real connectivity: navigator.onLine events plus a periodic probe of
 * the backend, so a dead Wi-Fi link (still "online" per the browser) is
 * detected as offline.
 */
export function useNetworkStatus(): boolean {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const result = await probeOnline();
      if (!cancelled) setOnline(result);
    };

    const handleOnline = () => {
      setOnline(true);
      void check();
    };
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    void check();

    const id = window.setInterval(() => void check(), PROBE_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.clearInterval(id);
    };
  }, []);

  return online;
}
