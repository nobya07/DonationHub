import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { App as CapApp } from '@capacitor/app';
import { useAuth } from '../../hooks/useAuth';
import { submitDonation, isNetworkError } from '../../services/donations';
import { addPendingDonation } from '../../services/offlineQueue';
import { shareReceiptOnWhatsApp } from '../../services/whatsapp';
import { setBackGuard } from '../../services/backGuard';
import {
  connectPrinter,
  getPairedPrinters,
  getPrinterStatus,
  isBluetoothEnabled,
  isNativeApp,
  openBluetoothSettings,
  printReceipt,
  subscribeToPrinterStatus,
  type PrinterDevice,
  type PrinterStatus,
} from '../../services/printer';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { ErrorDialog } from '../../components/ErrorDialog';
import { formatCurrency, formatISTNow } from '../../utils/format';

const donationSchema = z.object({
  donorName: z.string().min(1, 'Donor name is required'),
  phone: z
    .string()
    .regex(/^\d{10}$/, 'Phone number must be exactly 10 digits'),
  address: z.string().optional(),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  paymentMode: z.enum(['cash', 'upi'], { message: 'Please select a payment mode' }),
  purpose: z.string().optional(),
  remarks: z.string().optional(),
});

type DonationForm = z.infer<typeof donationSchema>;

const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
];

interface SuccessState {
  receiptNumber: string;
  donorName: string;
  amount: number;
  collectorName: string;
  phone: string;
  paymentMode: string;
  purpose: string;
  remarks: string;
  date: string;
  address: string;
  offline: boolean;
  timestamp: number;
}

interface WhatsAppState {
  phase: 'idle' | 'sharing' | 'done' | 'error';
  error?: string;
}

type PrintPhase = 'idle' | 'connecting' | 'printing' | 'success' | 'offline' | 'picker';

interface PrintState {
  phase: PrintPhase;
}

