import * as path from 'path';
import * as fs from 'fs/promises';
import { FileSystemHandle } from './FileSystemHandle.js';
import { FileSystemFileHandle } from './FileSystemFileHandle.js';

/**
 * Represents a directory handle
 */
export class FileSystemDirectoryHandle extends FileSystemHandle {
  constructor(name: string, dirPath: string) {
    super('directory', name, dirPath);
  }

  /**
   * Returns a file handle for a file in the directory
   */
  async getFileHandle(name: string, options?: FileSystemGetFileOptions): Promise<FileSystemFileHandle> {
    const filePath = path.join(this._path, name);
    const create = options?.create ?? false;

    try {
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        throw new TypeError(`'${name}' is not a file`);
      }
      return new FileSystemFileHandle(name, filePath);
    } catch (error: any) {
      if (error.code === 'ENOENT' && create) {
        // Create the file if it doesn't exist
        await fs.writeFile(filePath, '');
        return new FileSystemFileHandle(name, filePath);
      }
      throw new DOMException(`File '${name}' not found`, 'NotFoundError');
    }
  }

  /**
   * Returns a directory handle for a subdirectory
   */
  async getDirectoryHandle(name: string, options?: FileSystemGetDirectoryOptions): Promise<FileSystemDirectoryHandle> {
    const dirPath = path.join(this._path, name);
    const create = options?.create ?? false;

    try {
      const stats = await fs.stat(dirPath);
      if (!stats.isDirectory()) {
        throw new TypeError(`'${name}' is not a directory`);
      }
      return new FileSystemDirectoryHandle(name, dirPath);
    } catch (error: any) {
      if (create) {
        try {
          // Create the directory if it doesn't exist
          await fs.mkdir(dirPath, { recursive: false });
        } catch (mkdirError: any) {
          // If another caller created it first, treat it as success
          if (mkdirError.code === 'EEXIST') {
            const stats = await fs.stat(dirPath);
            if (!stats.isDirectory()) {
              throw new TypeError(`'${name}' is not a directory`);
            }
          } else {
            throw mkdirError;
          }
        }
        return new FileSystemDirectoryHandle(name, dirPath);
      }

      if (error.code === 'ENOENT') {
        throw new DOMException(`Directory '${name}' not found`, 'NotFoundError');
      }

      throw error;
    }
  }

  /**
   * Removes an entry from the directory
   */
  async removeEntry(name: string, options?: FileSystemRemoveOptions): Promise<void> {
    const entryPath = path.join(this._path, name);
    const recursive = options?.recursive ?? false;

    try {
      const stats = await fs.stat(entryPath);
      
      if (stats.isDirectory()) {
        if (recursive) {
          await fs.rm(entryPath, { recursive: true, force: false });
        } else {
          // Check if directory is empty
          const entries = await fs.readdir(entryPath);
          if (entries.length > 0) {
            throw new DOMException(
              `Directory '${name}' is not empty`,
              'InvalidModificationError'
            );
          }
          await fs.rmdir(entryPath);
        }
      } else {
        await fs.unlink(entryPath);
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new DOMException(`Entry '${name}' not found`, 'NotFoundError');
      }
      throw error;
    }
  }

  /**
   * Resolves a path relative to this directory
   */
  async resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null> {
    const descendantPath = (possibleDescendant as any)._path;
    
    if (!descendantPath.startsWith(this._path)) {
      return null;
    }

    const relativePath = path.relative(this._path, descendantPath);
    if (relativePath === '') {
      return [];
    }

    return relativePath.split(path.sep);
  }

  /**
   * Async iterator for entry keys (names)
   */
  async *keys(): AsyncIterableIterator<string> {
    const entries = await fs.readdir(this._path);
    for (const entry of entries) {
      yield entry;
    }
  }

  /**
   * Async iterator for entry values (handles)
   */
  async *values(): AsyncIterableIterator<FileSystemHandle> {
    const entries = await fs.readdir(this._path, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryPath = path.join(this._path, entry.name);
      
      if (entry.isFile()) {
        yield new FileSystemFileHandle(entry.name, entryPath);
      } else if (entry.isDirectory()) {
        yield new FileSystemDirectoryHandle(entry.name, entryPath);
      }
    }
  }

  /**
   * Async iterator for entries (key-value pairs)
   */
  async *entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
    const entries = await fs.readdir(this._path, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryPath = path.join(this._path, entry.name);
      
      if (entry.isFile()) {
        yield [entry.name, new FileSystemFileHandle(entry.name, entryPath)];
      } else if (entry.isDirectory()) {
        yield [entry.name, new FileSystemDirectoryHandle(entry.name, entryPath)];
      }
    }
  }

  /**
   * Make the directory iterable
   */
  [Symbol.asyncIterator](): AsyncIterableIterator<[string, FileSystemHandle]> {
    return this.entries();
  }
}

/**
 * Options for getFileHandle
 */
export interface FileSystemGetFileOptions {
  create?: boolean;
}

/**
 * Options for getDirectoryHandle
 */
export interface FileSystemGetDirectoryOptions {
  create?: boolean;
}

/**
 * Options for removeEntry
 */
export interface FileSystemRemoveOptions {
  recursive?: boolean;
}
