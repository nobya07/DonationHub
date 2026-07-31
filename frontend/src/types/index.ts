export interface Collector {
  collectorId: string;
  username: string;
  collectorName: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  collectorId: string;
  collectorName: string;
  username: string;
}

export interface VerifyResponse {
  collectorId: string;
  collectorName: string;
  username: string;
}

export interface ApiError {
  message: string;
}

export interface DonationPayload {
  collectorId: string;
  collectorName: string;
  donorName: string;
  phone: string;
  address: string;
  amount: number;
  paymentMode: string;
  purpose: string;
  remarks?: string;
}

export interface DonationResponse {
  success: boolean;
  receiptNumber: string;
}
