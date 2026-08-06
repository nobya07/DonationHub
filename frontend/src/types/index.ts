export type UserRole = 'Admin' | 'Collector';

export interface Collector {
  collectorId: string;
  username: string;
  collectorName: string;
  role: UserRole;
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
  role: UserRole;
  /** Active single-device login session id; saved on the device. */
  sessionId: string;
}

export interface VerifyResponse {
  collectorId: string;
  collectorName: string;
  username: string;
  role: UserRole;
  /** Active single-device login session id; saved on the device. */
  sessionId: string;
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

export interface DonationRecord {
  timestamp: string;
  receiptNo: string;
  collectorId: string;
  collectorName: string;
  donorName: string;
  phone: string;
  address: string;
  amount: number;
  paymentMode: string;
  purpose: string;
  remarks: string;
}

export interface AdminCollector {
  collectorId: string;
  username: string;
  collectorName: string;
  role: UserRole;
  active: boolean;
}

export interface CollectorFormData {
  username: string;
  password?: string;
  collectorName: string;
  role: UserRole;
  active: boolean;
}

export interface DonationFilters {
  search?: string;
  collectorId?: string;
  paymentMode?: string;
  from?: string;
  to?: string;
}
