import { registerPlugin } from '@capacitor/core';

export interface OpenFileOptions {
  path: string;
  mimeType?: string;
}

export interface OpenFileResult {
  completed: boolean;
}

export interface FileOpenerPlugin {
  openFile(options: OpenFileOptions): Promise<OpenFileResult>;
}

export const FileOpener = registerPlugin<FileOpenerPlugin>('FileOpener');
