import * as fsPromises from 'fs/promises';
/**
 * Writable stream for writing to files (OPFS API compatible)
 */
export class FileSystemWritableFileStream {
    _path;
    _fd = null;
    _closed = false;
    _position = 0;
    _keepExistingData;
    constructor(filePath, keepExistingData = false) {
        this._path = filePath;
        this._keepExistingData = keepExistingData;
        this._initPromise = this._init();
    }
    _initPromise;
    async _init() {
        // Use 'r+' mode if keeping existing data, otherwise 'w' to truncate
        const mode = this._keepExistingData ? 'r+' : 'w';
        this._fd = await fsPromises.open(this._path, mode);
    }
    async _ensureOpen() {
        await this._initPromise;
        if (this._closed || !this._fd) {
            throw new Error('Stream is closed');
        }
    }
    /**
     * Write data to the file
     */
    async write(data) {
        await this._ensureOpen();
        let buffer;
        let position = undefined;
        // Handle WriteParams object
        if (typeof data === 'object' && data !== null && 'type' in data) {
            const params = data;
            if (params.type === 'write') {
                position = params.position;
                if (params.data instanceof ArrayBuffer || ArrayBuffer.isView(params.data)) {
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
                this._position = params.position ?? 0;
                return;
            }
            else if (params.type === 'truncate') {
                await this._fd.truncate(params.size ?? 0);
                return;
            }
            else {
                throw new Error('Unsupported write type');
            }
        }
        else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
            buffer = Buffer.from(data);
        }
        else if (typeof data === 'string') {
            buffer = Buffer.from(data);
        }
        else {
            throw new Error('Unsupported data type');
        }
        const writePosition = position !== undefined ? position : this._position;
        const { bytesWritten } = await this._fd.write(buffer, 0, buffer.length, writePosition);
        if (position === undefined) {
            this._position += bytesWritten;
        }
    }
    /**
     * Seek to a position in the file
     */
    async seek(position) {
        this._position = position;
    }
    /**
     * Truncate the file to the specified size
     */
    async truncate(size) {
        await this._ensureOpen();
        await this._fd.truncate(size);
    }
    /**
     * Close the stream
     */
    async close() {
        if (this._closed) {
            return;
        }
        await this._initPromise;
        if (this._fd) {
            await this._fd.sync();
            await this._fd.close();
            this._fd = null;
        }
        this._closed = true;
    }
}
//# sourceMappingURL=FileSystemWritableFileStream.js.map