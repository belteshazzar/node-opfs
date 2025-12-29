import * as path from 'path';
import * as fs from 'fs/promises';
import { constants } from 'fs';

/**
 * Permission state type
 */
export type PermissionState = 'granted' | 'denied' | 'prompt';

/**
 * Base class for FileSystemFileHandle and FileSystemDirectoryHandle
 */
export abstract class FileSystemHandle {
  readonly kind: 'file' | 'directory';
  readonly name: string;
  protected readonly _path: string;

  constructor(kind: 'file' | 'directory', name: string, filePath: string) {
    this.kind = kind;
    this.name = name;
    this._path = filePath;
  }

  /**
   * Compares two handles to determine if they represent the same entry
   */
  async isSameEntry(other: FileSystemHandle): Promise<boolean> {
    if (this.kind !== other.kind) {
      return false;
    }
    
    try {
      const [stat1, stat2] = await Promise.all([
        fs.stat(this._path),
        fs.stat(other._path)
      ]);
      
      // Compare inode numbers on Unix-like systems
      return stat1.ino === stat2.ino && stat1.dev === stat2.dev;
    } catch {
      return false;
    }
  }

  /**
   * Request permission for the handle
   */
  async queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState> {
    // In Node.js, we always have permission if the file exists
    try {
      await fs.access(this._path, constants.R_OK);
      return 'granted';
    } catch {
      return 'denied';
    }
  }

  /**
   * Request permission for the handle
   */
  async requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState> {
    return this.queryPermission(descriptor);
  }
}
