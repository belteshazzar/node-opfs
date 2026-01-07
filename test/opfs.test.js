import { test } from 'node:test';
import assert from 'node:assert';
import { navigator, storage } from '../dist/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Create a temporary test directory
const testBaseDir = path.join(os.tmpdir(), 'node-opfs-test-' + Date.now());

test('navigator.storage.getDirectory() returns a directory handle', async () => {
  // Set a custom base directory for testing
  const { StorageManager } = await import('../dist/StorageManager.js');
  const testStorageManager = new StorageManager(testBaseDir);
  
  const root = await testStorageManager.getDirectory();
  
  assert.strictEqual(root.kind, 'directory');
  assert.strictEqual(root.name, '');
  
  // Verify directory was created
  const stats = await fs.stat(testBaseDir);
  assert.ok(stats.isDirectory());
});

test('FileSystemDirectoryHandle.getFileHandle() creates and retrieves files', async () => {
  const root = await storage.getDirectory();
  
  // Create a new file
  const fileHandle = await root.getFileHandle('test.txt', { create: true });
  assert.strictEqual(fileHandle.kind, 'file');
  assert.strictEqual(fileHandle.name, 'test.txt');
  
  // Retrieve the same file
  const fileHandle2 = await root.getFileHandle('test.txt');
  assert.strictEqual(fileHandle2.kind, 'file');
  assert.strictEqual(fileHandle2.name, 'test.txt');
  
  // Check they represent the same entry
  const same = await fileHandle.isSameEntry(fileHandle2);
  assert.ok(same);
});

test('FileSystemDirectoryHandle.getFileHandle() throws when file does not exist', async () => {
  const root = await storage.getDirectory();
  
  await assert.rejects(
    async () => await root.getFileHandle('nonexistent.txt'),
    { name: 'NotFoundError' }
  );
});

test('FileSystemFileHandle.createWritable() and write/close', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('write-test.txt', { create: true });
  
  const writable = await fileHandle.createWritable();
  await writable.write('Hello, World!');
  await writable.close();
  
  // Read the file back
  const file = await fileHandle.getFile();
  const text = await file.text();
  assert.strictEqual(text, 'Hello, World!');
});

test('FileSystemWritableFileStream supports multiple writes', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('multi-write.txt', { create: true });
  
  const writable = await fileHandle.createWritable();
  await writable.write('Line 1\n');
  await writable.write('Line 2\n');
  await writable.write('Line 3');
  await writable.close();
  
  const file = await fileHandle.getFile();
  const text = await file.text();
  assert.strictEqual(text, 'Line 1\nLine 2\nLine 3');
});

test('FileSystemWritableFileStream supports WriteParams with position', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('position-test.txt', { create: true });
  
  const writable = await fileHandle.createWritable();
  await writable.write('0123456789');
  await writable.write({ type: 'write', position: 5, data: 'XXXXX' });
  await writable.close();
  
  const file = await fileHandle.getFile();
  const text = await file.text();
  assert.strictEqual(text, '01234XXXXX');
});

test('FileSystemWritableFileStream supports seek', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('seek-test.txt', { create: true });
  
  const writable = await fileHandle.createWritable();
  await writable.write('AAAAAAAAAA');
  await writable.write({ type: 'seek', position: 3 });
  await writable.write('BBB');
  await writable.close();
  
  const file = await fileHandle.getFile();
  const text = await file.text();
  // When we write 10 A's, seek to position 3, and write 3 B's,
  // we overwrite positions 3-5, resulting in AAABBBAAAA (10 chars)
  assert.strictEqual(text, 'AAABBBAAAA');
});

test('FileSystemWritableFileStream supports truncate', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('truncate-test.txt', { create: true });
  
  const writable = await fileHandle.createWritable();
  await writable.write('Hello, World!');
  await writable.write({ type: 'truncate', size: 5 });
  await writable.close();
  
  const file = await fileHandle.getFile();
  const text = await file.text();
  assert.strictEqual(text, 'Hello');
});

