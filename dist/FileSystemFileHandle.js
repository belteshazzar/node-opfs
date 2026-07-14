import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import { File } from 'buffer';
import { FileSystemHandle } from './FileSystemHandle.js';
import { FileSystemWritableFileStream } from './FileSystemWritableFileStream.js';
import { acquireFileLock, releaseFileLock } from './FileLock.js';
import { swapPathFor } from './swapFile.js';
import { guessMimeType } from './mimeTypes.js';
/**
 * Represents a file handle
 */
export class FileSystemFileHandle extends FileSystemHandle {
    constructor(name, filePath) {
        super('file', name, filePath);
    }
    /**
     * Returns a File object representing the state on disk
     */
    async getFile() {
        const buffer = await fs.readFile(this._path);
        const stats = await fs.stat(this._path);
        // A real File (not a Blob wearing a File-shaped hat): passes
        // `instanceof File`/`instanceof Blob` like the browser, and has no
        // legacy `lastModifiedDate` property (removed from the spec years ago
        // and absent from real File objects, browser or Node).
        return new File([buffer], this.name, {
            type: guessMimeType(this.name),
            lastModified: stats.mtimeMs,
        });
    }
    /**
     * Returns a writable stream for writing to the file. The real file is
     * left untouched until the stream is closed: writes (and, for
     * !keepExistingData, the truncation) happen against a private swap file
     * that's atomically swapped in on close().
     */
    async createWritable(options) {
        const keepExistingData = options?.keepExistingData ?? false;
        // Only one writable stream or sync access handle may be open on a file
        // at a time, matching the browser's implicit readwrite lock. Acquiring
        // it opens (and flocks) the real file, so an entry removed out from
        // under this handle since it was created now surfaces as NotFoundError
        // here instead of silently resurrecting the file when the stream closes.
        try {
            acquireFileLock(this._path, this.name);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new DOMException(`'${this.name}' not found`, 'NotFoundError');
            }
            throw error;
        }
        const swapPath = swapPathFor(this._path);
        try {
            let fd;
            if (keepExistingData) {
                // Seed the swap file with the current committed content so
                // in-place writes/reads behave as if operating on the real file.
                await fs.copyFile(this._path, swapPath);
                fd = await fs.open(swapPath, 'r+');
            }
            else {
                // Fresh, empty swap file; the real file isn't truncated until
                // close() commits it.
                fd = await fs.open(swapPath, 'w');
            }
            return new FileSystemWritableFileStream(this._path, swapPath, fd);
        }
        catch (error) {
            // Best-effort cleanup of any partially-created swap file.
            await fs.rm(swapPath, { force: true }).catch(() => { });
            releaseFileLock(this._path);
            throw error;
        }
    }
    /**
     * Creates a synchronous access handle for the file
     * Note: This is primarily for use in workers in browsers
     */
    async createSyncAccessHandle() {
        // Only one writable stream or sync access handle may be open on a file
        // at a time, matching the browser's implicit readwrite lock. Acquiring
        // it opens (and flocks) the real file, so an entry removed out from
        // under this handle since it was created surfaces as NotFoundError here.
        try {
            acquireFileLock(this._path, this.name);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new DOMException(`'${this.name}' not found`, 'NotFoundError');
            }
            throw error;
        }
        try {
            const fd = await fs.open(this._path, 'r+');
            return new FileSystemSyncAccessHandle(fd, this._path);
        }
        catch (error) {
            releaseFileLock(this._path);
            if (error.code === 'ENOENT') {
                throw new DOMException(`'${this.name}' not found`, 'NotFoundError');
            }
            throw error;
        }
    }
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
export class FileSystemSyncAccessHandle {
    _fd;
    _path;
    _cursor = 0;
    _closed = false;
    constructor(fd, filePath) {
        this._fd = fd;
        this._path = filePath;
    }
    /**
     * Read data from the file synchronously
     */
    read(buffer, options) {
        if (this._closed) {
            throw new Error('Access handle is closed');
        }
        const buf = this._toMutableBuffer(buffer);
        const readStart = options?.at ?? this._cursor;
        const bytesRead = fsSync.readSync(this._fd.fd, buf, 0, buf.length, readStart);
        this._cursor = readStart + bytesRead;
        return bytesRead;
    }
    /**
     * Write data to the file synchronously
     */
    write(buffer, options) {
        if (this._closed) {
            throw new Error('Access handle is closed');
        }
        const buf = this._toImmutableBuffer(buffer);
        const writePosition = options?.at ?? this._cursor;
        const bytesWritten = fsSync.writeSync(this._fd.fd, buf, 0, buf.length, writePosition);
        // Per spec this advances by the buffer's size, not necessarily
        // bytesWritten -- a distinction that doesn't come up for a local
        // synchronous write, which either transfers the whole buffer or throws.
        this._cursor = writePosition + buf.length;
        return bytesWritten;
    }
    /**
     * Truncate the file to the specified size
     */
    truncate(newSize) {
        if (this._closed) {
            throw new Error('Access handle is closed');
        }
        fsSync.ftruncateSync(this._fd.fd, newSize);
        // Per spec, truncating below the current cursor clamps it to the new size.
        if (this._cursor > newSize) {
            this._cursor = newSize;
        }
    }
    /**
     * Get the size of the file
     */
    getSize() {
        if (this._closed) {
            throw new Error('Access handle is closed');
        }
        const stats = fsSync.fstatSync(this._fd.fd);
        return stats.size;
    }
    /**
     * Flush any pending writes
     */
    flush() {
        if (this._closed) {
            throw new Error('Access handle is closed');
        }
        fsSync.fsyncSync(this._fd.fd);
    }
    /**
     * Close the access handle
     */
    async close() {
        if (this._closed) {
            return;
        }
        try {
            await this._fd.close();
        }
        catch (error) {
            // Ignore if already closed
        }
        this._fd = null;
        this._closed = true;
        releaseFileLock(this._path);
    }
    _toMutableBuffer(input) {
        if (Buffer.isBuffer(input))
            return input;
        if (ArrayBuffer.isView(input)) {
            return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
        }
        if (input instanceof ArrayBuffer) {
            return Buffer.from(input);
        }
        throw new Error('Unsupported buffer type');
    }
    _toImmutableBuffer(input) {
        // For writes, the same conversion works; name indicates intent
        return this._toMutableBuffer(input);
    }
}
//# sourceMappingURL=FileSystemFileHandle.js.map