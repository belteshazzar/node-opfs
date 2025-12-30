import { FileSystemDirectoryHandle } from './FileSystemDirectoryHandle.js';
/**
 * Storage Manager for accessing the origin private file system
 */
export declare class StorageManager {
    private _baseDir;
    constructor(baseDir?: string);
    /**
     * Get the root directory handle for the origin private file system
     */
    getDirectory(): Promise<FileSystemDirectoryHandle>;
    /**
     * Set a custom base directory
     */
    setBaseDir(baseDir: string): void;
    /**
     * Get the current base directory
     */
    getBaseDir(): string;
}
/**
 * Global storage instance
 */
declare const storageManager: StorageManager;
/**
 * Navigator-like API for accessing storage
 */
export declare const storage: {
    getDirectory: () => Promise<FileSystemDirectoryHandle>;
};
/**
 * Navigator-like object
 */
export declare const navigator: {
    storage: {
        getDirectory: () => Promise<FileSystemDirectoryHandle>;
    };
};
export default storageManager;
//# sourceMappingURL=StorageManager.d.ts.map