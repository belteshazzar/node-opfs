import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { FileSystemDirectoryHandle } from './FileSystemDirectoryHandle.js';

/**
 * Storage Manager for accessing the origin private file system
 */
export class StorageManager {
  private _baseDir: string;

  constructor(baseDir?: string) {
    // Default to a directory in the user's home directory
    this._baseDir = baseDir || path.join(os.homedir(), '.node-opfs');
  }

  /**
   * Get the root directory handle for the origin private file system
   */
  async getDirectory(): Promise<FileSystemDirectoryHandle> {
    // Ensure the base directory exists
    await fs.mkdir(this._baseDir, { recursive: true });
    
    return new FileSystemDirectoryHandle('', this._baseDir);
  }

  /**
   * Set a custom base directory
   */
  setBaseDir(baseDir: string): void {
    this._baseDir = baseDir;
  }

  /**
   * Get the current base directory
   */
  getBaseDir(): string {
    return this._baseDir;
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
  getDirectory: () => storageManager.getDirectory()
};

/**
 * Navigator-like object
 */
export const navigator = {
  storage
};

export default storageManager;
