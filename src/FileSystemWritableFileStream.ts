import * as fs from 'fs';
import * as fsPromises from 'fs/promises';

/**
 * Buffer source type (compatible with browser API)
 */
export type BufferSource = ArrayBufferView | ArrayBuffer;

/**
 * Writable stream for writing to files (OPFS API compatible)
 */
export class FileSystemWritableFileStream {
  private _path: string;
  private _fd: fs.promises.FileHandle | null = null;
  private _closed = false;
  private _position = 0;
  private _keepExistingData: boolean;

  constructor(filePath: string, keepExistingData: boolean = false) {
    this._path = filePath;
    this._keepExistingData = keepExistingData;
    this._initPromise = this._init();
  }

  private _initPromise: Promise<void>;

  private async _init(): Promise<void> {
    // Use 'r+' mode if keeping existing data, otherwise 'w' to truncate
    const mode = this._keepExistingData ? 'r+' : 'w';
    this._fd = await fsPromises.open(this._path, mode);
  }

  private async _ensureOpen(): Promise<void> {
    await this._initPromise;
    if (this._closed || !this._fd) {
      throw new Error('Stream is closed');
    }
  }

  /**
   * Write data to the file
   */
  async write(data: BufferSource | Blob | string | WriteParams): Promise<void> {
    await this._ensureOpen();

    let buffer: Buffer;
    let position: number | undefined = undefined;

    // Handle WriteParams object
    if (typeof data === 'object' && data !== null && 'type' in data) {
      const params = data as WriteParams;
      
      if (params.type === 'write') {
        position = params.position;
        if (params.data instanceof ArrayBuffer || ArrayBuffer.isView(params.data)) {
          buffer = Buffer.from(params.data as ArrayBuffer);
        } else if (typeof params.data === 'string') {
          buffer = Buffer.from(params.data);
        } else {
          throw new Error('Unsupported data type');
        }
      } else if (params.type === 'seek') {
        this._position = params.position ?? 0;
        return;
      } else if (params.type === 'truncate') {
        await this._fd!.truncate(params.size ?? 0);
        return;
      } else {
        throw new Error('Unsupported write type');
      }
    } else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      buffer = Buffer.from(data as ArrayBuffer);
    } else if (typeof data === 'string') {
      buffer = Buffer.from(data);
    } else {
      throw new Error('Unsupported data type');
    }

    const writePosition = position !== undefined ? position : this._position;
    
    const { bytesWritten } = await this._fd!.write(buffer, 0, buffer.length, writePosition);
    if (position === undefined) {
      this._position += bytesWritten;
    }
  }

  /**
   * Seek to a position in the file
   */
  async seek(position: number): Promise<void> {
    this._position = position;
  }

  /**
   * Truncate the file to the specified size
   */
  async truncate(size: number): Promise<void> {
    await this._ensureOpen();
    await this._fd!.truncate(size);
  }

  /**
   * Close the stream
   */
  async close(): Promise<void> {
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

/**
 * Write parameters for the write method
 */
export type WriteParams = 
  | { type: 'write'; position?: number; data: BufferSource | Blob | string }
  | { type: 'seek'; position: number }
  | { type: 'truncate'; size?: number };

