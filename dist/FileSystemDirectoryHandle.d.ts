import { FileSystemHandle } from './FileSystemHandle.js';
import { FileSystemFileHandle } from './FileSystemFileHandle.js';
/**
 * Represents a directory handle
 */
export declare class FileSystemDirectoryHandle extends FileSystemHandle {
    constructor(name: string, dirPath: string);
    /**
     * Returns a file handle for a file in the directory
     */
    getFileHandle(name: string, options?: FileSystemGetFileOptions): Promise<FileSystemFileHandle>;
    /**
     * Returns a directory handle for a subdirectory
     */
    getDirectoryHandle(name: string, options?: FileSystemGetDirectoryOptions): Promise<FileSystemDirectoryHandle>;
    /**
     * Removes an entry from the directory
     */
    removeEntry(name: string, options?: FileSystemRemoveOptions): Promise<void>;
    /**
     * Resolves a path relative to this directory
     */
    resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null>;
    /**
     * Async iterator for entry keys (names)
     */
    keys(): AsyncIterableIterator<string>;
    /**
     * Async iterator for entry values (handles)
     */
    values(): AsyncIterableIterator<FileSystemHandle>;
    /**
     * Async iterator for entries (key-value pairs)
     */
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
    /**
     * Make the directory iterable
     */
    [Symbol.asyncIterator](): AsyncIterableIterator<[string, FileSystemHandle]>;
}
/**
 * Options for getFileHandle
 */
export interface FileSystemGetFileOptions {
    create?: boolean;
}
/**
 * Options for getDirectoryHandle
 */
export interface FileSystemGetDirectoryOptions {
    create?: boolean;
}
/**
 * Options for removeEntry
 */
export interface FileSystemRemoveOptions {
    recursive?: boolean;
}
//# sourceMappingURL=FileSystemDirectoryHandle.d.ts.map