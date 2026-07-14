import * as fsPromises from 'fs/promises';
import { releaseFileLock } from './FileLock.js';
/**
 * Writable stream for writing to files (OPFS API compatible).
 *
 * This is a real WritableStream subclass (as OPFS specifies), backed by an
 * underlying sink so getWriter()/pipeTo()/pipeThrough()/abort()/.locked all
 * work as in the browser -- e.g. `readable.pipeTo(writable)` for streaming
 * a fetch response straight into OPFS. write()/seek()/truncate() are thin
 * convenience wrappers over the writer protocol (acquire a writer, write
 * one chunk, release the lock), matching how the real spec defines them.
 *
 * All writes land in a private temporary "swap" file, already open by the
 * time this stream is constructed (see FileSystemFileHandle.createWritable,
 * which owns setting that up so a setup failure rejects createWritable()
 * itself rather than surfacing later as an unhandled rejection). The real
 * file is only replaced (atomically, via rename) when the sink's close()
 * callback runs: the original content stays intact and fully readable via
 * getFile() for the entire time the stream is open, and a stream that's
 * abandoned without close() never touches the real file. abort() instead
 * discards the swap file, leaving the real file untouched.
 */
export class FileSystemWritableFileStream extends WritableStream {
    constructor(filePath, swapPath, fd) {
        // Closure state instead of instance fields: these are read/written by
        // the sink callbacks below, which can outlive `this` being fully
        // constructed (they're only invoked later, once the stream machinery
        // calls them) but must not reference `this` before super() returns.
        let position = 0;
        let currentFd = fd;
        super({
            write: async (chunk) => {
                let buffer;
                let writePosition = undefined;
                // Blob must be checked before the WriteParams duck-type check
                // below: a Blob has its own `.type` property (its MIME type),
                // which would otherwise falsely match `'type' in chunk` and get
                // misrouted as an attempted WriteParams object.
                if (chunk instanceof Blob) {
                    buffer = Buffer.from(await chunk.arrayBuffer());
                }
                else if (typeof chunk === 'object' && chunk !== null && 'type' in chunk) {
                    // Handle WriteParams object
                    const params = chunk;
                    if (params.type === 'write') {
                        writePosition = params.position;
                        if (params.data instanceof Blob) {
                            buffer = Buffer.from(await params.data.arrayBuffer());
                        }
                        else if (params.data instanceof ArrayBuffer || ArrayBuffer.isView(params.data)) {
                            buffer = Buffer.from(params.data);
                        }
                        else if (typeof params.data === 'string') {
                            buffer = Buffer.from(params.data);
                        }
                        else {
                            throw new Error('Unsupported data type');
                        }
                    }
                    else if (params.type === 'seek') {
                        position = params.position ?? 0;
                        return;
                    }
                    else if (params.type === 'truncate') {
                        const newSize = params.size ?? 0;
                        const { size: oldSize } = await currentFd.stat();
                        await currentFd.truncate(newSize);
                        // Per spec, this clamp only applies when shrinking: if the
                        // new size is smaller than the old size and the write
                        // position now exceeds it, pull the position back to the new
                        // end of file. Growing the file never clamps, even if the
                        // position was already beyond the (smaller) old size from an
                        // earlier out-of-bounds seek() -- matching the spec's
                        // algorithm exactly rather than just clamping unconditionally.
                        if (newSize < oldSize && position > newSize) {
                            position = newSize;
                        }
                        return;
                    }
                    else {
                        throw new Error('Unsupported write type');
                    }
                }
                else if (chunk instanceof ArrayBuffer || ArrayBuffer.isView(chunk)) {
                    buffer = Buffer.from(chunk);
                }
                else if (typeof chunk === 'string') {
                    buffer = Buffer.from(chunk);
                }
                else {
                    throw new Error('Unsupported data type');
                }
                const target = writePosition !== undefined ? writePosition : position;
                const { bytesWritten } = await currentFd.write(buffer, 0, buffer.length, target);
                // Per spec, the stream's position always advances past what was
                // just written -- including a positioned write -- so a later
                // unpositioned write continues from there, not from wherever the
                // cursor happened to be before this call.
                position = target + bytesWritten;
            },
            close: async () => {
                try {
                    if (currentFd) {
                        await currentFd.sync();
                        await currentFd.close();
                        currentFd = null;
                    }
                    // Atomic on POSIX (same-directory rename); this is the moment
                    // the new content becomes visible to readers, not any point
                    // before it.
                    await fsPromises.rename(swapPath, filePath);
                }
                finally {
                    releaseFileLock(filePath);
                }
            },
            abort: async () => {
                try {
                    if (currentFd) {
                        await currentFd.close().catch(() => { });
                        currentFd = null;
                    }
                    // Discard the swap file: an aborted write must never affect the
                    // real file's contents.
                    await fsPromises.rm(swapPath, { force: true }).catch(() => { });
                }
                finally {
                    releaseFileLock(filePath);
                }
            },
        });
    }
    /**
     * Write data to the file. Convenience wrapper equivalent to (and, per
     * spec, implemented as) acquiring a writer, writing one chunk, and
     * releasing the lock.
     */
    async write(data) {
        const writer = this.getWriter();
        try {
            await writer.write(data);
        }
        finally {
            writer.releaseLock();
        }
    }
    /**
     * Seek to a position in the file
     */
    async seek(position) {
        const writer = this.getWriter();
        try {
            await writer.write({ type: 'seek', position });
        }
        finally {
            writer.releaseLock();
        }
    }
    /**
     * Truncate the file to the specified size
     */
    async truncate(size) {
        const writer = this.getWriter();
        try {
            await writer.write({ type: 'truncate', size });
        }
        finally {
            writer.releaseLock();
        }
    }
}
//# sourceMappingURL=FileSystemWritableFileStream.js.map