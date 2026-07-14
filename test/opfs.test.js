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

test('FileSystemDirectoryHandle.getFileHandle() and getDirectoryHandle() reject paths with separators', async () => {
  const root = await storage.getDirectory();
  
  // Create a subdirectory and file for testing
  const subdir = await root.getDirectoryHandle('subdir', { create: true });
  const fileHandle = await subdir.getFileHandle('file.txt', { create: true });
  
  // Test getFileHandle rejects paths with forward slashes
  await assert.rejects(
    async () => await root.getFileHandle('subdir/file.txt'),
    { name: 'TypeError' }
  );
  
  // Test getDirectoryHandle rejects paths with forward slashes
  await assert.rejects(
    async () => await root.getDirectoryHandle('subdir/nested'),
    { name: 'TypeError' }
  );
  
  // Verify that direct access still works
  const directSubdir = await root.getDirectoryHandle('subdir');
  assert.strictEqual(directSubdir.name, 'subdir');

  const directFile = await directSubdir.getFileHandle('file.txt');
  assert.strictEqual(directFile.name, 'file.txt');
});

test('getFileHandle(), getDirectoryHandle(), and removeEntry() reject "." and ".." names', async () => {
  const root = await storage.getDirectory();
  const invalidNames = ['.', '..', ''];

  for (const name of invalidNames) {
    await assert.rejects(
      async () => await root.getFileHandle(name),
      { name: 'TypeError' },
      `getFileHandle('${name}') should reject`
    );
    await assert.rejects(
      async () => await root.getFileHandle(name, { create: true }),
      { name: 'TypeError' },
      `getFileHandle('${name}', { create: true }) should reject`
    );
    await assert.rejects(
      async () => await root.getDirectoryHandle(name),
      { name: 'TypeError' },
      `getDirectoryHandle('${name}') should reject`
    );
    await assert.rejects(
      async () => await root.getDirectoryHandle(name, { create: true }),
      { name: 'TypeError' },
      `getDirectoryHandle('${name}', { create: true }) should reject`
    );
    await assert.rejects(
      async () => await root.removeEntry(name),
      { name: 'TypeError' },
      `removeEntry('${name}') should reject`
    );
    await assert.rejects(
      async () => await root.removeEntry(name, { recursive: true }),
      { name: 'TypeError' },
      `removeEntry('${name}', { recursive: true }) should reject`
    );
  }
});

