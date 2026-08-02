import axios from 'axios';
import type {
  AdminCollector,
  CollectorFormData,
  DonationFilters,
  DonationRecord,
} from '../types';
import { API_BASE_URL } from './api';

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
  baseURL: `${API_BASE_URL}/api/admin`,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const message = error.response.data?.message || 'An unexpected error occurred';
      return Promise.reject(new Error(message));
    }
    if (error.request) {
      return Promise.reject(new Error('Network error. Please check your connection.'));
    }
    return Promise.reject(error);
  },
);

function mapDonation(donation: RawDonation): DonationRecord {
  return {
    ...donation,
    amount: Number(donation.amount) || 0,
  };
}

export async function getDonations(filters: DonationFilters = {}): Promise<DonationRecord[]> {
  const params: Record<string, string> = {};

  if (filters.search) params.search = filters.search;
  if (filters.collectorId) params.collectorId = filters.collectorId;
  if (filters.paymentMode) params.paymentMode = filters.paymentMode;
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;

  const { data } = await api.get<{ donations: RawDonation[] }>('', {
    params: { action: 'donations', ...params },
  });
  return data.donations.map(mapDonation);
}

export async function getCollectors(): Promise<AdminCollector[]> {
  const { data } = await api.get<{ collectors: AdminCollector[] }>('', {
    params: { action: 'collectors' },
  });
  return data.collectors;
}

export async function createCollector(payload: CollectorFormData): Promise<AdminCollector> {
  const { data } = await api.post<AdminCollector>('', payload, {
    params: { action: 'collectors' },
  });
  return data;
}

export async function updateCollector(
  collectorId: string,
  payload: Partial<CollectorFormData>,
): Promise<AdminCollector> {
  const { data } = await api.patch<AdminCollector>('', payload, {
    params: { action: 'collector', id: collectorId },
  });
  return data;
}

export async function deleteCollector(collectorId: string): Promise<void> {
  await api.delete('', {
    params: { action: 'collector', id: collectorId },
  });
}

export async function resetCollectorPassword(
  collectorId: string,
  newPassword: string,
): Promise<void> {
  await api.post('', { newPassword }, {
    params: { action: 'reset-password', id: collectorId },
  });
}
