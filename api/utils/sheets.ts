import { google, type sheets_v4 } from 'googleapis';
import { formatISTTimestamp } from './time.js';

let sheetsInstance: sheets_v4.Sheets | null = null;

function getSheets(): sheets_v4.Sheets {
  if (sheetsInstance) return sheetsInstance;

 const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

console.log('\n========== ENV DEBUG ==========');
console.log('GOOGLE_PROJECT_ID:', process.env.GOOGLE_PROJECT_ID);
console.log('GOOGLE_CLIENT_EMAIL:', process.env.GOOGLE_CLIENT_EMAIL);
console.log(
  'GOOGLE_PRIVATE_KEY exists:',
  !!process.env.GOOGLE_PRIVATE_KEY
);
console.log(
  'GOOGLE_PRIVATE_KEY length:',
  process.env.GOOGLE_PRIVATE_KEY?.length
);
console.log(
  'GOOGLE_SPREADSHEET_ID:',
  process.env.GOOGLE_SPREADSHEET_ID
);
console.log('JWT_SECRET exists:', !!process.env.JWT_SECRET);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('VERCEL_ENV:', process.env.VERCEL_ENV);
console.log('===============================\n');

if (!clientEmail || !privateKey) {
  throw new Error('Google service account credentials not configured');
}

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsInstance = google.sheets({
    version: 'v4',
    auth,
  });

  return sheetsInstance;
}

export type UserRole = 'Admin' | 'Collector';

export interface Collector {
  collectorId: string;
  username: string;
  password: string;
  collectorName: string;
  role: UserRole;
  active: boolean;
}

export interface NewCollectorInput {
  username: string;
  password: string;
  collectorName: string;
  role: UserRole;
  active: boolean;
}

export interface CollectorUpdates {
  username?: string;
  collectorName?: string;
  role?: UserRole;
  active?: boolean;
}

function getSpreadsheetId(): string {
  const id = process.env.GOOGLE_SPREADSHEET_ID;

  if (!id) {
    throw new Error(
      'GOOGLE_SPREADSHEET_ID environment variable is not set'
    );
  }

  return id;
}

const COLLECTORS_RANGE = 'Collectors!A:F';
const DONATIONS_RANGE = 'Donations!A:K';

function toRole(value: string | undefined): UserRole {
  return value?.trim() === 'Admin' ? 'Admin' : 'Collector';
}

function toActive(value: string | undefined): boolean {
  return value?.trim().toUpperCase() === 'TRUE';
}

function parseCollectorRow(row: string[] | undefined): Collector | null {
  if (!row) return null;

  const collectorId = row[0]?.trim() ?? '';
  const username = row[1]?.trim() ?? '';

  if (!collectorId || !username) return null;

  return {
    collectorId,
    username,
    password: row[2]?.trim() ?? '',
    collectorName: row[3]?.trim() ?? '',
    role: toRole(row[4]),
    active: toActive(row[5]),
  };
}

export async function getAllCollectors(): Promise<Collector[]> {
  const sheets = getSheets();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: COLLECTORS_RANGE,
  });

  const rows = response.data.values ?? [];

  const collectors: Collector[] = [];

  for (let i = 1; i < rows.length; i++) {
    const collector = parseCollectorRow(rows[i]);

    if (collector) collectors.push(collector);
  }

  return collectors;
}

export async function getCollector(
  username: string
): Promise<Collector | null> {
  const collectors = await getAllCollectors();

  const match = collectors.find(
    (c) =>
      c.username.trim().toLowerCase() === username.trim().toLowerCase()
  );

  return match ?? null;
}

export async function getCollectorById(
  collectorId: string
): Promise<Collector | null> {
  const collectors = await getAllCollectors();

  return collectors.find((c) => c.collectorId === collectorId) ?? null;
}

function collectorIdExists(
  collectors: Collector[],
  collectorId: string
): boolean {
  return collectors.some((c) => c.collectorId === collectorId);
}

