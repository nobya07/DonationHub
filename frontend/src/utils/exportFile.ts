import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { FileOpener } from 'file-opener';

/**
 * True only inside the Capacitor Android app (false in a normal browser).
 */
export function isCapacitorAndroid(): boolean {
  return Capacitor.getPlatform() === 'android';
}

/**
 * Converts a UTF-8 string (e.g. CSV with Devanagari text) to base64.
 */
export function base64FromUtf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Extracts the base64 payload from a jsPDF data-URL string.
 */
export function base64FromDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
}

/**
 * Saves a base64 file on Android via the Capacitor Filesystem plugin
 * (public Documents folder, falling back to the app's external Documents
 * folder), then opens it with the device's default viewer.
 *
 * @returns the saved file URI (file://...) for showing the location.
 */
export async function saveAndOpenFile(options: {
  filename: string;
  data: string;
  mimeType: string;
}): Promise<string> {
  let result;
  try {
    result = await Filesystem.writeFile({
      path: options.filename,
      data: options.data,
      directory: Directory.Documents,
      recursive: true,
    });
  } catch {
    result = await Filesystem.writeFile({
      path: options.filename,
      data: options.data,
      directory: Directory.External,
      recursive: true,
    });
  }

  try {
    await FileOpener.openFile({ path: result.uri, mimeType: options.mimeType });
  } catch {
    // No default viewer available; the file is still saved and the caller
    // will show its location.
  }

  return result.uri;
}
