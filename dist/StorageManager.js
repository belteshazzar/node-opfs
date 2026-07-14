import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { FileSystemDirectoryHandle } from './FileSystemDirectoryHandle.js';
import { isSwapFileName } from './swapFile.js';
/**
 * Recursively sums file sizes under a directory, matching what
 * FileSystemDirectoryHandle's iteration methods consider "real" entries:
 * in-progress writable-stream swap files are excluded, the same way
 * they're hidden from keys()/values()/entries().
 */
async function computeDirectorySize(dirPath) {
    let total = 0;
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        if (isSwapFileName(entry.name))
            continue;
        const entryPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            total += await computeDirectorySize(entryPath);
        }
        else if (entry.isFile()) {
            const stats = await fs.stat(entryPath);
            total += stats.size;
        }
    }
    return total;
}
/**
 * Storage Manager for accessing the origin private file system
 */
export class StorageManager {
    _baseDir;
    constructor(baseDir) {
        // Default to a directory in the user's home directory
        this._baseDir = baseDir || path.join(os.homedir(), '.node-opfs');
    }
    /**
     * Get the root directory handle for the origin private file system
     */
    async getDirectory() {
        // Ensure the base directory exists
        await fs.mkdir(this._baseDir, { recursive: true });
        return new FileSystemDirectoryHandle('', this._baseDir);
    }
    /**
     * Set a custom base directory
     */
    setBaseDir(baseDir) {
        this._baseDir = baseDir;
    }
    /**
     * Get the current base directory
     */
    getBaseDir() {
        return this._baseDir;
    }
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
    async estimate() {
        await fs.mkdir(this._baseDir, { recursive: true });
        const usage = await computeDirectorySize(this._baseDir);
        let quota = usage;
        try {
            const stats = await fs.statfs(this._baseDir);
            quota = usage + stats.bavail * stats.bsize;
        }
        catch {
            // statfs isn't supported on every platform/filesystem.
        }
        return { usage, quota };
    }
    /**
     * Requests that storage not be cleared without the user's permission.
     * Node has no storage-eviction-under-pressure concept the way browsers
     * do, so storage here is always effectively persisted -- this always
     * resolves true, matching what a browser reports once persistence has
     * already been granted.
     */
    async persist() {
        return true;
    }
    /**
     * Node has no eviction concept, so storage is always persisted.
     */
    async persisted() {
        return true;
    }
}
/**
 * Global storage instance
 */
const storageManager = new StorageManager();
/**
 * Navigator-like API for accessing storage
 */
export const storage = {
    getDirectory: () => storageManager.getDirectory(),
    estimate: () => storageManager.estimate(),
    persist: () => storageManager.persist(),
    persisted: () => storageManager.persisted()
};
/**
 * Navigator-like object
 */
export const navigator = {
    storage
};
export default storageManager;
//# sourceMappingURL=StorageManager.js.map