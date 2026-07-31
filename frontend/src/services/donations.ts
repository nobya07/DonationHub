import axios from 'axios';
import type {
  DonationPayload,
  DonationResponse,
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
  baseURL: '/api',
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