test('FileSystemDirectoryHandle.getDirectoryHandle() creates and retrieves directories', async () => {
  const root = await storage.getDirectory();
  
  // Create a new directory
  const dirHandle = await root.getDirectoryHandle('subdir', { create: true });
  assert.strictEqual(dirHandle.kind, 'directory');
  assert.strictEqual(dirHandle.name, 'subdir');
  
  // Retrieve the same directory
  const dirHandle2 = await root.getDirectoryHandle('subdir');
  assert.strictEqual(dirHandle2.kind, 'directory');
  assert.strictEqual(dirHandle2.name, 'subdir');
});

test('getDirectoryHandle with create:true succeeds when directory exists', async () => {
  const root = await storage.getDirectory();

  await root.getDirectoryHandle('idempotent-dir', { create: true });
  const handle = await root.getDirectoryHandle('idempotent-dir', { create: true });

  assert.strictEqual(handle.kind, 'directory');
  assert.strictEqual(handle.name, 'idempotent-dir');
});

test('FileSystemDirectoryHandle.removeEntry() removes files', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('to-remove.txt', { create: true });
  
  // Write some content
  const writable = await fileHandle.createWritable();
  await writable.write('This will be removed');
  await writable.close();
  
  // Remove the file
  await root.removeEntry('to-remove.txt');
  
  // Verify it's gone
  await assert.rejects(
    async () => await root.getFileHandle('to-remove.txt'),
    { name: 'NotFoundError' }
  );
});

test('FileSystemDirectoryHandle.removeEntry() removes empty directories', async () => {
  const root = await storage.getDirectory();
  await root.getDirectoryHandle('empty-dir', { create: true });
  
  await root.removeEntry('empty-dir');
  
  await assert.rejects(
    async () => await root.getDirectoryHandle('empty-dir'),
    { name: 'NotFoundError' }
  );
});