function usernameExists(
  collectors: Collector[],
  username: string,
  excludeCollectorId?: string
): boolean {
  const normalized = username.trim().toLowerCase();

  return collectors.some(
    (c) =>
      c.collectorId !== excludeCollectorId &&
      c.username.trim().toLowerCase() === normalized
  );
}

export async function addCollector(
  input: NewCollectorInput
): Promise<Collector> {
  const sheets = getSheets();

  const collectors = await getAllCollectors();

  if (usernameExists(collectors, input.username)) {
    throw new Error('Username already exists');
  }

  let maxNumber = 0;

  for (const collector of collectors) {
    const match = /^COL-(\d+)$/.exec(collector.collectorId);

    if (match) {
      maxNumber = Math.max(maxNumber, Number(match[1]));
    }
  }

  const collectorId = `COL-${String(maxNumber + 1).padStart(6, '0')}`;

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: COLLECTORS_RANGE,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        collectorId,
        input.username.trim(),
        input.password,
        input.collectorName.trim(),
        input.role,
        input.active ? 'TRUE' : 'FALSE',
      ]],
    },
  });

  return {
    collectorId,
    username: input.username.trim(),
    password: input.password,
    collectorName: input.collectorName.trim(),
    role: input.role,
    active: input.active,
  };
}

export async function updateCollector(
  collectorId: string,
  updates: CollectorUpdates
): Promise<Collector> {
  const sheets = getSheets();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: COLLECTORS_RANGE,
  });

  const rows = response.data.values ?? [];

  let targetIndex = -1;

  for (let i = 1; i < rows.length; i++) {
    if ((rows[i]?.[0] ?? '').trim() === collectorId) {
      targetIndex = i;
      break;
    }
  }

  if (targetIndex === -1) {
    throw new Error('Collector not found');
  }

  const current = parseCollectorRow(rows[targetIndex]);

  if (!current) {
    throw new Error('Collector not found');
  }

  const username = (updates.username ?? current.username).trim();

  if (updates.username && usernameExists(await getAllCollectors(), username, collectorId)) {
    throw new Error('Username already exists');
  }

  const next: Collector = {
    collectorId,
    username,
    password: current.password,
    collectorName: (updates.collectorName ?? current.collectorName).trim(),
    role: updates.role ?? current.role,
    active: updates.active ?? current.active,
  };

  await sheets.spreadsheets.values.update({
    spreadsheetId: getSpreadsheetId(),
    range: `Collectors!A${targetIndex + 1}:F${targetIndex + 1}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        next.collectorId,
        next.username,
        next.password,
        next.collectorName,
        next.role,
        next.active ? 'TRUE' : 'FALSE',
      ]],
    },
  });

  return next;
}

export async function deleteCollectorRow(
  collectorId: string
): Promise<void> {
  const sheets = getSheets();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: COLLECTORS_RANGE,
  });

  const rows = response.data.values ?? [];

  let removed = false;

  const filtered = rows.filter((row, index) => {
    if (index === 0) return true;

    if ((row[0] ?? '').trim() === collectorId) {
      removed = true;
      return false;
    }

    return true;
  });

  if (!removed) {
    throw new Error('Collector not found');
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: getSpreadsheetId(),
    range: `Collectors!A1:F${filtered.length}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: filtered,
    },
  });

  if (rows.length > filtered.length) {
    await sheets.spreadsheets.values.clear({
      spreadsheetId: getSpreadsheetId(),
      range: `Collectors!A${filtered.length + 1}:F${rows.length}`,
    });
  }
}

