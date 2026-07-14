/**
 * Acquires the readwrite lock for a file, throwing if it's already held.
 */
export declare function acquireFileLock(filePath: string, label?: string): void;
/**
 * Releases the readwrite lock for a file. Safe to call even if the lock
 * isn't held (e.g. double-close).
 */
export declare function releaseFileLock(filePath: string): void;
//# sourceMappingURL=FileLock.d.ts.map