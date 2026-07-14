/**
 * Emulates OPFS's implicit per-file readwrite lock: at most one
 * FileSystemWritableFileStream or FileSystemSyncAccessHandle may be open on
 * a given file at a time. Locking is keyed by resolved filesystem path
 * (not handle instance) since the browser lock applies to the underlying
 * file entry, and two separate handles can refer to the same entry.
 */
const lockedPaths = new Set<string>();

/**
 * Acquires the readwrite lock for a file, throwing if it's already held.
 */
export function acquireFileLock(filePath: string, label: string = filePath): void {
  if (lockedPaths.has(filePath)) {
    throw new DOMException(
      `'${label}' is already open for writing (a FileSystemWritableFileStream or FileSystemSyncAccessHandle must be closed before another can be opened)`,
      'NoModificationAllowedError'
    );
  }
  lockedPaths.add(filePath);
}

/**
 * Releases the readwrite lock for a file. Safe to call even if the lock
 * isn't held (e.g. double-close).
 */
export function releaseFileLock(filePath: string): void {
  lockedPaths.delete(filePath);
}