test('FileSystemDirectoryHandle.removeEntry() with recursive removes non-empty directories', async () => {
  const root = await storage.getDirectory();
  const dir = await root.getDirectoryHandle('dir-with-files', { create: true });
  
  // Create a file in the directory
  const fileHandle = await dir.getFileHandle('file.txt', { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write('content');
  await writable.close();
  
  // Remove with recursive flag
  await root.removeEntry('dir-with-files', { recursive: true });
  
  await assert.rejects(
    async () => await root.getDirectoryHandle('dir-with-files'),
    { name: 'NotFoundError' }
  );
});

test('FileSystemDirectoryHandle.keys() iterates over entry names', async () => {
  const root = await storage.getDirectory();
  const testDir = await root.getDirectoryHandle('keys-test', { create: true });
  
  await testDir.getFileHandle('file1.txt', { create: true });
  await testDir.getFileHandle('file2.txt', { create: true });
  await testDir.getDirectoryHandle('subdir1', { create: true });
  
  const keys = [];
  for await (const key of testDir.keys()) {
    keys.push(key);
  }
  
  keys.sort();
  assert.deepStrictEqual(keys, ['file1.txt', 'file2.txt', 'subdir1']);
});

test('FileSystemDirectoryHandle.values() iterates over handles', async () => {
  const root = await storage.getDirectory();
  const testDir = await root.getDirectoryHandle('values-test', { create: true });
  
  await testDir.getFileHandle('file1.txt', { create: true });
  await testDir.getDirectoryHandle('subdir1', { create: true });
  
  const values = [];
  for await (const value of testDir.values()) {
    values.push({ name: value.name, kind: value.kind });
  }
  
  values.sort((a, b) => a.name.localeCompare(b.name));
  assert.deepStrictEqual(values, [
    { name: 'file1.txt', kind: 'file' },
    { name: 'subdir1', kind: 'directory' }
  ]);
});

test('FileSystemDirectoryHandle.entries() iterates over key-value pairs', async () => {
  const root = await storage.getDirectory();
  const testDir = await root.getDirectoryHandle('entries-test', { create: true });
  
  await testDir.getFileHandle('file1.txt', { create: true });
  await testDir.getDirectoryHandle('subdir1', { create: true });
  
  const entries = [];
  for await (const [key, value] of testDir.entries()) {
    entries.push({ key, name: value.name, kind: value.kind });
  }
  
  entries.sort((a, b) => a.key.localeCompare(b.key));
  assert.deepStrictEqual(entries, [
    { key: 'file1.txt', name: 'file1.txt', kind: 'file' },
    { key: 'subdir1', name: 'subdir1', kind: 'directory' }
  ]);
});

test('FileSystemDirectoryHandle is async iterable', async () => {
  const root = await storage.getDirectory();
  const testDir = await root.getDirectoryHandle('iterable-test', { create: true });
  
  await testDir.getFileHandle('file1.txt', { create: true });
  await testDir.getDirectoryHandle('subdir1', { create: true });
  
  const entries = [];
  for await (const [key, value] of testDir) {
    entries.push({ key, name: value.name, kind: value.kind });
  }
  
  entries.sort((a, b) => a.key.localeCompare(b.key));
  assert.deepStrictEqual(entries, [
    { key: 'file1.txt', name: 'file1.txt', kind: 'file' },
    { key: 'subdir1', name: 'subdir1', kind: 'directory' }
  ]);
});

test('FileSystemDirectoryHandle.resolve() returns path array for descendants', async () => {
  const root = await storage.getDirectory();
  const subdir = await root.getDirectoryHandle('resolve-test', { create: true });
  const fileHandle = await subdir.getFileHandle('file.txt', { create: true });
  
  const path1 = await root.resolve(subdir);
  assert.deepStrictEqual(path1, ['resolve-test']);
  
  const path2 = await root.resolve(fileHandle);
  assert.deepStrictEqual(path2, ['resolve-test', 'file.txt']);
  
  const path3 = await subdir.resolve(fileHandle);
  assert.deepStrictEqual(path3, ['file.txt']);
});

test('nested directory structure', async () => {
  const root = await storage.getDirectory();
  
  // Create nested structure: root/level1/level2/file.txt
  const level1 = await root.getDirectoryHandle('level1', { create: true });
  const level2 = await level1.getDirectoryHandle('level2', { create: true });
  const fileHandle = await level2.getFileHandle('deep-file.txt', { create: true });
  
  const writable = await fileHandle.createWritable();
  await writable.write('Deep content');
  await writable.close();
  
  // Read it back
  const file = await fileHandle.getFile();
  const text = await file.text();
  assert.strictEqual(text, 'Deep content');
});

test('createWritable with keepExistingData preserves content', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('keep-data.txt', { create: true });
  
  // Write initial content
  let writable = await fileHandle.createWritable();
  await writable.write('Initial content');
  await writable.close();
  
  // Open with keepExistingData
  writable = await fileHandle.createWritable({ keepExistingData: true });
  await writable.close();
  
  // Content should still be there
  const file = await fileHandle.getFile();
  const text = await file.text();
  assert.strictEqual(text, 'Initial content');
});

test('createWritable without keepExistingData truncates file', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('truncate-on-open.txt', { create: true });
  
  // Write initial content
  let writable = await fileHandle.createWritable();
  await writable.write('Initial content');
  await writable.close();
  
  // Open without keepExistingData (default)
  writable = await fileHandle.createWritable();
  await writable.write('New');
  await writable.close();
  
  // Only new content should be there
  const file = await fileHandle.getFile();
  const text = await file.text();
  assert.strictEqual(text, 'New');
});

test('FileSystemSyncAccessHandle read/write works synchronously', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('sync-handle-test.txt', { create: true });
  const accessHandle = await fileHandle.createSyncAccessHandle();

  // Write synchronously
  const writeBuf = new TextEncoder().encode('SYNC');
  const bytesWritten = accessHandle.write(writeBuf);
  assert.strictEqual(bytesWritten, writeBuf.length);

  // Read synchronously
  const readBuf = new Uint8Array(4);
  const bytesRead = accessHandle.read(readBuf, { at: 0 });
  assert.strictEqual(bytesRead, 4);
  assert.strictEqual(new TextDecoder().decode(readBuf), 'SYNC');

  // Truncate and size
  accessHandle.truncate(2);
  const size = accessHandle.getSize();
  assert.strictEqual(size, 2);

  accessHandle.flush();
  await accessHandle.close();
});

