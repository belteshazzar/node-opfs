import * as path from 'path';
import * as fs from 'fs/promises';
import { FileSystemHandle } from './FileSystemHandle.js';
import { FileSystemFileHandle } from './FileSystemFileHandle.js';
import { isSwapFileName } from './swapFile.js';
import { assertValidName } from './validateName.js';
import { removeFileSystemEntry } from './removeHelper.js';

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
    // Only allow direct children (no path separators, no "." / "..")
    assertValidName(name);
    const filePath = path.join(this._path, name);
    const create = options?.create ?? false;

    let stats;
    try {
      stats = await fs.stat(filePath);
    } catch (error: any) {
      if (error.code === 'ENOENT' && create) {
        // Create the file if it doesn't exist
        await fs.writeFile(filePath, '');
        return new FileSystemFileHandle(name, filePath);
      }
      throw new DOMException(`File '${name}' not found`, 'NotFoundError');
    }

    // Checked outside the try/catch above so a wrong-kind entry reports
    // TypeMismatchError instead of being swallowed by the ENOENT handling
    // and reported as NotFoundError.
    if (!stats.isFile()) {
      throw new DOMException(`'${name}' is not a file`, 'TypeMismatchError');
    }
    return new FileSystemFileHandle(name, filePath);
  }

  /**
   * Returns a directory handle for a subdirectory
   */
  async getDirectoryHandle(name: string, options?: FileSystemGetDirectoryOptions): Promise<FileSystemDirectoryHandle> {
    // Only allow direct children (no path separators, no "." / "..")
    assertValidName(name);
    const dirPath = path.join(this._path, name);
    const create = options?.create ?? false;

    let stats;
    try {
      stats = await fs.stat(dirPath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }

      if (!create) {
        throw new DOMException(`Directory '${name}' not found`, 'NotFoundError');
      }

      try {
        // Create the directory if it doesn't exist
        await fs.mkdir(dirPath, { recursive: false });
      } catch (mkdirError: any) {
        // If another caller created it first, treat it as success
        if (mkdirError.code !== 'EEXIST') {
          throw mkdirError;
        }
        const raceStats = await fs.stat(dirPath);
        if (!raceStats.isDirectory()) {
          throw new DOMException(`'${name}' is not a directory`, 'TypeMismatchError');
        }
      }
      return new FileSystemDirectoryHandle(name, dirPath);
    }

    // Checked outside the try/catch above so a wrong-kind entry reports
    // TypeMismatchError instead of being swallowed by the ENOENT handling
    // and reported as NotFoundError.
    if (!stats.isDirectory()) {
      throw new DOMException(`'${name}' is not a directory`, 'TypeMismatchError');
    }
    return new FileSystemDirectoryHandle(name, dirPath);
  }

  /**
   * Removes an entry from the directory
   */
  async removeEntry(name: string, options?: FileSystemRemoveOptions): Promise<void> {
    // Only allow direct children (no path separators, no "." / "..")
    assertValidName(name);
    const entryPath = path.join(this._path, name);
    const recursive = options?.recursive ?? false;

    let stats;
    try {
      stats = await fs.stat(entryPath);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new DOMException(`Entry '${name}' not found`, 'NotFoundError');
      }
      throw error;
    }

    await removeFileSystemEntry(entryPath, name, recursive, stats.isDirectory());
  }

  /**
   * Resolves a path relative to this directory
   */
  async resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null> {
    const descendantPath = (possibleDescendant as any)._path;
    const relativePath = path.relative(this._path, descendantPath);

    if (relativePath === '') {
      return [];
    }

    // path.relative doesn't know about containment: if descendantPath isn't
    // actually inside this._path, the result either escapes upward (starts
    // with '..') or, on Windows, is a separate absolute path (different
    // drive). A plain string-prefix check on the raw paths would wrongly
    // treat a sibling like "foobar" as being inside "foo".
    const isOutside =
      relativePath === '..' ||
      relativePath.startsWith('..' + path.sep) ||
      path.isAbsolute(relativePath);

    if (isOutside) {
      return null;
    }

    return relativePath.split(path.sep);
  }

  /**
   * Async iterator for entry keys (names)
   */
  async *keys(): AsyncIterableIterator<string> {
    const entries = await fs.readdir(this._path);
    for (const entry of entries) {
      // Hide in-progress writable-stream swap files, matching real OPFS
      // where they're never visible via the directory API.
      if (isSwapFileName(entry)) continue;
      yield entry;
    }
  }

  /**
   * Async iterator for entry values (handles)
   */
  async *values(): AsyncIterableIterator<FileSystemHandle> {
    const entries = await fs.readdir(this._path, { withFileTypes: true });

    for (const entry of entries) {
      if (isSwapFileName(entry.name)) continue;
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
      if (isSwapFileName(entry.name)) continue;
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
