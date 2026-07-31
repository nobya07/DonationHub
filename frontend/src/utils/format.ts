export function parseSheetTimestamp(timestamp: string): Date | null {
  const normalized = timestamp.includes('T') ? timestamp : timestamp.replace(' ', 'T');
  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function formatDate(timestamp: string): string {
  const date = parseSheetTimestamp(timestamp);

  if (!date) return timestamp;

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(timestamp: string): string {
  const date = parseSheetTimestamp(timestamp);

  if (!date) return timestamp;

  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function isToday(timestamp: string): boolean {
  const date = parseSheetTimestamp(timestamp);

  if (!date) return false;

  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export function dateKey(timestamp: string): string {
  return timestamp.slice(0, 10);
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
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function currentMonthStart(): string {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');

  return `${year}-${month}-01`;
}
