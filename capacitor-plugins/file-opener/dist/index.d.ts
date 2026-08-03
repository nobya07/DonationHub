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
export declare const FileOpener: FileOpenerPlugin;
