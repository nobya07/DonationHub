import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import {
  connectPrinter,
  ensurePrinterConnected,
  forgetPrinter,
  getPairedPrinters,
  getPrinterStatus,
  isNativeApp,
  subscribeToPrinterStatus,
  testPrint,
  type PrinterDevice,
  type PrinterStatus,
} from '../../services/printer';
import { formatTimestampMs } from '../../utils/format';

type BusyAction = 'test' | 'connect' | 'forget' | 'reconnect' | null;

export function PrinterSettings() {
  const navigate = useNavigate();
  const isNative = isNativeApp();

  const [status, setStatus] = useState<PrinterStatus | null>(null);
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [showDevices, setShowDevices] = useState(false);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isNative) return;
    getPrinterStatus().then(setStatus).catch(() => {});
    const unsubscribe = subscribeToPrinterStatus(setStatus);
    return unsubscribe;
  }, [isNative]);

  const refreshStatus = async () => {
    try {
      setStatus(await getPrinterStatus());
    } catch {
      // status refreshes through the event listener as well
    }
  };

  const loadDevices = async () => {
    setError(null);
    setMessage(null);
    try {
      const { devices: list } = await getPairedPrinters();
      setDevices(list);
      if (list.length === 0) {
        setMessage(
          'No paired printers found. Pair your printer in Android Bluetooth settings first.',
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not list paired printers');
    }
  };

  const handleChangePrinter = async () => {
    setShowDevices(true);
    await loadDevices();
  };

  const handleConnect = async (macAddress: string) => {
    setBusy('connect');
    setError(null);
    setMessage(null);
    try {
      const result = await connectPrinter(macAddress);
      if (result.success) {
        setShowDevices(false);
        setMessage(result.message);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setBusy(null);
    }
    await refreshStatus();
  };

  const handleTestPrint = async () => {
    setBusy('test');
    setError(null);
    setMessage(null);
    try {
      const printer = await ensurePrinterConnected();
      if (!printer.connected) {
        setMessage('Printer unavailable');
        return;
      }
      const result = await testPrint();
      setMessage(result.success ? 'Test print sent.' : result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test print failed');
    } finally {
      setBusy(null);
    }
  };

  const handleForgetPrinter = async () => {
    setBusy('forget');
    setError(null);
    setMessage(null);
    try {
      const result = await forgetPrinter();
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not forget printer');
    } finally {
      setBusy(null);
    }
    await refreshStatus();
  };

  const handleReconnect = async () => {
    if (!status?.address) {
      await handleChangePrinter();
      return;
    }
    setBusy('reconnect');
    setError(null);
    setMessage(null);
    try {
      const printer = await ensurePrinterConnected();
      setMessage(printer.connected ? 'Reconnected.' : 'Printer unavailable');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reconnect failed');
    } finally {
      setBusy(null);
    }
    await refreshStatus();
  };

  if (!isNative) {
    return (
      <div className="mx-auto max-w-lg">
        <Card padding="lg">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Bluetooth printing is only available in the Android app.
          </p>
        </Card>
      </div>
    );
  }

  const printing =
    status?.state === 'printing' || (status?.pending ?? 0) > 0;
  const queued = Math.max((status?.pending ?? 1) - 1, 0);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Printer Settings</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage the Bluetooth receipt printer for this device.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => navigate('/')}>
          Back to Dashboard
        </Button>
      </div>

      <Card padding="lg" className="mb-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Printer Status</h3>
            {printing && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-sm font-medium text-primary-700">
                <svg
                  className="h-3.5 w-3.5 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Printing…
                {queued > 0 ? ` (${queued} queued)` : ''}
              </span>
            )}
          </div>

          <div className="rounded-xl bg-gray-50 p-4 text-sm space-y-2 dark:bg-surface-raised">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Printer</span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {status
                  ? (status.deviceName ?? 'Not configured')
                  : 'Checking…'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">MAC Address</span>
              <span className="font-mono text-gray-900 dark:text-white">
                {status?.address ?? '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Status</span>
              <span
                className={
                  status?.connected
                    ? 'font-medium text-success-600 dark:text-success-400'
                    : 'font-medium text-red-600 dark:text-red-400'
                }
              >
                {status
                  ? status.connected
                    ? 'Connected'
                    : status.address
                      ? 'Disconnected'
                      : 'Not configured'
                  : 'Checking…'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Last Print</span>
              <span className="text-gray-900 dark:text-white">
                {status?.lastPrintTime
                  ? formatTimestampMs(status.lastPrintTime)
                  : 'Never'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Pending Queue</span>
              <span className="text-gray-900 dark:text-white">
                {status && (status.pending ?? 0) > 0
                  ? `${status.pending} job${(status.pending ?? 0) > 1 ? 's' : ''}`
                  : 'Idle'}
              </span>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}

          {message && <p className="text-sm text-success-600 dark:text-success-400">{message}</p>}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              variant="secondary"
              loading={busy === 'test'}
              disabled={!status?.address}
              onClick={handleTestPrint}
            >
              Test Print
            </Button>
            <Button
              variant="secondary"
              loading={busy === 'reconnect'}
              disabled={!status?.address}
              onClick={handleReconnect}
            >
              Reconnect
            </Button>
            <Button variant="secondary" onClick={handleChangePrinter}>
              Change Printer
            </Button>
            <Button
              variant="ghost"
              loading={busy === 'forget'}
              disabled={!status?.address}
              onClick={handleForgetPrinter}
            >
              Forget Printer
            </Button>
          </div>
        </div>
      </Card>

      {showDevices && (
        <Card padding="lg">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Choose a paired printer
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDevices(false)}
            >
              Cancel
            </Button>
          </div>
          {devices.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No paired printers found. Pair your printer in Android Bluetooth
              settings first.
            </p>
          ) : (
            <div className="space-y-2">
              {devices.map((device) => (
                <div
                  key={device.address}
                  className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                      {device.name}
                    </p>
                    <p className="font-mono text-xs text-gray-500 dark:text-gray-400">
                      {device.address}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    loading={busy === 'connect'}
                    onClick={() => handleConnect(device.address)}
                  >
                    Connect
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
