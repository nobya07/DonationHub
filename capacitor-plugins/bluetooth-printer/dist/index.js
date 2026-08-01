import { registerPlugin } from '@capacitor/core';
const ANDROID_ONLY = 'Bluetooth printing is only available in the Android app';
const webImplementation = {
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
        const handle = {
            remove: async () => {
                // no-op on web
            },
        };
        return Promise.resolve(handle);
    },
};
export const BluetoothPrinter = registerPlugin('BluetoothPrinter', { web: () => webImplementation });
