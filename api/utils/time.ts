const IST_TIME_ZONE = 'Asia/Kolkata';
const IST_MARKER = ' IST';

const IST_PARTS_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: IST_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Returns the current wall-clock time in Asia/Kolkata (IST) as
 * "YYYY-MM-DD HH:MM:SS IST". The explicit " IST" marker distinguishes
 * new IST timestamps from legacy records that were stored in UTC.
 */
export function formatISTTimestamp(date: Date = new Date()): string {
  const parts = IST_PARTS_FORMATTER.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  const year = get('year');
  const month = pad(Number(get('month')));
  const day = pad(Number(get('day')));
  const hours = pad(Number(get('hour')));
  const minutes = pad(Number(get('minute')));
  const seconds = pad(Number(get('second')));

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}${IST_MARKER}`;
}