test('".." cannot be used to escape the storage root', async () => {
  const { StorageManager } = await import('../dist/StorageManager.js');
  const escapeTestBaseDir = path.join(os.tmpdir(), 'node-opfs-escape-test-' + Date.now());
  const testStorageManager = new StorageManager(escapeTestBaseDir);
  const root = await testStorageManager.getDirectory();
  const subdir = await root.getDirectoryHandle('escape-test-subdir', { create: true });

  // Directly on root: '..' would resolve to the parent of the storage root.
  await assert.rejects(async () => await root.getDirectoryHandle('..'));
  await assert.rejects(async () => await root.getFileHandle('..', { create: true }));

  // From a subdirectory, '..' would resolve back out to root's parent.
  await assert.rejects(async () => await subdir.getDirectoryHandle('..'));
  await assert.rejects(async () => await subdir.getFileHandle('..', { create: true }));

  // The parent of the storage root should be untouched: no entry named
  // after the escape attempt should exist there.
  const outsideRoot = path.dirname(escapeTestBaseDir);
  const entriesOutsideRoot = await fs.readdir(outsideRoot);
  assert.ok(
    !entriesOutsideRoot.includes('..'),
    'escape attempts must not create anything outside the storage root'
  );

  await fs.rm(escapeTestBaseDir, { recursive: true, force: true });
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

test('FileSystemDirectoryHandle.resolve() returns null for a sibling with an overlapping name prefix', async () => {
  const root = await storage.getDirectory();

  // "resolve-prefix-foobar" is NOT inside "resolve-prefix-foo", but a naive
  // string.startsWith() check on the raw paths would think it is.
  const foo = await root.getDirectoryHandle('resolve-prefix-foo', { create: true });
  const foobar = await root.getDirectoryHandle('resolve-prefix-foobar', { create: true });
  const secretFile = await foobar.getFileHandle('secret.txt', { create: true });

  assert.strictEqual(await foo.resolve(foobar), null);
  assert.strictEqual(await foo.resolve(secretFile), null);

  // The real ancestor should still resolve correctly.
  assert.deepStrictEqual(await root.resolve(foobar), ['resolve-prefix-foobar']);
  assert.deepStrictEqual(await foobar.resolve(secretFile), ['secret.txt']);
});

test('FileSystemDirectoryHandle.resolve() returns null for unrelated directories and self', async () => {
  const root = await storage.getDirectory();
  const dirA = await root.getDirectoryHandle('resolve-unrelated-a', { create: true });
  const dirB = await root.getDirectoryHandle('resolve-unrelated-b', { create: true });

  assert.strictEqual(await dirA.resolve(dirB), null);

  // A handle resolving itself is neither a descendant nor null in the
  // browser spec sense of "not found" -- it's the empty path.
  assert.deepStrictEqual(await dirA.resolve(dirA), []);

  // A directory is never a descendant of its own child.
  const child = await dirA.getDirectoryHandle('child', { create: true });
  assert.strictEqual(await child.resolve(dirA), null);
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

test('FileSystemSyncAccessHandle: the file position cursor updates after every operation, including positioned ones', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('sync-cursor-semantics.txt', { create: true });
  const accessHandle = await fileHandle.createSyncAccessHandle();

  // Per spec, a positioned write still advances the shared file position
  // cursor to `at + bytesTransferred` -- not just unpositioned operations.
  const writeBuf = new TextEncoder().encode('ABCDEFGHIJ');
  accessHandle.write(writeBuf, { at: 0 });

  // The cursor is now at 10 (end of file), so an unpositioned read
  // immediately after reads nothing (EOF), not from the start of the file.
  const eofRead = new Uint8Array(3);
  assert.strictEqual(accessHandle.read(eofRead), 0);

  // An explicit positioned read also updates the cursor, so subsequent
  // unpositioned reads continue right after it, sequentially.
  const buf1 = new Uint8Array(3);
  accessHandle.read(buf1, { at: 0 });
  const buf2 = new Uint8Array(3);
  accessHandle.read(buf2);
  const buf3 = new Uint8Array(3);
  accessHandle.read(buf3);

  assert.strictEqual(new TextDecoder().decode(buf1), 'ABC');
  assert.strictEqual(new TextDecoder().decode(buf2), 'DEF');
  assert.strictEqual(new TextDecoder().decode(buf3), 'GHI');

  await accessHandle.close();
});

test('FileSystemSyncAccessHandle: truncate() clamps the cursor if it exceeds the new size', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('sync-truncate-clamps-cursor.txt', { create: true });
  const accessHandle = await fileHandle.createSyncAccessHandle();

  accessHandle.write(new TextEncoder().encode('0123456789')); // unpositioned: cursor 0 -> 10
  accessHandle.truncate(4); // cursor (10) > newSize (4), so it's clamped to 4

  // An unpositioned write now continues from the clamped cursor (4), not
  // from the pre-truncate cursor (10) -- no zero-filled gap.
  accessHandle.write(new TextEncoder().encode('X'));

  const size = accessHandle.getSize();
  const readBuf = new Uint8Array(size);
  accessHandle.read(readBuf, { at: 0 });
  assert.strictEqual(new TextDecoder().decode(readBuf), '0123X');

  await accessHandle.close();
});

test('createWritable() rejects while another writable is open on the same file', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('lock-writable-writable.txt', { create: true });

  const writable1 = await fileHandle.createWritable();

  await assert.rejects(
    async () => await fileHandle.createWritable(),
    { name: 'NoModificationAllowedError' }
  );

  await writable1.close();

  // Lock is released after close(); a new writable can now be opened.
  const writable2 = await fileHandle.createWritable();
  await writable2.close();
});

test('createSyncAccessHandle() rejects while another sync access handle is open on the same file', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('lock-sync-sync.txt', { create: true });

  const handle1 = await fileHandle.createSyncAccessHandle();

  await assert.rejects(
    async () => await fileHandle.createSyncAccessHandle(),
    { name: 'NoModificationAllowedError' }
  );

  await handle1.close();

  // Lock is released after close(); a new sync access handle can now be opened.
  const handle2 = await fileHandle.createSyncAccessHandle();
  await handle2.close();
});

