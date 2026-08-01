import { type PluginListenerHandle } from '@capacitor/core';
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
    getPairedPrinters(): Promise<{
        devices: PrinterDevice[];
    }>;
    connect(options: {
        macAddress: string;
    }): Promise<PrintResult>;
    disconnect(): Promise<PrintResult>;
    printReceipt(options: {
        receipt: ReceiptData;
    }): Promise<PrintResult>;
    testPrint(): Promise<PrintResult>;
    getConnectedPrinter(): Promise<PrinterStatus>;
    clearSavedPrinter(): Promise<PrintResult>;
    isBluetoothEnabled(): Promise<{
        enabled: boolean;
    }>;
    openBluetoothSettings(): Promise<void>;
    addListener(eventName: 'statusChange', listener: (status: PrinterStatus) => void): Promise<PluginListenerHandle> & PluginListenerHandle;
}
export declare const BluetoothPrinter: BluetoothPrinterPlugin;
