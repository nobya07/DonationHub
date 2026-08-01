import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface ReceiptData {
  receiptNo: string;
  donorName: string;
  phone: string;
  amount: string;
  paymentMode: string;
  purpose?: string;
  collectorName: string;
  date: string;
}

export interface PrinterDevice {
  name: string;
  address: string;
}

export type PrinterState = 'idle' | 'connected' | 'printing' | 'offline' | 'error';

export interface PrinterStatus {
  connected: boolean;
  deviceName: string | null;
  state: PrinterState;
  message: string;
}

export interface PrintResult {
  success: boolean;
  message: string;
}

export interface BluetoothPrinterPlugin {
  printReceipt(options: { receipt: ReceiptData }): Promise<PrintResult>;
  testPrint(): Promise<PrintResult>;
  listDevices(): Promise<{ devices: PrinterDevice[] }>;
  getStatus(): Promise<PrinterStatus>;
  selectDevice(options: { address: string }): Promise<PrintResult>;
  addListener(
    eventName: 'statusChange',
    listener: (status: PrinterStatus) => void,
  ): Promise<PluginListenerHandle> & PluginListenerHandle;
}

const webImplementation: BluetoothPrinterPlugin = {
  printReceipt: async () => ({
    success: false,
    message: 'Bluetooth printing is only available in the Android app',
  }),
  testPrint: async () => ({
    success: false,
    message: 'Bluetooth printing is only available in the Android app',
  }),
  listDevices: async () => ({ devices: [] }),
  getStatus: async () => ({
    connected: false,
    deviceName: null,
    state: 'error',
    message: 'Bluetooth printing is only available in the Android app',
  }),
  selectDevice: async () => ({
    success: false,
    message: 'Bluetooth printing is only available in the Android app',
  }),
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