test('FileSystemSyncAccessHandle write with position', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('sync-write-position.txt', { create: true });
  const accessHandle = await fileHandle.createSyncAccessHandle();

  // Write initial data
  const buf1 = new TextEncoder().encode('0123456789');
  accessHandle.write(buf1);

  // Write at a specific position
  const buf2 = new TextEncoder().encode('XXXXX');
  const bytesWritten = accessHandle.write(buf2, { at: 3 });
  assert.strictEqual(bytesWritten, 5);

  // Read back and verify
  const readBuf = new Uint8Array(10);
  accessHandle.read(readBuf, { at: 0 });
  const text = new TextDecoder().decode(readBuf);
  assert.strictEqual(text, '012XXXXX89');

  await accessHandle.close();
});

test('FileSystemSyncAccessHandle read with position', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('sync-read-position.txt', { create: true });
  const accessHandle = await fileHandle.createSyncAccessHandle();

  // Write data
  const writeBuf = new TextEncoder().encode('Hello, World!');
  accessHandle.write(writeBuf);

  // Read from specific position
  const readBuf = new Uint8Array(5);
  const bytesRead = accessHandle.read(readBuf, { at: 7 });
  assert.strictEqual(bytesRead, 5);
  assert.strictEqual(new TextDecoder().decode(readBuf), 'World');

  await accessHandle.close();
});

test('FileSystemSyncAccessHandle read beyond file size', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('sync-read-beyond.txt', { create: true });
  const accessHandle = await fileHandle.createSyncAccessHandle();

  // Write small amount of data
  const writeBuf = new TextEncoder().encode('Hi');
  accessHandle.write(writeBuf);

  // Try to read more than available
  const readBuf = new Uint8Array(10);
  const bytesRead = accessHandle.read(readBuf, { at: 0 });
  assert.strictEqual(bytesRead, 2); // Only 2 bytes available

  await accessHandle.close();
});

test('FileSystemSyncAccessHandle truncate expands file', async () => {
  const root = await storage.getDirectory();
  const filename = 'sync-truncate-expand-' + Date.now() + '.txt';
  const fileHandle = await root.getFileHandle(filename, { create: true });
  const accessHandle = await fileHandle.createSyncAccessHandle();

  // Write some data at position 0
  const writeBuf = new TextEncoder().encode('Test');
  accessHandle.write(writeBuf, { at: 0 });
  assert.strictEqual(accessHandle.getSize(), 4);

  // Expand file
  accessHandle.truncate(10);
  assert.strictEqual(accessHandle.getSize(), 10);

  // Verify expanded region is zeros
  const readBuf = new Uint8Array(6);
  accessHandle.read(readBuf, { at: 4 });
  assert.deepStrictEqual(readBuf, new Uint8Array([0, 0, 0, 0, 0, 0]));

  await accessHandle.close();
  await root.removeEntry(filename);
});

test('FileSystemSyncAccessHandle truncate shrinks file', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('sync-truncate-shrink.txt', { create: true });
  const accessHandle = await fileHandle.createSyncAccessHandle();

  // Write data
  const writeBuf = new TextEncoder().encode('HelloWorld');
  accessHandle.write(writeBuf);
  assert.strictEqual(accessHandle.getSize(), 10);

  // Shrink file
  accessHandle.truncate(5);
  assert.strictEqual(accessHandle.getSize(), 5);

  // Verify content
  const readBuf = new Uint8Array(5);
  accessHandle.read(readBuf, { at: 0 });
  assert.strictEqual(new TextDecoder().decode(readBuf), 'Hello');

  await accessHandle.close();
});

test('FileSystemSyncAccessHandle flush persists data', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('sync-flush.txt', { create: true });
  const accessHandle = await fileHandle.createSyncAccessHandle();

  // Write and flush
  const writeBuf = new TextEncoder().encode('Flushed data');
  accessHandle.write(writeBuf);
  accessHandle.flush();

  // Close and reopen to verify persistence
  await accessHandle.close();

  const file = await fileHandle.getFile();
  const text = await file.text();
  assert.strictEqual(text, 'Flushed data');
});

