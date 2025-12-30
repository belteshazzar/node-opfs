/**
 * Node.js implementation of the Origin Private File System (OPFS) API
 *
 * This library provides a drop-in replacement for the browser's OPFS API
 * that works in Node.js environments.
 *
 * @example
 * ```typescript
 * import { navigator } from 'node-opfs';
 *
 * // Get the root directory
 * const root = await navigator.storage.getDirectory();
 *
 * // Create a file
 * const fileHandle = await root.getFileHandle('test.txt', { create: true });
 *
 * // Write to the file
 * const writable = await fileHandle.createWritable();
 * await writable.write('Hello, World!');
 * await writable.close();
 *
 * // Read from the file
 * const file = await fileHandle.getFile();
 * const text = await file.text();
 * console.log(text); // 'Hello, World!'
 * ```
 */
export { FileSystemHandle } from './FileSystemHandle.js';
export { FileSystemFileHandle, FileSystemSyncAccessHandle } from './FileSystemFileHandle.js';
export { FileSystemDirectoryHandle } from './FileSystemDirectoryHandle.js';
export { FileSystemWritableFileStream } from './FileSystemWritableFileStream.js';
export { StorageManager, navigator, storage } from './StorageManager.js';
// Re-export default
import storageManager from './StorageManager.js';
export default storageManager;
//# sourceMappingURL=index.js.map