test('createSyncAccessHandle() rejects while a writable stream is open on the same file, and vice versa', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('lock-writable-sync.txt', { create: true });

  const writable = await fileHandle.createWritable();
  await assert.rejects(
    async () => await fileHandle.createSyncAccessHandle(),
    { name: 'NoModificationAllowedError' }
  );
  await writable.close();

  const accessHandle = await fileHandle.createSyncAccessHandle();
  await assert.rejects(
    async () => await fileHandle.createWritable(),
    { name: 'NoModificationAllowedError' }
  );
  await accessHandle.close();

  // Both locks released; either kind can now be opened again.
  const writable2 = await fileHandle.createWritable();
  await writable2.close();
});

test('file locks are per-file: concurrent writers on different files do not conflict', async () => {
  const root = await storage.getDirectory();
  const fileHandleA = await root.getFileHandle('lock-independent-a.txt', { create: true });
  const fileHandleB = await root.getFileHandle('lock-independent-b.txt', { create: true });
  const fileHandleC = await root.getFileHandle('lock-independent-c.txt', { create: true });

  // All three open concurrently without throwing, since each is a distinct file.
  const writableA = await fileHandleA.createWritable();
  const writableB = await fileHandleB.createWritable();
  const accessHandleC = await fileHandleC.createSyncAccessHandle();

  await writableA.close();
  await writableB.close();
  await accessHandleC.close();
});

test('a failed createWritable()/createSyncAccessHandle() releases the lock instead of leaking it', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('lock-release-on-failure.txt', { create: true });

  // Delete the underlying file out from under the handle so the subsequent
  // open attempt fails after the lock has already been acquired.
  await root.removeEntry('lock-release-on-failure.txt');

  await assert.rejects(async () => await fileHandle.createSyncAccessHandle());

  // If the lock had leaked, this would incorrectly throw
  // NoModificationAllowedError instead of succeeding.
  const recreated = await root.getFileHandle('lock-release-on-failure.txt', { create: true });
  const writable = await recreated.createWritable();
  await writable.close();
});

test('createWritable() does not touch the real file until close() (atomic commit)', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('atomic-commit.txt', { create: true });

  let writable = await fileHandle.createWritable();
  await writable.write('original content');
  await writable.close();

  // Open a new writable (default keepExistingData: false) but don't write
  // or close it yet.
  const pending = await fileHandle.createWritable();

  const fileWhileOpen = await fileHandle.getFile();
  assert.strictEqual(
    await fileWhileOpen.text(),
    'original content',
    'original content must remain readable while a writable is open but not yet closed'
  );

  await pending.close();

  const fileAfterClose = await fileHandle.getFile();
  assert.strictEqual(
    await fileAfterClose.text(),
    '',
    'file should be truncated only once close() commits, matching keepExistingData: false semantics'
  );
});

test('an abandoned writable (never closed) does not lose the original file content', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('abandoned-writable.txt', { create: true });

  let writable = await fileHandle.createWritable();
  await writable.write('safe content');
  await writable.close();

  // Simulate a crash/abandoned stream: open, write, but never close().
  const abandoned = await fileHandle.createWritable();
  await abandoned.write('this must never be committed');

  const file = await fileHandle.getFile();
  assert.strictEqual(
    await file.text(),
    'safe content',
    'original content must survive an abandoned (never-closed) writable'
  );

  // Release the stream's underlying file descriptor instead of actually
  // leaking it for the rest of the process (a real "abandoned after crash"
  // stream wouldn't get this courtesy, but leaking an open fd here would
  // make this test flaky under GC). abort() discards the swap file and
  // releases the lock without touching the real file.
  await abandoned.abort();

  const fileAfterAbort = await fileHandle.getFile();
  assert.strictEqual(
    await fileAfterAbort.text(),
    'safe content',
    'content must still be safe after explicitly aborting the abandoned writable'
  );
});

test('keepExistingData: true still commits atomically on close()', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('atomic-keep-existing.txt', { create: true });

  let writable = await fileHandle.createWritable();
  await writable.write('0123456789');
  await writable.close();

  const pending = await fileHandle.createWritable({ keepExistingData: true });
  await pending.write({ type: 'write', position: 0, data: 'XXXXX' });

  // Original content must still be intact until close() commits.
  const fileWhileOpen = await fileHandle.getFile();
  assert.strictEqual(await fileWhileOpen.text(), '0123456789');

  await pending.close();

  const fileAfterClose = await fileHandle.getFile();
  assert.strictEqual(await fileAfterClose.text(), 'XXXXX56789');
});

