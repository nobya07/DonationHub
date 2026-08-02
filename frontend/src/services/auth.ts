import axios from 'axios';
import type { LoginResponse, VerifyResponse } from '../types';
import { API_BASE_URL } from './api';

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
      const message = error.response.data?.message || 'An unexpected error occurred';
      return Promise.reject(new Error(message));
    }
    if (error.request) {
      return Promise.reject(new Error('Network error. Please check your connection.'));
    }
    return Promise.reject(error);
  },
);

export async function login(
  username: string,
  password: string,
): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/login', { username, password });
  return data;
}

export async function logout(): Promise<void> {
  await api.post('/logout');
}

export async function verify(): Promise<VerifyResponse> {
  const { data } = await api.get<VerifyResponse>('/verify');
  return data;
}
