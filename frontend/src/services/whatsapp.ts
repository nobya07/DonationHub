import axios from 'axios';

export interface WhatsAppReceiptPayload {
  receiptNo: string;
  donorName: string;
  phone: string;
  amount: string;
  paymentMode: string;
  purpose?: string;
  collectorName: string;
  date: string;
}

export interface WhatsAppSendResponse {
  success: boolean;
  messageId: string;
  status: string;
  to: string;
}

export interface WhatsAppStatusResponse {
  messageId: string;
  status: string;
}

const api = axios.create({
  baseURL: '/api/whatsapp',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const message =
        error.response.data?.message || 'An unexpected error occurred';
      return Promise.reject(new Error(message));
    }
    if (error.request) {
      return Promise.reject(
        new Error('Network error. Please check your connection.')
      );
    }
    return Promise.reject(error);
  },
);

export async function sendReceipt(
  payload: WhatsAppReceiptPayload
): Promise<WhatsAppSendResponse> {
  const { data } = await api.post<WhatsAppSendResponse>(
    '/send-receipt',
    payload
  );
  return data;
}

export async function getStatus(messageId: string): Promise<string> {
  const { data } = await api.get<WhatsAppStatusResponse>('/status', {
    params: { messageId },
  });
  return data.status;
}