test('the in-progress swap file is not visible in directory listings', async () => {
  const root = await storage.getDirectory();
  const testDir = await root.getDirectoryHandle('swap-listing-test', { create: true });
  const fileHandle = await testDir.getFileHandle('listing.txt', { create: true });

  const writable = await fileHandle.createWritable();
  await writable.write('in progress');

  const keys = [];
  for await (const key of testDir.keys()) {
    keys.push(key);
  }
  assert.deepStrictEqual(keys, ['listing.txt']);

  const values = [];
  for await (const handle of testDir.values()) {
    values.push(handle.name);
  }
  assert.deepStrictEqual(values, ['listing.txt']);

  await writable.close();
});

test('createWritable() locking (1.3) still holds under the atomic swap-file implementation', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('lock-still-works.txt', { create: true });

  const writable1 = await fileHandle.createWritable();
  await assert.rejects(
    async () => await fileHandle.createWritable(),
    { name: 'NoModificationAllowedError' }
  );
  await assert.rejects(
    async () => await fileHandle.createSyncAccessHandle(),
    { name: 'NoModificationAllowedError' }
  );
  await writable1.close();

  const writable2 = await fileHandle.createWritable();
  await writable2.close();
});

test('a failed createWritable() (copy source missing) releases the lock and leaves no swap file', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('lock-release-writable-failure.txt', { create: true });

  // Remove the underlying file so createWritable({ keepExistingData: true })
  // fails while seeding the swap file from it (fs.copyFile source ENOENT).
  await root.removeEntry('lock-release-writable-failure.txt');

  await assert.rejects(
    async () => await fileHandle.createWritable({ keepExistingData: true })
  );

  // Lock must not have leaked.
  const recreated = await root.getFileHandle('lock-release-writable-failure.txt', { create: true });
  const writable = await recreated.createWritable();
  await writable.close();

  // No stray swap file should be left behind in the directory.
  const names = [];
  for await (const name of root.keys()) {
    names.push(name);
  }
  assert.ok(
    !names.some((name) => name.startsWith('lock-release-writable-failure.txt') && name !== 'lock-release-writable-failure.txt'),
    'no leftover swap file should exist after the failed createWritable()'
  );
});

test('FileSystemWritableFileStream is a real WritableStream', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('is-writable-stream.txt', { create: true });
  const writable = await fileHandle.createWritable();

  assert.ok(writable instanceof WritableStream);
  assert.strictEqual(typeof writable.getWriter, 'function');
  assert.strictEqual(typeof writable.abort, 'function');
  assert.strictEqual(typeof writable.close, 'function');
  assert.strictEqual(writable.locked, false);

  await writable.close();
});

test('a ReadableStream can be piped directly into a writable via pipeTo()', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('pipe-to-test.txt', { create: true });
  const writable = await fileHandle.createWritable();

  const chunks = ['Hello, ', 'streamed ', 'world!'];
  const readable = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    }
  });

  await readable.pipeTo(writable);

  const file = await fileHandle.getFile();
  assert.strictEqual(await file.text(), 'Hello, streamed world!');
});

test('getWriter() supports the standard writer protocol directly', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('manual-writer-test.txt', { create: true });
  const writable = await fileHandle.createWritable();

  const writer = writable.getWriter();
  assert.strictEqual(writable.locked, true);

  await writer.write('manual ');
  await writer.write('writer');
  await writer.close();

  // Per the WritableStream spec, close() does not itself release the
  // writer's lock -- releaseLock() must be called explicitly.
  assert.strictEqual(writable.locked, true);
  writer.releaseLock();
  assert.strictEqual(writable.locked, false);

  const file = await fileHandle.getFile();
  assert.strictEqual(await file.text(), 'manual writer');
});

test('write() rejects while the stream is locked to another writer', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('locked-writer-test.txt', { create: true });
  const writable = await fileHandle.createWritable();

  const writer = writable.getWriter();
  await assert.rejects(async () => await writable.write('should not be allowed'));

  writer.releaseLock();
  await writable.close();
});

