import { Preferences } from '@capacitor/preferences';
import { submitDonation } from './donations';
import type { DonationPayload } from '../types';

const STORAGE_KEY = 'offline_donations';
const SYNC_INTERVAL_MS = 30_000;

export interface PendingDonation extends DonationPayload {
  localId: string;
  receiptNo: string;
  createdAt: number;
}

type QueueListener = (count: number) => void;

const listeners = new Set<QueueListener>();
let syncing = false;
let syncStarted = false;

/** Unique local receipt number used until the donation is uploaded. */
export function generateLocalReceiptNo(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `OFF-${stamp}${rand}`;
}

function notify(count: number) {
  listeners.forEach((listener) => listener(count));
}

export async function getPendingDonations(): Promise<PendingDonation[]> {
  try {
    const { value } = await Preferences.get({ key: STORAGE_KEY });
    if (!value) return [];
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as PendingDonation[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(donations: PendingDonation[]): Promise<void> {
  await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(donations) });
  notify(donations.length);
}

export async function pendingDonationsCount(): Promise<number> {
  return (await getPendingDonations()).length;
}

/** Saves a donation locally for later upload. Returns its local receipt number. */
export async function addPendingDonation(
  payload: DonationPayload,
): Promise<{ localId: string; receiptNo: string }> {
  const list = await getPendingDonations();
  const entry: PendingDonation = {
    ...payload,
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    receiptNo: generateLocalReceiptNo(),
    createdAt: Date.now(),
  };
  list.push(entry);
  await writeAll(list);
  return { localId: entry.localId, receiptNo: entry.receiptNo };
}

export async function removePendingDonation(localId: string): Promise<void> {
  const list = await getPendingDonations();
  const next = list.filter((d) => d.localId !== localId);
  if (next.length !== list.length) {
    await writeAll(next);
  }
}

/** Uploads every pending donation; each is removed only after it succeeds. */
export async function syncPendingDonations(): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    const pending = await getPendingDonations();
    for (const donation of pending) {
      try {
        await submitDonation(donation);
        await removePendingDonation(donation.localId);
      } catch {
        // Still offline or the server rejected the upload; retry on the next
        // cycle. The donation stays local so nothing is lost.
        return;
      }
    }
  } finally {
    syncing = false;
  }
}

/** Starts the background sync loop (30s retries + immediate sync on reconnect). */
export function initOfflineSync(): void {
  if (syncStarted) return;
  syncStarted = true;

  window.setInterval(() => {
    void syncPendingDonations();
  }, SYNC_INTERVAL_MS);

  window.addEventListener('online', () => {
    void syncPendingDonations();
  });
}

export function subscribeToOfflineQueue(listener: QueueListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