export async function resetCollectorPassword(
  collectorId: string,
  newPassword: string
): Promise<void> {
  const sheets = getSheets();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: COLLECTORS_RANGE,
  });

  const rows = response.data.values ?? [];

  let targetIndex = -1;

  for (let i = 1; i < rows.length; i++) {
    if ((rows[i]?.[0] ?? '').trim() === collectorId) {
      targetIndex = i;
      break;
    }
  }

  if (targetIndex === -1) {
    throw new Error('Collector not found');
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: getSpreadsheetId(),
    range: `Collectors!C${targetIndex + 1}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[newPassword]],
    },
  });
}

export interface DonationRecord {
  timestamp: string;
  receiptNo: string;
  collectorId: string;
  collectorName: string;
  donorName: string;
  phone: string;
  address: string;
  amount: string;
  paymentMode: string;
  purpose: string;
  remarks: string;
}

export async function getNextReceiptNumber(): Promise<string> {
  const sheets = getSheets();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: 'Donations!B:B',
  });

  const rows = response.data.values;

  const dataRowCount = rows ? Math.max(rows.length - 1, 0) : 0;

  const nextNumber = dataRowCount + 1;

  return `DH-${String(nextNumber).padStart(6, '0')}`;
}

export async function getAllDonations(): Promise<DonationRecord[]> {
  const sheets = getSheets();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: DONATIONS_RANGE,
  });

  const rows = response.data.values ?? [];

  const donations: DonationRecord[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    if (!row || !(row[0] ?? '').trim()) continue;

    donations.push({
      timestamp: row[0]?.trim() ?? '',
      receiptNo: row[1]?.trim() ?? '',
      collectorId: row[2]?.trim() ?? '',
      collectorName: row[3]?.trim() ?? '',
      donorName: row[4]?.trim() ?? '',
      phone: row[5]?.trim() ?? '',
      address: row[6]?.trim() ?? '',
      amount: row[7]?.trim() ?? '0',
      paymentMode: row[8]?.trim() ?? '',
      purpose: row[9]?.trim() ?? '',
      remarks: row[10]?.trim() ?? '',
    });
  }

  return donations;
}

export async function appendDonation(
  record: DonationRecord
): Promise<void> {
  const sheets = getSheets();

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: 'Donations!A:K',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        record.timestamp,
        record.receiptNo,
        record.collectorId,
        record.collectorName,
        record.donorName,
        record.phone,
        record.address,
        record.amount,
        record.paymentMode,
        record.purpose,
        record.remarks,
      ]],
    },
  });
}

const WHATSAPP_SHEET_NAME = 'WhatsAppMessages';
const WHATSAPP_SHEET_RANGE = 'WhatsAppMessages!A:E';

function currentTimestamp(): string {
  return formatISTTimestamp();
}

async function ensureWhatsAppSheet(): Promise<void> {
  const sheets = getSheets();
  const spreadsheetId = getSpreadsheetId();

  const meta = await sheets.spreadsheets.get({ spreadsheetId });

  const exists = (meta.data.sheets ?? []).some(
    (sheet) => sheet.properties?.title === WHATSAPP_SHEET_NAME
  );

  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: { title: WHATSAPP_SHEET_NAME },
          },
        },
      ],
    },
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: WHATSAPP_SHEET_RANGE,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [['messageId', 'receiptNo', 'to', 'status', 'updatedAt']],
    },
  });
}

export async function recordWhatsAppMessage(
  messageId: string,
  receiptNo: string,
  to: string
): Promise<void> {
  const sheets = getSheets();

  await ensureWhatsAppSheet();

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: WHATSAPP_SHEET_RANGE,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[messageId, receiptNo, to, 'sent', currentTimestamp()]],
    },
  });
}

export async function updateWhatsAppMessageStatus(
  messageId: string,
  status: string
): Promise<void> {
  const sheets = getSheets();

  await ensureWhatsAppSheet();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: WHATSAPP_SHEET_RANGE,
  });

  const rows = response.data.values ?? [];

  for (let i = 1; i < rows.length; i++) {
    if ((rows[i]?.[0] ?? '').trim() === messageId) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: getSpreadsheetId(),
        range: `WhatsAppMessages!D${i + 1}:E${i + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[status, currentTimestamp()]],
        },
      });
      return;
    }
  }
}

export async function getWhatsAppMessageStatus(
  messageId: string
): Promise<string | null> {
  const sheets = getSheets();

  await ensureWhatsAppSheet();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: WHATSAPP_SHEET_RANGE,
  });

  const rows = response.data.values ?? [];

  for (let i = 1; i < rows.length; i++) {
    if ((rows[i]?.[0] ?? '').trim() === messageId) {
      return rows[i]?.[3]?.trim() ?? null;
    }
  }

  return null;
}