test('abort() discards the swap file and leaves the real file untouched', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('abort-test.txt', { create: true });

  let writable = await fileHandle.createWritable();
  await writable.write('committed content');
  await writable.close();

  const toAbort = await fileHandle.createWritable();
  await toAbort.write('should never be committed');
  await toAbort.abort('test abort reason');

  const file = await fileHandle.getFile();
  assert.strictEqual(await file.text(), 'committed content');

  const names = [];
  for await (const name of root.keys()) {
    names.push(name);
  }
  assert.ok(
    !names.some((name) => name.startsWith('abort-test.txt') && name !== 'abort-test.txt'),
    'no leftover swap file should exist after abort()'
  );

  // abort() must release the lock like close() does.
  const writable2 = await fileHandle.createWritable();
  await writable2.close();
});

test('getFile() returns a real File, not a Blob wearing a File-shaped hat', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('real-file-test.txt', { create: true });

  const writable = await fileHandle.createWritable();
  await writable.write('hello world');
  await writable.close();

  const file = await fileHandle.getFile();

  assert.ok(file instanceof File, 'getFile() result must be instanceof File');
  assert.ok(file instanceof Blob, 'a File is also a Blob per spec');
  assert.strictEqual(file.name, 'real-file-test.txt');
  assert.strictEqual(file.size, 'hello world'.length);
  assert.strictEqual(typeof file.lastModified, 'number');
  assert.ok(!('lastModifiedDate' in file), 'lastModifiedDate was removed from the File API spec and must not be present');

  // Blob-inherited members must work.
  assert.strictEqual(await file.text(), 'hello world');
  assert.strictEqual(await file.slice(0, 5).text(), 'hello');
  assert.strictEqual(typeof file.stream, 'function');
});

test('getFile() guesses a MIME type from common extensions and falls back to "" for unknown ones', async () => {
  const root = await storage.getDirectory();
  const cases = [
    ['mime-test.json', 'application/json'],
    ['mime-test.html', 'text/html'],
    ['mime-test.png', 'image/png'],
    ['mime-test.pdf', 'application/pdf'],
    ['mime-test.mp4', 'video/mp4'],
    ['mime-test.unknownext123', ''],
    ['mime-test-no-extension', ''],
  ];

  for (const [name, expectedType] of cases) {
    const fileHandle = await root.getFileHandle(name, { create: true });
    const file = await fileHandle.getFile();
    assert.strictEqual(file.type, expectedType, `${name} should guess type "${expectedType}"`);
  }
});

test('a positioned write() advances the cursor, so the next unpositioned write() continues after it', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('positioned-write-cursor.txt', { create: true });

  const writable = await fileHandle.createWritable();
  await writable.write({ type: 'write', position: 10, data: 'Hello' });
  await writable.write('WORLD'); // must land at 15, not wherever the cursor was before
  await writable.close();

  const buffer = Buffer.from(await (await fileHandle.getFile()).arrayBuffer());
  assert.strictEqual(buffer.length, 20);
  assert.strictEqual(buffer.subarray(0, 10).every((byte) => byte === 0), true, 'bytes 0-9 should be the zero-filled gap');
  assert.strictEqual(buffer.subarray(10, 15).toString('latin1'), 'Hello');
  assert.strictEqual(buffer.subarray(15, 20).toString('latin1'), 'WORLD');
});

test('multiple positioned writes each advance the cursor for the next unpositioned write', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('positioned-write-cursor-chain.txt', { create: true });

  const writable = await fileHandle.createWritable();
  await writable.write({ type: 'write', position: 0, data: '0123456789' });
  await writable.write({ type: 'write', position: 3, data: 'XXX' });
  await writable.write('YYY'); // unpositioned: continues from 3 + 'XXX'.length = 6
  await writable.close();

  const text = await (await fileHandle.getFile()).text();
  assert.strictEqual(text, '012XXXYYY9');
});

test('an unpositioned write() after a positioned one still advances normally on subsequent unpositioned writes', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('positioned-write-cursor-sequential.txt', { create: true });

  const writable = await fileHandle.createWritable();
  await writable.write('AAA');
  await writable.write('BBB'); // file is now "AAABBB", cursor at 6
  await writable.write({ type: 'write', position: 0, data: 'X' }); // overwrites index 0: "XAABBB"
  await writable.write('Y'); // unpositioned: continues from 0 + 'X'.length = 1, overwrites index 1
  await writable.close();

  const text = await (await fileHandle.getFile()).text();
  assert.strictEqual(text, 'XYABBB');
});

