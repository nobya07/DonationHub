const IST_TIME_ZONE = 'Asia/Kolkata';
const IST_MARKER = ' IST';

const IST_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: IST_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export interface ISTParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function istParts(date: Date): ISTParts {
  const parts = IST_PARTS_FORMATTER.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/**
 * Parses a sheet timestamp into a Date. New timestamps carry an explicit
 * " IST" marker and are parsed with the +05:30 offset; legacy timestamps
 * (stored in UTC before the timezone fix) are interpreted as UTC. Either
 * way the returned Date represents the correct instant and all formatting
 * renders it in Asia/Kolkata (IST).
 */
export function parseSheetTimestamp(timestamp: string): Date | null {
  const normalized = timestamp.includes('T')
    ? timestamp
    : timestamp.replace(' ', 'T');
  const isISTMarked = normalized.endsWith(IST_MARKER);
  const cleaned = isISTMarked ? normalized.slice(0, -IST_MARKER.length) : normalized;
  const hasOffset = /[zZ]$/.test(cleaned) || /[+-]\d{2}:\d{2}$/.test(cleaned);

  let iso: string;
  if (isISTMarked) {
    iso = `${cleaned}+05:30`;
  } else if (hasOffset) {
    iso = cleaned;
  } else {
    iso = `${cleaned}Z`;
  }

  const date = new Date(iso);

  return Number.isNaN(date.getTime()) ? null : date;
}

const INR_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number): string {
  return INR_FORMATTER.format(value);
}

const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: IST_TIME_ZONE,
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: IST_TIME_ZONE,
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function formatDate(timestamp: string): string {
  const date = parseSheetTimestamp(timestamp);

  if (!date) return timestamp;

  return DATE_FORMATTER.format(date);
}

export function formatDateTime(timestamp: string): string {
  const date = parseSheetTimestamp(timestamp);

  if (!date) return timestamp;

  return DATE_TIME_FORMATTER.format(date);
}

/** Current date and time in IST, e.g. "Aug 2, 2026, 12:26 AM". */
export function formatISTNow(): string {
  return DATE_TIME_FORMATTER.format(new Date());
}

/** Formats an epoch-milliseconds timestamp in IST (e.g. printer last print). */
export function formatTimestampMs(ms: number): string {
  return DATE_TIME_FORMATTER.format(new Date(ms));
}

const RECEIPT_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: IST_TIME_ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** Receipt-friendly IST date, e.g. "02 Aug 2026, 12:45 AM". */
export function formatISTReceiptDate(timestamp: number | Date): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const parts = RECEIPT_DATE_FORMATTER.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  const day = get('day');
  const month = get('month');
  const year = get('year');
  const hour = get('hour');
  const minute = get('minute');
  const period = get('dayPeriod');

  return `${day} ${month} ${year}, ${hour}:${minute} ${period}`;
}

export function isToday(timestamp: string): boolean {
  const date = parseSheetTimestamp(timestamp);

  if (!date) return false;

  const record = istParts(date);
  const now = istParts(new Date());

  return (
    record.year === now.year &&
    record.month === now.month &&
    record.day === now.day
  );
}

export function dateKey(timestamp: string): string {
  return timestamp.slice(0, 10);
}

/** Date key (YYYY-MM-DD) of a record in IST. */
export function istDateKey(timestamp: string): string | null {
  const date = parseSheetTimestamp(timestamp);

  if (!date) return null;

  const parts = istParts(date);

  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(
    parts.day,
  ).padStart(2, '0')}`;
}

export function isWithinRange(
  timestamp: string,
  from?: string,
  to?: string,
): boolean {
  const key = dateKey(timestamp);

  if (from && key < from) return false;
  if (to && key > to) return false;

  return true;
}

export function monthKey(timestamp: string): string {
  return timestamp.slice(0, 7);
}

export function formatMonth(key: string): string {
  const [year, month] = key.split('-').map(Number);

  if (!year || !month) return key;

  const date = new Date(year, month - 1, 1);

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
  });
}

export function todayKey(): string {
  const now = istParts(new Date());

  return `${now.year}-${String(now.month).padStart(2, '0')}-${String(
    now.day,
  ).padStart(2, '0')}`;
}

export function currentMonthStart(): string {
  const now = istParts(new Date());

  return `${now.year}-${String(now.month).padStart(2, '0')}-01`;
}

/** IST date key for "days" days before today. */
export function daysAgoKey(days: number): string {
  const now = istParts(new Date());
  const date = new Date(now.year, now.month - 1, now.day - days);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/** Current hour in IST (0-23), used for greetings and time-based UI. */
export function currentISTHour(): number {
  return istParts(new Date()).hour;
}
