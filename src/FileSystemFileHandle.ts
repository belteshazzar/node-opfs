import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import { FileSystemHandle } from './FileSystemHandle.js';
import { FileSystemWritableFileStream } from './FileSystemWritableFileStream.js';

/**
 * Represents a file handle
 */
export class FileSystemFileHandle extends FileSystemHandle {
  constructor(name: string, filePath: string) {
    super('file', name, filePath);
  }

  /**
   * Returns a File object representing the state on disk
   */
  async getFile(): Promise<File> {
    const buffer = await fs.readFile(this._path);
    const stats = await fs.stat(this._path);
    
    // Create a File-like object
    const file = new Blob([buffer], { type: 'application/octet-stream' }) as any;
    file.name = this.name;
    file.lastModified = stats.mtimeMs;
    file.lastModifiedDate = stats.mtime;
    
    return file as File;
  }

  /**
   * Returns a writable stream for writing to the file
   */
  async createWritable(options?: FileSystemCreateWritableOptions): Promise<FileSystemWritableFileStream> {
    const keepExistingData = options?.keepExistingData ?? false;

    // If keepExistingData is false, truncate the file
    if (!keepExistingData) {
      await fs.writeFile(this._path, '');
    }

    return new FileSystemWritableFileStream(this._path, keepExistingData);
  }

  /**
   * Creates a synchronous access handle for the file
   * Note: This is primarily for use in workers in browsers
   */
  async createSyncAccessHandle(): Promise<FileSystemSyncAccessHandle> {
    const fd = await fs.open(this._path, 'r+');
    return new FileSystemSyncAccessHandle(fd);
  }
}

/**
 * Options for createWritable
 */
export interface FileSystemCreateWritableOptions {
  keepExistingData?: boolean;
}

/**
 * Synchronous access handle for file operations
 */
export class FileSystemSyncAccessHandle {
  private _fd: fs.FileHandle;
  private _closed = false;

  constructor(fd: fs.FileHandle) {
    this._fd = fd;
  }

  /**
   * Read data from the file synchronously
   */
  read(buffer: ArrayBuffer | ArrayBufferView, options?: { at: number }): number {
    if (this._closed) {
      throw new Error('Access handle is closed');
    }
    const buf = this._toMutableBuffer(buffer);
    const position = options?.at ?? null;
    
    // Perform a synchronous read into the provided buffer
    const bytesRead = fsSync.readSync(this._fd.fd, buf, 0, buf.length, position);
    return bytesRead;
  }

  /**
   * Write data to the file synchronously
   */
  write(buffer: ArrayBuffer | ArrayBufferView, options?: { at: number }): number {
    if (this._closed) {
      throw new Error('Access handle is closed');
    }
    const buf = this._toImmutableBuffer(buffer);
    const position = options?.at ?? null;
    
    // Perform a synchronous write from the provided buffer
    const bytesWritten = fsSync.writeSync(this._fd.fd, buf, 0, buf.length, position);
    return bytesWritten;
  }

  /**
   * Truncate the file to the specified size
   */
  async truncate(newSize: number): Promise<void> {
    if (this._closed) {
      throw new Error('Access handle is closed');
    }
    await this._fd.truncate(newSize);
  }

  /**
   * Get the size of the file
   */
  async getSize(): Promise<number> {
    if (this._closed) {
      throw new Error('Access handle is closed');
    }
    const stats = await this._fd.stat();
    return stats.size;
  }

  /**
   * Flush any pending writes
   */
  async flush(): Promise<void> {
    if (this._closed) {
      throw new Error('Access handle is closed');
    }
    await this._fd.sync();
  }

  /**
   * Close the access handle
   */
  async close(): Promise<void> {
    if (this._closed) {
      return;
    }
    await this._fd.close();
    this._closed = true;
  }

  private _toMutableBuffer(input: ArrayBuffer | ArrayBufferView | Buffer): Buffer {
    if (Buffer.isBuffer(input)) return input;
    if (ArrayBuffer.isView(input)) {
      return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
    }
    if (input instanceof ArrayBuffer) {
      return Buffer.from(input);
    }
    throw new Error('Unsupported buffer type');
  }

  private _toImmutableBuffer(input: ArrayBuffer | ArrayBufferView | Buffer): Buffer {
    // For writes, the same conversion works; name indicates intent
    return this._toMutableBuffer(input);
  }
}