test('write() accepts a plain Blob directly', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('blob-write-test.txt', { create: true });

  const writable = await fileHandle.createWritable();
  await writable.write(new Blob(['blob content']));
  await writable.close();

  const text = await (await fileHandle.getFile()).text();
  assert.strictEqual(text, 'blob content');
});

test('write() accepts a Blob as WriteParams.data, including at an explicit position', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('blob-writeparams-test.txt', { create: true });

  const writable = await fileHandle.createWritable();
  await writable.write('0123456789');
  await writable.write({ type: 'write', position: 3, data: new Blob(['XXX']) });
  await writable.close();

  const text = await (await fileHandle.getFile()).text();
  assert.strictEqual(text, '012XXX6789');
});

test('a Blob write correctly advances the cursor for the next unpositioned write', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('blob-cursor-test.txt', { create: true });

  const writable = await fileHandle.createWritable();
  await writable.write(new Blob(['Hello, ']));
  await writable.write('World!');
  await writable.close();

  const text = await (await fileHandle.getFile()).text();
  assert.strictEqual(text, 'Hello, World!');
});

test('a multi-part binary Blob writes its exact bytes', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('blob-binary-test.txt', { create: true });

  const writable = await fileHandle.createWritable();
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  await writable.write(new Blob([bytes, 'tail']));
  await writable.close();

  const buffer = Buffer.from(await (await fileHandle.getFile()).arrayBuffer());
  assert.deepStrictEqual(
    [...buffer],
    [1, 2, 3, 4, 5, ...Buffer.from('tail')]
  );
});

test('getDirectoryHandle() on an existing file throws TypeMismatchError', async () => {
  const root = await storage.getDirectory();
  await root.getFileHandle('type-mismatch-file.txt', { create: true });

  await assert.rejects(
    async () => await root.getDirectoryHandle('type-mismatch-file.txt'),
    (error) => {
      assert.strictEqual(error.name, 'TypeMismatchError');
      assert.ok(error instanceof DOMException, 'must be a real DOMException, not a plain TypeError');
      return true;
    }
  );

  // Same error even when create: true is passed -- the entry already
  // exists as the wrong kind, so it can't just be created fresh.
  await assert.rejects(
    async () => await root.getDirectoryHandle('type-mismatch-file.txt', { create: true }),
    (error) => {
      assert.strictEqual(error.name, 'TypeMismatchError');
      assert.ok(error instanceof DOMException);
      return true;
    }
  );
});

test('getFileHandle() on an existing directory throws TypeMismatchError', async () => {
  const root = await storage.getDirectory();
  await root.getDirectoryHandle('type-mismatch-dir', { create: true });

  await assert.rejects(
    async () => await root.getFileHandle('type-mismatch-dir'),
    (error) => {
      assert.strictEqual(error.name, 'TypeMismatchError');
      assert.ok(error instanceof DOMException, 'must be a real DOMException, not masked as NotFoundError');
      return true;
    }
  );

  await assert.rejects(
    async () => await root.getFileHandle('type-mismatch-dir', { create: true }),
    (error) => {
      assert.strictEqual(error.name, 'TypeMismatchError');
      assert.ok(error instanceof DOMException);
      return true;
    }
  );
});

test('FileSystemHandle.move(newName) renames a file in place', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('move-rename-original.txt', { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write('hello');
  await writable.close();

  await fileHandle.move('move-rename-renamed.txt');

  assert.strictEqual(fileHandle.name, 'move-rename-renamed.txt');
  // The same handle keeps working after the move.
  assert.strictEqual(await (await fileHandle.getFile()).text(), 'hello');

  const atNewName = await root.getFileHandle('move-rename-renamed.txt');
  assert.strictEqual(await (await atNewName.getFile()).text(), 'hello');

  await assert.rejects(
    async () => await root.getFileHandle('move-rename-original.txt'),
    { name: 'NotFoundError' }
  );
});

test('FileSystemHandle.move(destinationDirectory) moves into another directory, keeping the name', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('move-into-dir.txt', { create: true });
  const destDir = await root.getDirectoryHandle('move-destination-dir', { create: true });

  await fileHandle.move(destDir);

  assert.strictEqual(fileHandle.name, 'move-into-dir.txt');
  const inDest = await destDir.getFileHandle('move-into-dir.txt');
  assert.strictEqual(inDest.name, 'move-into-dir.txt');
  await assert.rejects(
    async () => await root.getFileHandle('move-into-dir.txt'),
    { name: 'NotFoundError' }
  );
});

