import * as fs from 'fs';
/**
 * Buffer source type (compatible with browser API)
 */
export type BufferSource = ArrayBufferView | ArrayBuffer;
/**
 * Write parameters for the write method
 */
export type WriteParams = {
    type: 'write';
    position?: number;
    data: BufferSource | Blob | string;
} | {
    type: 'seek';
    position: number;
} | {
    type: 'truncate';
    size?: number;
};
/**
 * Chunk type accepted by the stream, matching the real
 * FileSystemWriteChunkType from the File System spec.
 */
export type FileSystemWriteChunkType = BufferSource | Blob | string | WriteParams;
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
export declare class FileSystemWritableFileStream extends WritableStream<FileSystemWriteChunkType> {
    constructor(filePath: string, swapPath: string, fd: fs.promises.FileHandle);
    /**
     * Write data to the file. Convenience wrapper equivalent to (and, per
     * spec, implemented as) acquiring a writer, writing one chunk, and
     * releasing the lock.
     */
    write(data: FileSystemWriteChunkType): Promise<void>;
    /**
     * Seek to a position in the file
     */
    seek(position: number): Promise<void>;
    /**
     * Truncate the file to the specified size
     */
    truncate(size: number): Promise<void>;
}
//# sourceMappingURL=FileSystemWritableFileStream.d.ts.map