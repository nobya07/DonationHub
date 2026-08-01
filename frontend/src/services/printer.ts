import { Capacitor } from '@capacitor/core';
import {
  BluetoothPrinter,
  type PrintResult,
  type PrinterDevice,
  type PrinterStatus,
  type ReceiptData,
} from 'bluetooth-printer';

export type { PrintResult, PrinterDevice, PrinterStatus } from 'bluetooth-printer';

/** Change this to the temple name shown at the top of printed receipts. */
export const TEMPLE_NAME = 'DonationHub';

/** True only inside the Capacitor Android app (false in a normal browser). */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function getPrinterStatus(): Promise<PrinterStatus> {
  return BluetoothPrinter.getConnectedPrinter();
}

export function getPairedPrinters(): Promise<{ devices: PrinterDevice[] }> {
  return BluetoothPrinter.getPairedPrinters();
}

export function connectPrinter(macAddress: string): Promise<PrintResult> {
  return BluetoothPrinter.connect({ macAddress });
}

export function forgetPrinter(): Promise<PrintResult> {
  return BluetoothPrinter.clearSavedPrinter();
}

export function isBluetoothEnabled(): Promise<{ enabled: boolean }> {
  return BluetoothPrinter.isBluetoothEnabled();
}

export function openBluetoothSettings(): Promise<void> {
  return BluetoothPrinter.openBluetoothSettings();
}

export function testPrint(): Promise<PrintResult> {
  return BluetoothPrinter.testPrint();
}

/**
 * Checks the connection to the remembered printer and reconnects when it is
 * not currently connected. Returns the latest status; the caller decides how
 * to react when the printer is still unavailable.
 */
export async function ensurePrinterConnected(): Promise<PrinterStatus> {
  const status = await getPrinterStatus();
  if (!status.address || status.connected) return status;
  await connectPrinter(status.address);
  return getPrinterStatus();
}

/**
 * Restores the remembered printer connection when the app starts. No-op in a
 * normal browser; the printer is reconnected again before every print anyway.
 */
export function initPrinterService(): void {
  if (!isNativeApp()) return;
  void ensurePrinterConnected().catch(() => {
    // Printer is unavailable; it will be retried on demand before each print.
  });
}

export interface PrinterReceiptInput {
  receiptNumber: string;
  donorName: string;
  phone: string;
  address: string;
  amount: number;
  paymentMode: string;
  purpose: string;
  remarks: string;
  collectorName: string;
  date: string;
}

export function printReceipt(input: PrinterReceiptInput): Promise<PrintResult> {
  const receipt: ReceiptData = {
    templeName: TEMPLE_NAME,
    receiptNo: input.receiptNumber,
    date: input.date,
    collectorName: input.collectorName,
    donorName: input.donorName,
    phone: input.phone,
    address: input.address,
    amount: input.amount.toFixed(2),
    paymentMode: input.paymentMode.toUpperCase(),
    purpose: input.purpose,
    remarks: input.remarks,
    paperWidth: 58,
  };
  return BluetoothPrinter.printReceipt({ receipt });
}

/**
 * Subscribes to live printer status events (connection changes, print
 * progress, queue depth). Returns an unsubscribe function.
 */
export function subscribeToPrinterStatus(
  listener: (status: PrinterStatus) => void,
): () => void {
  const handle = BluetoothPrinter.addListener('statusChange', listener);
  return () => {
    void handle
      .then((h) => h.remove())
      .catch(() => {
        // listener already removed
      });
  };
}