test('FileSystemHandle.move(destinationDirectory, newName) moves and renames together', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('move-and-rename-src.txt', { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write('payload');
  await writable.close();
  const destDir = await root.getDirectoryHandle('move-and-rename-dest', { create: true });

  await fileHandle.move(destDir, 'move-and-rename-dst.txt');

  assert.strictEqual(fileHandle.name, 'move-and-rename-dst.txt');
  const moved = await destDir.getFileHandle('move-and-rename-dst.txt');
  assert.strictEqual(await (await moved.getFile()).text(), 'payload');
});

test('FileSystemHandle.move() also works on directory handles, preserving contents', async () => {
  const root = await storage.getDirectory();
  // Clear out any non-empty leftover from a previous run of this test:
  // fs.rename() fails with ENOTEMPTY when the destination directory
  // already has (differently-generated) contents in it.
  await root.removeEntry('move-dir-dst', { recursive: true }).catch(() => {});

  const dirHandle = await root.getDirectoryHandle('move-dir-src', { create: true });
  await dirHandle.getFileHandle('inner.txt', { create: true });

  await dirHandle.move('move-dir-dst');

  assert.strictEqual(dirHandle.name, 'move-dir-dst');
  const moved = await root.getDirectoryHandle('move-dir-dst');
  const inner = await moved.getFileHandle('inner.txt');
  assert.strictEqual(inner.name, 'inner.txt');
});

test('FileSystemHandle.move() rejects an invalid new name', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('move-invalid-name.txt', { create: true });

  for (const badName of ['..', '.', '', 'a/b']) {
    await assert.rejects(
      async () => await fileHandle.move(badName),
      { name: 'TypeError' },
      `move('${badName}') should reject`
    );
  }
  // The handle must be untouched by the rejected attempts.
  assert.strictEqual(fileHandle.name, 'move-invalid-name.txt');
});

test('FileSystemHandle.move() rejects a non-directory destination', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('move-bad-dest-src.txt', { create: true });
  const notADirectory = await root.getFileHandle('move-bad-dest-target.txt', { create: true });

  await assert.rejects(
    async () => await fileHandle.move(notADirectory),
    { name: 'TypeError' }
  );
});

test('FileSystemHandle.move() throws NotFoundError if the entry no longer exists', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('move-ghost.txt', { create: true });
  await root.removeEntry('move-ghost.txt');

  await assert.rejects(
    async () => await fileHandle.move('move-ghost-renamed.txt'),
    { name: 'NotFoundError' }
  );
});

test('createWritable() throws NotFoundError if the entry no longer exists', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('writable-ghost.txt', { create: true });
  await root.removeEntry('writable-ghost.txt');

  await assert.rejects(
    async () => await fileHandle.createWritable(),
    { name: 'NotFoundError' }
  );
});

test('createSyncAccessHandle() throws NotFoundError if the entry no longer exists', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('sync-ghost.txt', { create: true });
  await root.removeEntry('sync-ghost.txt');

  await assert.rejects(
    async () => await fileHandle.createSyncAccessHandle(),
    { name: 'NotFoundError' }
  );
});

test('FileSystemHandle.move() rejects while the file has an open writable stream, and succeeds once closed', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('move-while-locked.txt', { create: true });
  const writable = await fileHandle.createWritable();

  await assert.rejects(
    async () => await fileHandle.move('move-while-locked-renamed.txt'),
    { name: 'NoModificationAllowedError' }
  );
  // The rejected move must not have changed the handle's identity.
  assert.strictEqual(fileHandle.name, 'move-while-locked.txt');

  await writable.close();
  await fileHandle.move('move-while-locked-renamed.txt');
  assert.strictEqual(fileHandle.name, 'move-while-locked-renamed.txt');
});

