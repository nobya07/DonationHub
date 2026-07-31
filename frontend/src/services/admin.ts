import axios from 'axios';
import type {
  AdminCollector,
  CollectorFormData,
  DonationFilters,
  DonationRecord,
} from '../types';

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
  baseURL: '/api/admin',
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

  const { data } = await api.get<{ donations: RawDonation[] }>('/donations', { params });
  return data.donations.map(mapDonation);
}

export async function getCollectors(): Promise<AdminCollector[]> {
  const { data } = await api.get<{ collectors: AdminCollector[] }>('/collectors');
  return data.collectors;
}

export async function createCollector(payload: CollectorFormData): Promise<AdminCollector> {
  const { data } = await api.post<AdminCollector>('/collectors', payload);
  return data;
}

export async function updateCollector(
  collectorId: string,
  payload: Partial<CollectorFormData>,
): Promise<AdminCollector> {
  const { data } = await api.patch<AdminCollector>(`/collectors/${collectorId}`, payload);
  return data;
}

export async function deleteCollector(collectorId: string): Promise<void> {
  await api.delete(`/collectors/${collectorId}`);
}

export async function resetCollectorPassword(
  collectorId: string,
  newPassword: string,
): Promise<void> {
  await api.post(`/collectors/${collectorId}/reset-password`, { newPassword });
}
