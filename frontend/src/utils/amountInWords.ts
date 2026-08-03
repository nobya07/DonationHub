const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n]!;

  const ten = Math.floor(n / 10);
  const one = n % 10;

  return one === 0 ? TENS[ten]! : `${TENS[ten]} ${ONES[one]}`;
}

function threeDigits(n: number): string {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;

  if (hundred === 0) return twoDigits(rest);

  const restWords = rest === 0 ? '' : ` ${twoDigits(rest)}`;

  return `${ONES[hundred]} Hundred${restWords}`;
}

/** Converts an integer to English words using the Indian numbering system. */
function integerToWords(n: number): string {
  if (n === 0) return 'Zero';

  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;

  const parts: string[] = [];

  if (crore > 0) parts.push(`${integerToWords(crore)} Crore`);
  if (lakh > 0) parts.push(`${integerToWords(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${integerToWords(thousand)} Thousand`);
  if (rest > 0) parts.push(threeDigits(rest));

  return parts.join(' ');
}

/**
 * Amount in English words, e.g. 1500 -> "One Thousand Five Hundred Rupees Only",
 * 1500.50 -> "One Thousand Five Hundred Rupees and Fifty Paise Only".
 */
export function amountInWords(amount: number): string {
  const rounded = Math.round(amount * 100);
  const rupees = Math.floor(rounded / 100);
  const paise = rounded % 100;

  if (rupees === 0 && paise === 0) return 'Zero Only';

  const parts: string[] = [];

  if (rupees > 0) parts.push(`${integerToWords(rupees)} Rupees`);
  if (paise > 0) parts.push(`${integerToWords(paise)} Paise`);

  return `${parts.join(' and ')} Only`;
}
