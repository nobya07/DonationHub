import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface PrinterDevice {
  name: string;
  address: string;
}

export type PrinterState = 'idle' | 'connected' | 'printing' | 'offline' | 'error';

export interface PrinterStatus {
  connected: boolean;
  deviceName: string | null;
  address: string | null;
  state: PrinterState;
  message: string;
  pending?: number;
  lastPrintTime?: number | null;
}

export interface PrintResult {
  success: boolean;
  message: string;
}

export interface ReceiptData {
  templeName: string;
  receiptNo: string;
  date: string;
  collectorName: string;
  donorName: string;
  phone: string;
  address: string;
  amount: string;
  paymentMode: string;
  purpose?: string;
  remarks?: string;
  thankYou?: string;
  paperWidth?: 58 | 80;
}

export interface BluetoothPrinterPlugin {
  getPairedPrinters(): Promise<{ devices: PrinterDevice[] }>;
  connect(options: { macAddress: string }): Promise<PrintResult>;
  disconnect(): Promise<PrintResult>;
  printReceipt(options: { receipt: ReceiptData }): Promise<PrintResult>;
  testPrint(): Promise<PrintResult>;
  getConnectedPrinter(): Promise<PrinterStatus>;
  clearSavedPrinter(): Promise<PrintResult>;
  isBluetoothEnabled(): Promise<{ enabled: boolean }>;
  openBluetoothSettings(): Promise<void>;
  addListener(
    eventName: 'statusChange',
    listener: (status: PrinterStatus) => void,
  ): Promise<PluginListenerHandle> & PluginListenerHandle;
}

const ANDROID_ONLY = 'Bluetooth printing is only available in the Android app';

const webImplementation: BluetoothPrinterPlugin = {
  getPairedPrinters: async () => ({ devices: [] }),
  connect: async () => ({ success: false, message: ANDROID_ONLY }),
  disconnect: async () => ({ success: true, message: 'Nothing to disconnect on web' }),
  printReceipt: async () => ({ success: false, message: ANDROID_ONLY }),
  testPrint: async () => ({ success: false, message: ANDROID_ONLY }),
  getConnectedPrinter: async () => ({
    connected: false,
    deviceName: null,
    address: null,
    state: 'idle',
    message: ANDROID_ONLY,
    pending: 0,
    lastPrintTime: null,
  }),
  clearSavedPrinter: async () => ({ success: true, message: 'Nothing to clear on web' }),
  isBluetoothEnabled: async () => ({ enabled: true }),
  openBluetoothSettings: async () => {
    // no-op on web
  },
  addListener: () => {
    const handle: PluginListenerHandle = {
      remove: async () => {
        // no-op on web
      },
    };
    return Promise.resolve(handle) as Promise<PluginListenerHandle> &
      PluginListenerHandle;
  },
};

export const BluetoothPrinter = registerPlugin<BluetoothPrinterPlugin>(
  'BluetoothPrinter',
  { web: () => webImplementation },
);
