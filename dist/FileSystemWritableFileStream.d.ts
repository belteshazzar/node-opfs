/**
 * Buffer source type (compatible with browser API)
 */
export type BufferSource = ArrayBufferView | ArrayBuffer;
/**
 * Writable stream for writing to files (OPFS API compatible)
 */
export declare class FileSystemWritableFileStream {
    private _path;
    private _fd;
    private _closed;
    private _position;
    private _keepExistingData;
    constructor(filePath: string, keepExistingData?: boolean);
    private _initPromise;
    private _init;
    private _ensureOpen;
    /**
     * Write data to the file
     */
    write(data: BufferSource | Blob | string | WriteParams): Promise<void>;
    /**
     * Seek to a position in the file
     */
    seek(position: number): Promise<void>;
    /**
     * Truncate the file to the specified size
     */
    truncate(size: number): Promise<void>;
    /**
     * Close the stream
     */
    close(): Promise<void>;
}
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
//# sourceMappingURL=FileSystemWritableFileStream.d.ts.map