export function Donation() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const submittedRef = useRef(false);
  const [whatsapp, setWhatsapp] = useState<WhatsAppState>({ phase: 'idle' });

  const isNative = isNativeApp();
  const showToast = useToast();
  const [printerStatus, setPrinterStatus] = useState<PrinterStatus | null>(null);
  const [printState, setPrintState] = useState<PrintState>({ phase: 'idle' });
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [showBtDialog, setShowBtDialog] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  useEffect(() => {
    if (!isNative) return;
    getPrinterStatus()
      .then(setPrinterStatus)
      .catch(() => {});
    const unsubscribe = subscribeToPrinterStatus(setPrinterStatus);
    return unsubscribe;
  }, [isNative]);

  const refreshPrinterStatus = async (): Promise<PrinterStatus | null> => {
    try {
      const status = await getPrinterStatus();
      setPrinterStatus(status);
      return status;
    } catch {
      return null;
    }
  };

  const performPrint = async () => {
    if (!success) return;
    setPrintState({ phase: 'printing' });
    try {
      const result = await printReceipt({
        receiptNumber: success.receiptNumber,
        donorName: success.donorName,
        phone: success.phone,
        address: success.address,
        amount: success.amount,
        paymentMode: success.paymentMode,
        purpose: success.purpose,
        remarks: success.remarks,
        collectorName: success.collectorName,
        date: success.date,
      });
      if (result.success) {
        setPrintState({ phase: 'success' });
        showToast('Receipt Printed Successfully');
      } else {
        setPrintState({ phase: 'offline' });
      }
    } catch {
      setPrintState({ phase: 'offline' });
    }
    refreshPrinterStatus();
  };

  const openPicker = async () => {
    setPrintState({ phase: 'picker' });
    setPickerError(null);
    try {
      const { devices: list } = await getPairedPrinters();
      setDevices(list);
    } catch (err) {
      setPickerError(
        err instanceof Error ? err.message : 'Could not list paired printers',
      );
    }
  };

  const handleSelectDevice = async (macAddress: string) => {
    setPrintState({ phase: 'connecting' });
    try {
      const { enabled } = await isBluetoothEnabled();
      if (!enabled) {
        setShowBtDialog(true);
        setPrintState({ phase: 'idle' });
        return;
      }
      const result = await connectPrinter(macAddress);
      if (!result.success) {
        setPrintState({ phase: 'offline' });
        return;
      }
      await performPrint();
    } catch {
      setPrintState({ phase: 'offline' });
    }
  };

  const handlePrint = async () => {
    if (!success) return;
    if (printState.phase === 'connecting' || printState.phase === 'printing') {
      return;
    }

    try {
      const { enabled } = await isBluetoothEnabled();
      if (!enabled) {
        setShowBtDialog(true);
        return;
      }
    } catch {
      // Bluetooth state is unavailable; continue with the existing flow
    }

    const status = await refreshPrinterStatus();
    if (!status?.address) {
      await openPicker();
      return;
    }

    setPrintState({ phase: 'connecting' });
    if (!status.connected) {
      try {
        const result = await connectPrinter(status.address);
        if (!result.success) {
          setPrintState({ phase: 'offline' });
          return;
        }
      } catch {
        setPrintState({ phase: 'offline' });
        return;
      }
    }
    await performPrint();
  };

  const handleEnableBluetooth = async () => {
    setShowBtDialog(false);
    try {
      await openBluetoothSettings();
    } catch {
      // Bluetooth settings could not be opened
    }
  };

  const printing =
    printState.phase === 'connecting' || printState.phase === 'printing';

  const handleShareWhatsApp = async () => {
    if (!success || whatsapp.phase === 'sharing') return;

    setWhatsapp({ phase: 'sharing' });

    const result = await shareReceiptOnWhatsApp({
      receiptNo: success.receiptNumber,
      donorName: success.donorName,
      phone: success.phone,
      amount: success.amount,
      paymentMode: success.paymentMode,
      purpose: success.purpose,
      collectorName: success.collectorName,
      date: success.timestamp,
    });

    if (result.success) {
      setWhatsapp({ phase: 'done' });
      showToast('WhatsApp opened — press Send to deliver the receipt.');
    } else {
      setWhatsapp({
        phase: 'error',
        error:
          result.error ?? 'Could not open WhatsApp. Please try again.',
      });
    }
  };

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<DonationForm>({
    resolver: zodResolver(donationSchema),
    defaultValues: {
      donorName: '',
      phone: '',
      address: '',
      amount: undefined,
      paymentMode: '' as DonationForm['paymentMode'],
      purpose: '',
      remarks: '',
    },
  });

  const discardBlocking = isDirty && !success;

  useEffect(() => {
    setBackGuard(discardBlocking);
    return () => setBackGuard(false);
  }, [discardBlocking]);

  useEffect(() => {
    if (!isNative) return;

    let remove: (() => void) | undefined;
    void CapApp.addListener('backButton', () => {
      if (discardBlocking) {
        setShowDiscardDialog(true);
      }
    }).then((handle) => {
      remove = handle.remove;
    });

    return () => remove?.();
  }, [isNative, discardBlocking]);

  if (success) {
    return (
      <>
        <div className="mx-auto max-w-lg">
          <Card padding="lg">
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Donation Saved
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">Receipt has been generated successfully.</p>
            </div>

            <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4 text-left text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400 dark:text-gray-500">Receipt No</span>
                <span className="font-mono font-semibold text-gray-900 dark:text-white">{success.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400 dark:text-gray-500">Collector</span>
                <span className="text-gray-900 dark:text-white">{success.collectorName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400 dark:text-gray-500">Donor</span>
                <span className="text-gray-900 dark:text-white">{success.donorName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400 dark:text-gray-500">Amount</span>
                <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(Number(success.amount))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400 dark:text-gray-500">Payment</span>
                <span className="text-gray-900 dark:text-white">{success.paymentMode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400 dark:text-gray-500">Date</span>
                <span className="text-gray-900 dark:text-white">{success.date}</span>
              </div>
            </div>

            <div className="border-t-2 border-dashed border-gray-200 dark:border-gray-700" />

            {success.offline && (
              <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Saved offline. It will be uploaded to Google Sheets
                automatically when you are back online.
              </p>
            )}

            <div className="space-y-3">
              {isNative && (
                <>
                  <Button
                    variant="secondary"
                    size="lg"
                    className="w-full"
                    loading={printing}
                    disabled={printing || printState.phase === 'picker'}
                    onClick={handlePrint}
                  >
                    🖨 Print Receipt
                  </Button>

                  {printState.phase === 'connecting' && (
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Connecting to printer...
                    </p>
                  )}

                  {printState.phase === 'printing' && (
                    <p className="text-sm text-gray-600 dark:text-gray-300">Printing...</p>
                  )}

                  {printState.phase === 'success' && (
                    <p className="text-sm font-medium text-green-600">
                      Print Complete ✓
                    </p>
                  )}

                  {printState.phase === 'offline' && (
                    <div className="rounded-lg bg-red-50 px-4 py-3 text-left text-sm text-red-700 space-y-2">
                      <p className="font-medium">Printer Offline</p>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handlePrint}>
                          Retry
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={openPicker}
                        >
                          Change Printer
                        </Button>
                      </div>
                    </div>
                  )}

                  {printState.phase === 'picker' && (
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-left">
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-sm font-medium text-gray-700">
                          Choose a paired printer
                        </h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPrintState({ phase: 'idle' })}
                        >
                          Cancel
                        </Button>
                      </div>
                      {pickerError ? (
                        <p className="text-sm text-red-600" role="alert">
                          {pickerError}
                        </p>
                      ) : devices.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">
                          No paired printers found. Pair your printer in Android
                          Bluetooth settings first.
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
                                <p className="font-mono text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500">
                                  {device.address}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                loading={printing}
                                disabled={printing}
                                onClick={() =>
                                  handleSelectDevice(device.address)
                                }
                              >
                                Connect
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                loading={whatsapp.phase === 'sharing'}
                disabled={whatsapp.phase === 'sharing'}
                onClick={handleShareWhatsApp}
              >
                {whatsapp.phase === 'sharing'
                  ? 'Opening WhatsApp…'
                  : '📱 Share on WhatsApp'}
              </Button>

              {whatsapp.phase === 'done' && (
                <p className="text-sm text-green-600">
                  WhatsApp opened — the receipt is pre-filled. Just press Send.
                </p>
              )}

              {whatsapp.phase === 'error' && (
                <div className="rounded-lg bg-red-50 px-4 py-3 text-left text-sm text-red-700 space-y-2">
                  <p>
                    {whatsapp.error}. Your donation is already saved.
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleShareWhatsApp}>
                      Try Again
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <Button
              size="lg"
              className="w-full"
              onClick={() => navigate('/')}
            >
              Dashboard
            </Button>

            {isNative && (
              <div className="flex items-center justify-center gap-2 pt-1">
                <span className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">Printer status:</span>
                {printerStatus ? (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
                      printerStatus.connected
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {printerStatus.connected
                      ? '🟢 Connected'
                      : '🔴 Disconnected'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1 text-sm font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500">
                    ⚪ Checking…
                  </span>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      {showBtDialog && (
        <Modal
          title="Bluetooth is turned off."
          onClose={() => setShowBtDialog(false)}
        >
          <div className="flex gap-3">
            <Button className="flex-1" onClick={handleEnableBluetooth}>
              Enable Bluetooth
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setShowBtDialog(false)}
            >
              Cancel
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

  const onSubmit = async (data: DonationForm) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setServerError(null);

    const payload = {
      collectorId: user!.collectorId,
      collectorName: user!.collectorName,
      donorName: data.donorName,
      phone: data.phone,
      address: data.address ?? '',
      amount: data.amount,
      paymentMode: data.paymentMode,
      purpose: data.purpose ?? '',
      remarks: data.remarks,
    };

    try {
      const result = await submitDonation(payload);

      setSuccess({
        receiptNumber: result.receiptNumber,
        donorName: data.donorName,
        amount: data.amount,
        collectorName: user!.collectorName,
        phone: data.phone,
        paymentMode: data.paymentMode,
        purpose: data.purpose ?? '',
        remarks: data.remarks ?? '',
        date: formatISTNow(),
        address: data.address ?? '',
        offline: false,
        timestamp: Date.now(),
      });
    } catch (err) {
      if (isNetworkError(err)) {
        try {
          const { receiptNo } = await addPendingDonation(payload);
          setSuccess({
            receiptNumber: receiptNo,
            donorName: data.donorName,
            amount: data.amount,
            collectorName: user!.collectorName,
            phone: data.phone,
            paymentMode: data.paymentMode,
            purpose: data.purpose ?? '',
            remarks: data.remarks ?? '',
            date: formatISTNow(),
            address: data.address ?? '',
            offline: true,
            timestamp: Date.now(),
          });
        } catch {
          setServerError(
            'Could not save the donation on this device. Please try again.',
          );
          submittedRef.current = false;
        }
        return;
      }
      setServerError(err instanceof Error ? err.message : 'Failed to save donation');
      submittedRef.current = false;
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Card padding="lg">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Record a Donation</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">
            Fill in the donation details below.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <ErrorDialog
            open={serverError !== null}
            title="Could not save donation"
            message={serverError ?? ''}
            onClose={() => setServerError(null)}
          />

          <Input
            label="Collector Name"
            value={user?.collectorName ?? ''}
            readOnly
            className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 dark:text-gray-500 cursor-not-allowed"
            tabIndex={-1}
          />

          <Input
            label="Donor Name"
            placeholder="Enter donor's full name"
            error={errors.donorName?.message}
            {...register('donorName')}
          />

          <Input
            label="Phone Number"
            type="tel"
            inputMode="numeric"
            maxLength={10}
            placeholder="Enter phone number"
            error={errors.phone?.message}
            {...register('phone')}
            onChange={(e) => {
              setValue('phone', e.target.value.replace(/\D/g, ''), {
                shouldValidate: true,
              });
            }}
          />

          <Input
            label="Address (Optional)"
            placeholder="Enter full address"
            error={errors.address?.message}
            {...register('address')}
          />

          <Input
            label="Amount"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            error={errors.amount?.message}
            {...register('amount')}
          />

          <Select
            label="Payment Mode"
            options={PAYMENT_MODES}
            placeholder="Select payment mode"
            error={errors.paymentMode?.message}
            {...register('paymentMode')}
          />

          <Input
            label="Purpose (Optional)"
            placeholder="What is this donation for?"
            error={errors.purpose?.message}
            {...register('purpose')}
          />

          <Input
            label="Remarks (optional)"
            placeholder="Any additional notes"
            error={errors.remarks?.message}
            {...register('remarks')}
          />

          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              loading={isSubmitting}
              size="lg"
              className="flex-1"
            >
              {isSubmitting ? 'Saving...' : 'Record Donation'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={() => {
                setServerError(null);
                reset();
              }}
            >
              Reset
            </Button>
          </div>
        </form>
      </Card>

      {showDiscardDialog && (
        <Modal
          title="Discard donation details?"
          onClose={() => setShowDiscardDialog(false)}
        >
          <p className="text-sm text-gray-600 dark:text-gray-300">
            You are still entering this donation. Leaving now will discard the
            details you have filled in.
          </p>
          <div className="mt-5 flex gap-3">
            <Button
              className="flex-1"
              onClick={() => setShowDiscardDialog(false)}
            >
              Keep Editing
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setShowDiscardDialog(false);
                reset();
                navigate('/');
              }}
            >
              Discard &amp; Leave
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
