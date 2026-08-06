import axios from 'axios';
import type {
  DonationPayload,
  DonationResponse,
  DonationRecord,
} from '../types';
import { API_BASE_URL } from './api';
import { notifySessionInvalidated, isSessionReplacedCode } from './session';

interface RawDonation {
  timestamp: string;
  receiptNo: string;
  collectorId: string;
  collectorName: string;
  donorName: string;
  phone: string;
  address: string;
  amount: string;
  paymentMode: string;
  purpose: string;
  remarks: string;
}

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const code = error.response.data?.code as string | undefined;
      const message =
        error.response.data?.message || 'An unexpected error occurred';

      if (isSessionReplacedCode(code)) {
        notifySessionInvalidated();
      }

      const apiError = new Error(message);
      (apiError as Error & { code?: string }).code = code;
      return Promise.reject(apiError);
    }
    if (error.request) {
      const networkError = new Error(
        'You are offline. Your donation will be saved on this device and uploaded automatically.'
      );
      (networkError as Error & { isNetworkError?: boolean }).isNetworkError =
        true;
      return Promise.reject(networkError);
    }
    return Promise.reject(error);
  },
);

export function isNetworkError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as Error & { isNetworkError?: boolean }).isNetworkError === true
  );
}

function mapDonation(donation: RawDonation): DonationRecord {
  return {
    ...donation,
    amount: Number(donation.amount) || 0,
  };
}

export async function submitDonation(
  payload: DonationPayload,
): Promise<DonationResponse> {
  const { data } = await api.post<DonationResponse>('/donations', payload);
  return data;
}

export async function getMyDonations(): Promise<DonationRecord[]> {
  const { data } = await api.get<{ donations: RawDonation[] }>('/donations');
  return data.donations.map(mapDonation);
}
