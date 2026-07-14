import { FileSystemDirectoryHandle } from './FileSystemDirectoryHandle.js';
/**
 * Result of StorageManager.estimate(), mirroring navigator.storage.estimate().
 */
export interface StorageEstimate {
    usage: number;
    quota: number;
}
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
    /**
     * Estimates storage usage and quota for this origin's storage, mirroring
     * navigator.storage.estimate(). `usage` is the actual on-disk byte total
     * under the storage root (a real measurement, not a browser-style
     * estimate, since Node has no cheaper way to approximate it). `quota`
     * approximates "how much this storage could grow to in total" as current
     * usage plus the remaining free space on the underlying filesystem --
     * this keeps the usage <= quota invariant real callers rely on. If the
     * platform/filesystem doesn't support statfs, quota falls back to
     * reporting usage (i.e. "no known headroom") rather than throwing.
     */
    estimate(): Promise<StorageEstimate>;
    /**
     * Requests that storage not be cleared without the user's permission.
     * Node has no storage-eviction-under-pressure concept the way browsers
     * do, so storage here is always effectively persisted -- this always
     * resolves true, matching what a browser reports once persistence has
     * already been granted.
     */
    persist(): Promise<boolean>;
    /**
     * Node has no eviction concept, so storage is always persisted.
     */
    persisted(): Promise<boolean>;
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
    estimate: () => Promise<StorageEstimate>;
    persist: () => Promise<boolean>;
    persisted: () => Promise<boolean>;
};
/**
 * Navigator-like object
 */
export declare const navigator: {
    storage: {
        getDirectory: () => Promise<FileSystemDirectoryHandle>;
        estimate: () => Promise<StorageEstimate>;
        persist: () => Promise<boolean>;
        persisted: () => Promise<boolean>;
    };
};
export default storageManager;
//# sourceMappingURL=StorageManager.d.ts.map