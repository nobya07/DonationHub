import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../../hooks/useAuth';
import { submitDonation } from '../../services/donations';
import { sendReceipt, getStatus } from '../../services/whatsapp';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Card } from '../../components/ui/Card';

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
  date: string;
}

interface WhatsAppState {
  phase: 'idle' | 'sending' | 'sent' | 'failed';
  messageId?: string;
  delivery?: string;
  error?: string;
}

const DELIVERY_LABELS: Record<string, string> = {
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Failed',
};

function deliveryLabel(status: string): string {
  return DELIVERY_LABELS[status] ?? status;
}

export function Donation() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const submittedRef = useRef(false);
  const [whatsapp, setWhatsapp] = useState<WhatsAppState>({ phase: 'idle' });
  const whatsappPollRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (whatsappPollRef.current !== null) {
        window.clearInterval(whatsappPollRef.current);
      }
    };
  }, []);

  const pollDeliveryStatus = (messageId: string) => {
    let attempts = 0;

    if (whatsappPollRef.current !== null) {
      window.clearInterval(whatsappPollRef.current);
    }

    whatsappPollRef.current = window.setInterval(async () => {
      attempts += 1;

      try {
        const delivery = await getStatus(messageId);

        setWhatsapp((prev) =>
          prev.phase === 'sent' ? { ...prev, delivery } : prev
        );

        const terminal =
          delivery === 'delivered' ||
          delivery === 'read' ||
          delivery === 'failed' ||
          attempts >= 15;

        if (terminal && whatsappPollRef.current !== null) {
          window.clearInterval(whatsappPollRef.current);
        }
      } catch {
        if (attempts >= 15 && whatsappPollRef.current !== null) {
          window.clearInterval(whatsappPollRef.current);
        }
      }
    }, 4000);
  };

  const sendWhatsApp = async (success: SuccessState) => {
    setWhatsapp({ phase: 'sending' });

    try {
      const result = await sendReceipt({
        receiptNo: success.receiptNumber,
        donorName: success.donorName,
        phone: success.phone,
        amount: success.amount.toFixed(2),
        paymentMode: success.paymentMode,
        purpose: success.purpose,
        collectorName: success.collectorName,
        date: success.date,
      });

      setWhatsapp({
        phase: 'sent',
        messageId: result.messageId,
        delivery: result.status,
      });
      pollDeliveryStatus(result.messageId);
    } catch (err) {
      setWhatsapp({
        phase: 'failed',
        error:
          err instanceof Error
            ? err.message
            : 'Failed to send WhatsApp receipt',
      });
    }
  };

  const resetWhatsApp = () => {
    if (whatsappPollRef.current !== null) {
      window.clearInterval(whatsappPollRef.current);
    }
    setWhatsapp({ phase: 'idle' });
  };

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
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

  if (success) {
    return (
      <div className="mx-auto max-w-lg">
        <Card padding="lg">
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-gray-900">Donation Saved</h2>
              <p className="text-sm text-gray-500">Receipt has been generated successfully.</p>
            </div>

            <div className="rounded-xl bg-gray-50 p-4 text-left text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Receipt Number</span>
                <span className="font-mono font-semibold text-gray-900">{success.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Collector Name</span>
                <span className="text-gray-900">{success.collectorName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Donor Name</span>
                <span className="text-gray-900">{success.donorName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Amount</span>
                <span className="font-semibold text-gray-900">${Number(success.amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Phone</span>
                <span className="text-gray-900">{success.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Payment Mode</span>
                <span className="text-gray-900">{success.paymentMode}</span>
              </div>
            </div>

            <div className="space-y-3">
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                disabled={whatsapp.phase === 'sending'}
                onClick={() => sendWhatsApp(success)}
              >
                {whatsapp.phase === 'sending'
                  ? 'Sending...'
                  : 'Send WhatsApp Receipt'}
              </Button>

              {whatsapp.phase === 'sent' && (
                <p className="text-sm text-green-600">
                  WhatsApp: {deliveryLabel(whatsapp.delivery ?? 'sent')}
                </p>
              )}

              {whatsapp.phase === 'failed' && (
                <p className="text-sm text-red-600">
                  WhatsApp failed: {whatsapp.error}. Your donation is already
                  saved.
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                variant="secondary"
                size="lg"
                className="flex-1"
                onClick={() => {
                  setSuccess(null);
                  setServerError(null);
                  submittedRef.current = false;
                  resetWhatsApp();
                  reset();
                }}
              >
                New Donation
              </Button>
              <Button
                size="lg"
                className="flex-1"
                onClick={() => navigate('/')}
              >
                Back to Dashboard
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const onSubmit = async (data: DonationForm) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setServerError(null);

    try {
      const result = await submitDonation({
        collectorId: user!.collectorId,
        collectorName: user!.collectorName,
        donorName: data.donorName,
        phone: data.phone,
        address: data.address ?? '',
        amount: data.amount,
        paymentMode: data.paymentMode,
        purpose: data.purpose ?? '',
        remarks: data.remarks,
      });

      setSuccess({
        receiptNumber: result.receiptNumber,
        donorName: data.donorName,
        amount: data.amount,
        collectorName: user!.collectorName,
        phone: data.phone,
        paymentMode: data.paymentMode,
        purpose: data.purpose ?? '',
        date: new Date().toLocaleString(),
      });
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to save donation');
      submittedRef.current = false;
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Card padding="lg">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Record a Donation</h2>
          <p className="mt-1 text-sm text-gray-500">
            Fill in the donation details below.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {serverError && (
            <div
              className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
              role="alert"
            >
              {serverError}
            </div>
          )}

          <Input
            label="Collector Name"
            value={user?.collectorName ?? ''}
            readOnly
            className="bg-gray-50 text-gray-500 cursor-not-allowed"
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
    </div>
  );
}
