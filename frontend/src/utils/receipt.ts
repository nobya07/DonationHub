import { amountInWords } from './amountInWords';
import { formatCurrency, formatISTReceiptDate } from './format';

/**
 * THE single receipt template. Every receipt output (WhatsApp message,
 * Bluetooth thermal printer, PDF, Receipt Details page) is generated from
 * `buildReceiptLines` so all of them stay identical.
 */
export interface ReceiptInput {
  receiptNo: string;
  donorName: string;
  amount: number;
  /** Raw mode, e.g. "cash" | "upi". */
  paymentMode: string;
  purpose: string;
  collectorName: string;
  /** Epoch milliseconds; rendered as an IST receipt date. */
  date: number;
}

export interface ReceiptSegment {
  text: string;
  bold?: boolean;
}

export interface ReceiptLine {
  segments: ReceiptSegment[];
  align?: 'left' | 'center';
}

const SEPARATOR = '━━━━━━━━━━━━━━━━━━';

const PAYMENT_MODE_LABELS: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
};

function paymentModeLabel(mode: string): string {
  const lower = mode.trim().toLowerCase();

  if (PAYMENT_MODE_LABELS[lower]) return PAYMENT_MODE_LABELS[lower]!;

  if (!lower) return '-';

  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function buildReceiptLines(input: ReceiptInput): ReceiptLine[] {
  const mode = paymentModeLabel(input.paymentMode);
  const words = amountInWords(input.amount);
  const amount = formatCurrency(input.amount);
  const date = formatISTReceiptDate(input.date);
  const purpose = input.purpose.trim() || '-';

  return [
    { segments: [{ text: '|| श्री गजानन प्रसन्न ||' }] },
    { segments: [{ text: '' }] },
    { segments: [{ text: '/वडगावचा अष्टविनायक/' }] },
    { segments: [{ text: '' }] },
    { segments: [{ text: 'श्री सार्वजनिक गणेश उत्सव मंडळ', bold: true }] },
    { segments: [{ text: 'अष्टविनायक नगर, येळूर रोड,' }] },
    { segments: [{ text: 'वडगाव, बेळगाव.' }] },
    { segments: [{ text: '' }] },
    { segments: [{ text: 'पावती नं.: ' }, { text: input.receiptNo, bold: true }] },
    {
      segments: [
        { text: 'श्री. रा. रा ' },
        { text: input.donorName, bold: true },
        { text: ' ,' },
      ],
    },
    { segments: [{ text: 'यांच्याकडून' }] },
    {
      segments: [
        { text: 'आज अक्षरी रुपये ' },
        { text: words, bold: true },
        { text: ' रोख पोहोचले.' },
      ],
    },
    { segments: [{ text: '' }] },
    { segments: [{ text: 'रक्कम: ', bold: true }, { text: amount }] },
    { segments: [{ text: 'पेमेंट पद्धत: ', bold: true }, { text: mode }] },
    { segments: [{ text: 'देणगी: ', bold: true }, { text: purpose }] },
    { segments: [{ text: 'तारीख: ', bold: true }, { text: date }] },
    {
      segments: [{ text: 'Collector: ', bold: true }, { text: input.collectorName }],
    },
    { segments: [{ text: '' }] },
    { segments: [{ text: SEPARATOR }] },
    { segments: [{ text: '' }] },
    {
      segments: [
        {
          text: 'परमेश्वर तुम्हाला आणि तुमच्या कुटुंबियांना सुख, समृद्धी आणि उत्तम आरोग्य देवो.',
        },
      ],
    },
    { segments: [{ text: 'धन्यवाद.' }] },
    { segments: [{ text: '' }] },
    { segments: [{ text: 'अष्टविनायक युवक मंडळ', bold: true }] },
  ];
}

export function receiptLineText(line: ReceiptLine): string {
  return line.segments.map((segment) => segment.text).join('');
}

/** Plain text receipt (printer, PDF, details page share this). */
export function buildReceiptText(input: ReceiptInput): string {
  return buildReceiptLines(input).map(receiptLineText).join('\n');
}

/** WhatsApp variant: same layout, with *bold* only where already supported. */
export function buildWhatsAppReceipt(input: ReceiptInput): string {
  return buildReceiptLines(input)
    .map((line) =>
      line.segments
        .map((segment) => {
          if (!segment.bold) return segment.text;

          const leading = segment.text.match(/^\s*/)?.[0] ?? '';
          const trailing = segment.text.match(/\s*$/)?.[0] ?? '';
          const core = segment.text.slice(
            leading.length,
            segment.text.length - trailing.length,
          );

          return `${leading}*${core}*${trailing}`;
        })
        .join(''),
    )
    .join('\n');
}
