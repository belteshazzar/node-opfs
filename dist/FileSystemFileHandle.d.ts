import * as fs from 'fs/promises';
import { File } from 'buffer';
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
     * Returns a writable stream for writing to the file. The real file is
     * left untouched until the stream is closed: writes (and, for
     * !keepExistingData, the truncation) happen against a private swap file
     * that's atomically swapped in on close().
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
 * Synchronous access handle for file operations.
 *
 * Maintains its own file position cursor exactly as spec'd: initialized to
 * 0, and updated after *every* read()/write() call -- including ones that
 * pass an explicit `at` -- to `at (or the prior cursor) + the amount
 * transferred`. This means a positioned call still advances the cursor for
 * whatever unpositioned call comes next, the same way real OPFS behaves.
 * (An earlier version of this class instead delegated to the OS file
 * descriptor's own position via `fs.readSync`/`writeSync`'s `position:
 * null` fallback, which only happened to look right for all-unpositioned
 * call sequences: pread/pwrite-style positioned calls don't move a file
 * descriptor's offset at all, so a positioned call followed by an
 * unpositioned one silently used the *pre-positioned-call* location
 * instead of the spec-correct `at + bytesTransferred`.)
 */
export declare class FileSystemSyncAccessHandle {
    private _fd;
    private _path;
    private _cursor;
    private _closed;
    constructor(fd: fs.FileHandle, filePath: string);
    /**
     * Read data from the file synchronously
     */
    read(buffer: ArrayBuffer | ArrayBufferView, options?: {
        at?: number;
    }): number;
    /**
     * Write data to the file synchronously
     */
    write(buffer: ArrayBuffer | ArrayBufferView, options?: {
        at?: number;
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