test('FileSystemSyncAccessHandle write with ArrayBuffer', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('sync-arraybuffer.txt', { create: true });
  const accessHandle = await fileHandle.createSyncAccessHandle();

  // Create ArrayBuffer
  const arrayBuffer = new ArrayBuffer(8);
  const view = new Uint8Array(arrayBuffer);
  view.set([65, 66, 67, 68, 69, 70, 71, 72]); // "ABCDEFGH"

  // Write ArrayBuffer
  const bytesWritten = accessHandle.write(arrayBuffer);
  assert.strictEqual(bytesWritten, 8);

  // Read back
  const readBuf = new Uint8Array(8);
  accessHandle.read(readBuf, { at: 0 });
  assert.strictEqual(new TextDecoder().decode(readBuf), 'ABCDEFGH');

  await accessHandle.close();
});

test('FileSystemSyncAccessHandle read into ArrayBuffer view', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('sync-read-view.txt', { create: true });
  const accessHandle = await fileHandle.createSyncAccessHandle();

  // Write data
  const writeBuf = new TextEncoder().encode('1234567890');
  accessHandle.write(writeBuf);

  // Read into a view of an ArrayBuffer
  const arrayBuffer = new ArrayBuffer(10);
  const view = new Uint8Array(arrayBuffer, 2, 5); // Offset 2, length 5
  const bytesRead = accessHandle.read(view, { at: 3 });
  assert.strictEqual(bytesRead, 5);

  // Check the specific view got the data
  assert.strictEqual(new TextDecoder().decode(view), '45678');

  await accessHandle.close();
});

test('FileSystemSyncAccessHandle throws when closed', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('sync-closed.txt', { create: true });
  const accessHandle = await fileHandle.createSyncAccessHandle();

  // Close the handle
  await accessHandle.close();

  // All operations should throw
  assert.throws(() => {
    accessHandle.write(new Uint8Array([1, 2, 3]));
  }, /closed/);

  assert.throws(() => {
    accessHandle.read(new Uint8Array(10));
  }, /closed/);

  assert.throws(() => {
    accessHandle.truncate(5);
  }, /closed/);

  assert.throws(() => {
    accessHandle.getSize();
  }, /closed/);

  assert.throws(() => {
    accessHandle.flush();
  }, /closed/);
});

test('FileSystemSyncAccessHandle close is idempotent', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('sync-close-idempotent.txt', { create: true });
  const accessHandle = await fileHandle.createSyncAccessHandle();

  // Multiple closes should not throw
  await accessHandle.close();
  await accessHandle.close();
  await accessHandle.close();
});

test('FileSystemSyncAccessHandle write without position uses current position', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('sync-write-no-position.txt', { create: true });
  const accessHandle = await fileHandle.createSyncAccessHandle();

  // First write starts at position 0
  const buf1 = new TextEncoder().encode('First ');
  accessHandle.write(buf1);
  
  // Second write without position continues from current position (after first write)
  const buf2 = new TextEncoder().encode('Second');
  accessHandle.write(buf2);

  // Read back - data should be sequential
  const size = accessHandle.getSize();
  const readBuf = new Uint8Array(size);
  accessHandle.read(readBuf, { at: 0 });
  assert.strictEqual(new TextDecoder().decode(readBuf), 'First Second');

  await accessHandle.close();
});

test('FileSystemSyncAccessHandle read without position uses current position', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('sync-read-no-position.txt', { create: true });
  const accessHandle = await fileHandle.createSyncAccessHandle();

  // Write data
  const writeBuf = new TextEncoder().encode('ABCDEFGHIJ');
  accessHandle.write(writeBuf, { at: 0 });

  // Sequential reads without position use current file position (advances after each read)
  const buf1 = new Uint8Array(3);
  const buf2 = new Uint8Array(3);
  
  accessHandle.read(buf1); // Reads from current position (0)
  accessHandle.read(buf2); // Reads from current position (3, after first read)

  assert.strictEqual(new TextDecoder().decode(buf1), 'ABC');
  assert.strictEqual(new TextDecoder().decode(buf2), 'DEF');

  await accessHandle.close();
});

// Cleanup after all tests
test('cleanup test directory', async () => {
  try {
    await fs.rm(testBaseDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
});
