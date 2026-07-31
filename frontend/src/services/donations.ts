import axios from 'axios';
import type { DonationPayload, DonationResponse } from '../types';

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

export async function submitDonation(
  payload: DonationPayload,
): Promise<DonationResponse> {
  const { data } = await api.post<DonationResponse>('/donations', payload);
  return data;
}
