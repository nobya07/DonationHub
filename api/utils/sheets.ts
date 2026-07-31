import { google, type sheets_v4 } from 'googleapis';

let sheetsInstance: sheets_v4.Sheets | null = null;

function getSheets(): sheets_v4.Sheets {
  if (sheetsInstance) return sheetsInstance;

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

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

export interface Collector {
  collectorId: string;
  username: string;
  password: string;
  collectorName: string;
  active: boolean;
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

export async function getCollector(
  username: string
): Promise<Collector | null> {
  const sheets = getSheets();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: 'Collectors!A:E',
  });

  const rows = response.data.values;

  if (!rows || rows.length < 2) {
    return null;
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    if (!row || row.length < 5) continue;

    const [
      collectorId,
      rowUsername,
      password,
      collectorName,
      active,
    ] = row;

    if (
      rowUsername?.trim().toLowerCase() ===
      username.trim().toLowerCase()
    ) {
      return {
        collectorId: collectorId?.trim() ?? '',
        username: rowUsername.trim(),
        password: password?.trim() ?? '',
        collectorName: collectorName?.trim() ?? '',
        active: active?.trim().toUpperCase() === 'TRUE',
      };
    }
  }

  return null;
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