test('FileSystemHandle.remove() deletes the file the handle refers to', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('remove-method-file.txt', { create: true });

  await fileHandle.remove();

  await assert.rejects(
    async () => await root.getFileHandle('remove-method-file.txt'),
    { name: 'NotFoundError' }
  );
});

test('FileSystemHandle.remove() deletes an empty directory, and requires recursive for a non-empty one', async () => {
  const root = await storage.getDirectory();

  const emptyDir = await root.getDirectoryHandle('remove-method-empty-dir', { create: true });
  await emptyDir.remove();
  await assert.rejects(
    async () => await root.getDirectoryHandle('remove-method-empty-dir'),
    { name: 'NotFoundError' }
  );

  const fullDir = await root.getDirectoryHandle('remove-method-full-dir', { create: true });
  await fullDir.getFileHandle('inner.txt', { create: true });
  await assert.rejects(
    async () => await fullDir.remove(),
    { name: 'InvalidModificationError' }
  );
  await fullDir.remove({ recursive: true });
  await assert.rejects(
    async () => await root.getDirectoryHandle('remove-method-full-dir'),
    { name: 'NotFoundError' }
  );
});

test('StorageManager.estimate() reports usage that reflects committed writes, excluding in-progress swap files', async () => {
  const { StorageManager } = await import('../dist/StorageManager.js');
  const estimateTestBaseDir = path.join(os.tmpdir(), 'node-opfs-estimate-test-' + Date.now());
  const testStorageManager = new StorageManager(estimateTestBaseDir);
  const root = await testStorageManager.getDirectory();

  const before = await testStorageManager.estimate();
  assert.strictEqual(before.usage, 0);
  assert.ok(before.quota >= before.usage);

  const fileHandle = await root.getFileHandle('estimate-test.bin', { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(new Uint8Array(12345));

  // Uncommitted bytes live in a swap file, which usage must not count yet.
  const whileOpen = await testStorageManager.estimate();
  assert.strictEqual(whileOpen.usage, before.usage);

  await writable.close();

  const after = await testStorageManager.estimate();
  assert.strictEqual(after.usage, before.usage + 12345);
  assert.ok(after.quota >= after.usage);

  await fs.rm(estimateTestBaseDir, { recursive: true, force: true });
});

test('navigator.storage and storage expose estimate(), persist(), and persisted()', async () => {
  assert.strictEqual(typeof storage.estimate, 'function');
  assert.strictEqual(typeof storage.persist, 'function');
  assert.strictEqual(typeof storage.persisted, 'function');
  assert.strictEqual(typeof navigator.storage.estimate, 'function');

  const estimate = await storage.estimate();
  assert.strictEqual(typeof estimate.usage, 'number');
  assert.strictEqual(typeof estimate.quota, 'number');

  assert.strictEqual(await storage.persist(), true);
  assert.strictEqual(await storage.persisted(), true);
});

test('FileSystemWritableFileStream: truncate() clamps the write position when shrinking below it', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('shrink-clamps-position.txt', { create: true });

  const writable = await fileHandle.createWritable();
  await writable.write('0123456789'); // position -> 10 (current size 10)
  await writable.write({ type: 'truncate', size: 4 }); // shrink: 4 < 10, position (10) clamped to 4
  await writable.write('X'); // unpositioned: continues from the clamped position (4), no gap
  await writable.close();

  const text = await (await fileHandle.getFile()).text();
  assert.strictEqual(text, '0123X');
});

test('FileSystemWritableFileStream: truncate() does NOT clamp the position when growing, even if it is already out of bounds', async () => {
  const root = await storage.getDirectory();
  const fileHandle = await root.getFileHandle('grow-does-not-clamp-position.txt', { create: true });

  const writable = await fileHandle.createWritable();
  await writable.write('0123456789'); // position -> 10, current size 10
  await writable.write({ type: 'seek', position: 1000 }); // deliberately out-of-bounds seek
  await writable.write({ type: 'truncate', size: 50 }); // growing (50 > 10): must NOT clamp position back
  await writable.write('Y'); // unpositioned: must land at the un-clamped position, 1000
  await writable.close();

  const file = await fileHandle.getFile();
  assert.strictEqual(file.size, 1001, 'Y must have landed at byte 1000, proving the position was not clamped by a growing truncate');
});

// Cleanup after all tests
test('cleanup test directory', async () => {
  try {
    await fs.rm(testBaseDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
});
