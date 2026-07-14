import * as fs from 'fs';
import { flockSync } from 'fs-ext';
/**
 * Emulates OPFS's implicit per-file readwrite lock: at most one
 * FileSystemWritableFileStream or FileSystemSyncAccessHandle may be open on
 * a given file at a time. Unlike the browser (where the lock only needs to
 * mean something within one JS runtime), this also has to hold across
 * separate Node processes on the same host, so the lock is a real OS
 * advisory lock (flock(2)/LockFileEx) taken on the file itself, not just an
 * in-memory flag. Locking is keyed by resolved filesystem path (not handle
 * instance) since the lock applies to the underlying file entry, and two
 * separate handles can refer to the same entry.
 *
 * A dedicated fd is opened purely to hold the flock, independent of
 * whatever fd the caller uses to actually read/write -- flock locks are
 * scoped to the open file description, not the path or process, so a
 * second acquireFileLock() on the same path (same process or another)
 * always opens its own fd and correctly conflicts with the first.
 */
const lockedFds = new Map();
/**
 * Acquires the readwrite lock for a file, throwing if it's already held --
 * by this process or any other process on the host with the file open via
 * this library.
 */
export function acquireFileLock(filePath, label = filePath) {
    const fd = fs.openSync(filePath, 'r+');
    try {
        flockSync(fd, 'exnb');
    }
    catch (error) {
        fs.closeSync(fd);
        if (error.code === 'EAGAIN' || error.code === 'EWOULDBLOCK') {
            throw new DOMException(`'${label}' is already open for writing (a FileSystemWritableFileStream or FileSystemSyncAccessHandle must be closed before another can be opened)`, 'NoModificationAllowedError');
        }
        throw error;
    }
    lockedFds.set(filePath, fd);
}
/**
 * Releases the readwrite lock for a file. Safe to call even if the lock
 * isn't held (e.g. double-close).
 */
export function releaseFileLock(filePath) {
    const fd = lockedFds.get(filePath);
    if (fd === undefined) {
        return;
    }
    lockedFds.delete(filePath);
    try {
        flockSync(fd, 'un');
    }
    finally {
        fs.closeSync(fd);
    }
}
//# sourceMappingURL=FileLock.js.map