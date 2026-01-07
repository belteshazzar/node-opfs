import * as fs from 'fs/promises';
import { FileSystemHandle } from './FileSystemHandle.js';
import { FileSystemWritableFileStream } from './FileSystemWritableFileStream.js';
/**
 * Represents a file handle
 */
export declare class FileSystemFileHandle extends FileSystemHandle {
    constructor(name: string, filePath: string);
    /**
     * Returns a File object representing the state on disk
     */
    getFile(): Promise<File>;
    /**
     * Returns a writable stream for writing to the file
     */
    createWritable(options?: FileSystemCreateWritableOptions): Promise<FileSystemWritableFileStream>;
    /**
     * Creates a synchronous access handle for the file
     * Note: This is primarily for use in workers in browsers
     */
    createSyncAccessHandle(): Promise<FileSystemSyncAccessHandle>;
}
/**
 * Options for createWritable
 */
export interface FileSystemCreateWritableOptions {
    keepExistingData?: boolean;
}
/**
 * Synchronous access handle for file operations
 */
export declare class FileSystemSyncAccessHandle {
    private _fd;
    private _closed;
    constructor(fd: fs.FileHandle);
    /**
     * Read data from the file synchronously
     */
    read(buffer: ArrayBuffer | ArrayBufferView, options?: {
        at: number;
    }): number;
    /**
     * Write data to the file synchronously
     */
    write(buffer: ArrayBuffer | ArrayBufferView, options?: {
        at: number;
    }): number;
    /**
     * Truncate the file to the specified size
     */
    truncate(newSize: number): void;
    /**
     * Get the size of the file
     */
    getSize(): number;
    /**
     * Flush any pending writes
     */
    flush(): void;
    /**
     * Close the access handle
     */
    close(): Promise<void>;
    private _toMutableBuffer;
    private _toImmutableBuffer;
}
//# sourceMappingURL=FileSystemFileHandle.d.ts.map