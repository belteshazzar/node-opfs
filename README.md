# node-opfs

A Node.js implementation of the Origin Private File System (OPFS) API that provides a drop-in replacement for the browser's File System Access API.

## Features

- ✅ **API Compatible**: Implements the same API as browser OPFS for easy code sharing
- ✅ **Full TypeScript Support**: Complete type definitions included
- ✅ **Async/Await**: Modern async/await based API
- ✅ **File Operations**: Read, write, create, and delete files and directories
- ✅ **Directory Navigation**: Navigate and manage directory structures
- ✅ **Stream Support**: Efficient file writing with streams

## Installation

```bash
npm install node-opfs
```

This pulls in [`fs-ext`](https://www.npmjs.com/package/fs-ext), a native addon used to take real OS-level file locks (see [File Locking](#file-locking) below). It compiles via `node-gyp` at install time, so a C++ toolchain (and Python) must be available on machines without a prebuilt binary for their platform/Node version.

## Quick Start

```javascript
import { navigator } from 'node-opfs';

// Get the root directory
const root = await navigator.storage.getDirectory();

// Create a file
const fileHandle = await root.getFileHandle('hello.txt', { create: true });

// Write to the file
const writable = await fileHandle.createWritable();
await writable.write('Hello, World!');
await writable.close();

// Read from the file
const file = await fileHandle.getFile();
const text = await file.text();
console.log(text); // 'Hello, World!'
```

## API Documentation

### StorageManager

The main entry point for accessing the file system.

```javascript
import { navigator, storage, StorageManager } from 'node-opfs';

// Using the global navigator object
const root = await navigator.storage.getDirectory();

// Using the storage object directly
const root = await storage.getDirectory();

// Using a custom base directory
const customStorage = new StorageManager('/path/to/custom/directory');
const root = await customStorage.getDirectory();
```

#### `estimate()`

Get an estimate of storage usage and quota, mirroring `navigator.storage.estimate()`. `usage` is the actual on-disk byte total under the storage root; `quota` is `usage` plus the remaining free space on the underlying filesystem.

```javascript
const { usage, quota } = await storage.estimate();
console.log(`Using ${usage} of ${quota} bytes`);
```

#### `persist()` / `persisted()`

Node has no storage-eviction-under-pressure concept, so storage here is always effectively persisted; both always resolve `true`.

```javascript
await storage.persist();     // true
await storage.persisted();   // true
```

### FileSystemHandle

Shared base class for `FileSystemFileHandle` and `FileSystemDirectoryHandle`.

##### `move(newName)` / `move(destinationDirectory)` / `move(destinationDirectory, newName)`

Move and/or rename the entry, updating the handle in place to keep pointing at it.

```javascript
// Rename in place
await fileHandle.move('renamed.txt');

// Move into another directory, keeping the same name
await fileHandle.move(destinationDirHandle);

// Move into another directory with a new name
await fileHandle.move(destinationDirHandle, 'renamed.txt');

console.log(fileHandle.name); // reflects the new name
```

Works on both file and directory handles. Rejects with `NoModificationAllowedError` if the file currently has an open `FileSystemWritableFileStream` or `FileSystemSyncAccessHandle`.

##### `remove(options?)`

Remove the entry the handle refers to, without needing the parent directory handle.

```javascript
await fileHandle.remove();
await dirHandle.remove({ recursive: true });
```

##### `isSameEntry(other)`

Check whether two handles refer to the same underlying entry.

```javascript
const same = await handleA.isSameEntry(handleB);
```

##### `queryPermission(descriptor?)` / `requestPermission(descriptor?)`

Check or request permission for the handle. Resolves to `'granted'`, `'denied'`, or `'prompt'`.

```javascript
const state = await fileHandle.queryPermission({ mode: 'readwrite' });
```

> **Note:** real OPFS handles (from `navigator.storage.getDirectory()`) are never permission-gated — they always resolve `'granted'`, since origin-private storage isn't user-mediated the way picker-based File System Access API handles are. This implementation instead checks actual filesystem readability (`fs.access(path, R_OK)`) and ignores the requested `mode` entirely, so it can return `'denied'` in situations a browser never would (e.g. a file the current OS user can't read), and won't distinguish a read-only file when `mode: 'readwrite'` is requested. Code written against real OPFS should never need to branch on `'denied'`/`'prompt'` for these handles at all; treat this implementation's version as a best-effort filesystem-readability check, not a faithful permission model.

### FileSystemDirectoryHandle

Represents a directory in the file system.

#### Methods

##### `getFileHandle(name, options?)`

Get a handle to a file in the directory.

```javascript
// Get existing file
const fileHandle = await dirHandle.getFileHandle('file.txt');

// Create new file if it doesn't exist
const fileHandle = await dirHandle.getFileHandle('file.txt', { create: true });
```

##### `getDirectoryHandle(name, options?)`

Get a handle to a subdirectory.

```javascript
// Get existing directory
const subDir = await dirHandle.getDirectoryHandle('subdir');

// Create new directory if it doesn't exist
const subDir = await dirHandle.getDirectoryHandle('subdir', { create: true });
```

##### `removeEntry(name, options?)`

Remove a file or directory.

```javascript
// Remove a file
await dirHandle.removeEntry('file.txt');

// Remove a directory recursively
await dirHandle.removeEntry('subdir', { recursive: true });
```

##### `resolve(possibleDescendant)`

Get the path from this directory to a descendant.

```javascript
const subDir = await root.getDirectoryHandle('subdir', { create: true });
const fileHandle = await subDir.getFileHandle('file.txt', { create: true });

const path = await root.resolve(fileHandle);
console.log(path); // ['subdir', 'file.txt']
```

##### Iteration Methods

```javascript
// Iterate over entry names
for await (const name of dirHandle.keys()) {
  console.log(name);
}

// Iterate over handles
for await (const handle of dirHandle.values()) {
  console.log(handle.name, handle.kind);
}

// Iterate over entries (name-handle pairs)
for await (const [name, handle] of dirHandle.entries()) {
  console.log(name, handle.kind);
}

// Using async iteration directly
for await (const [name, handle] of dirHandle) {
  console.log(name, handle.kind);
}
```

### FileSystemFileHandle

Represents a file in the file system.

#### Methods

##### `getFile()`

Get a File object representing the current state of the file.

```javascript
const file = await fileHandle.getFile();
const text = await file.text();
const buffer = await file.arrayBuffer();
```

##### `createWritable(options?)`

Create a writable stream for the file.

```javascript
// Truncate file and write
const writable = await fileHandle.createWritable();
await writable.write('New content');
await writable.close();

// Keep existing data
const writable = await fileHandle.createWritable({ keepExistingData: true });
await writable.write('Appended content');
await writable.close();
```

##### `createSyncAccessHandle()`

Create a synchronous access handle (primarily for compatibility).

```javascript
const accessHandle = await fileHandle.createSyncAccessHandle();
await accessHandle.truncate(100);
const size = await accessHandle.getSize();
await accessHandle.flush();
await accessHandle.close();
```

Synchronous read/write example (use in worker contexts to avoid blocking the main thread):

```javascript
const accessHandle = await fileHandle.createSyncAccessHandle();

// Write synchronously
const writeBuf = new TextEncoder().encode('Hello');
accessHandle.write(writeBuf, { at: 0 });

// Read synchronously
const readBuf = new Uint8Array(5);
accessHandle.read(readBuf, { at: 0 });
console.log(new TextDecoder().decode(readBuf)); // 'Hello'

await accessHandle.close();
```

> **Note:** `at` is optional, matching real OPFS: each access handle has its own file position cursor, starting at `0`. Omitting `at` reads/writes from the cursor and advances it by the amount transferred; passing `at` explicitly reads/writes there instead, but *also* moves the cursor to `at + amount transferred` — so a positioned call still affects where the next unpositioned call picks up, exactly like a real browser. `truncate()` clamps the cursor down if it now exceeds the new file size.

```javascript
// The cursor carries across calls, positioned or not.
accessHandle.write(writeBuf);                  // writes at the cursor (starts at 0), cursor now == writeBuf.length
accessHandle.write(otherBuf, { at: 0 });        // overwrites from the start, cursor now == otherBuf.length
accessHandle.write(moreBuf);                    // continues right after that positioned write, not from wherever it was before
```

### FileSystemWritableFileStream

A writable stream for file operations.

#### Methods

##### `write(data)`

Write data to the file.

```javascript
// Write string
await writable.write('Hello');

// Write buffer
const buffer = new TextEncoder().encode('Hello');
await writable.write(buffer);

// Write at specific position
await writable.write({ type: 'write', position: 10, data: 'Hello' });

// Seek to position
await writable.write({ type: 'seek', position: 5 });

// Truncate file
await writable.write({ type: 'truncate', size: 100 });
```

##### `seek(position)`

Move the write position.

```javascript
await writable.seek(10);
await writable.write('At position 10');
```

##### `truncate(size)`

Truncate the file to the specified size.

```javascript
await writable.truncate(100);
```

> **Note:** matching real OPFS, truncating to a size *smaller* than the stream's current write position clamps that position down to the new size, so a subsequent unpositioned `write()` continues from the new end of file rather than from beyond it. Truncating to a size *equal to or larger* than the current file never clamps the position, even if it's already out of bounds from an earlier `seek()` — this asymmetry matches the spec exactly, not just "always clamp."

##### `close()`

Close the stream and flush all data.

```javascript
await writable.close();
```

## Examples

### Working with Directories

```javascript
import { navigator } from 'node-opfs';

const root = await navigator.storage.getDirectory();

// Create nested directories
const docs = await root.getDirectoryHandle('documents', { create: true });
const projects = await docs.getDirectoryHandle('projects', { create: true });

// Create a file in the nested directory
const fileHandle = await projects.getFileHandle('readme.md', { create: true });
const writable = await fileHandle.createWritable();
await writable.write('# My Project\n\nProject documentation...');
await writable.close();

// List all files in a directory
for await (const [name, handle] of docs) {
  console.log(`${name}: ${handle.kind}`);
}
```

### Advanced File Writing

```javascript
import { navigator } from 'node-opfs';

const root = await navigator.storage.getDirectory();
const fileHandle = await root.getFileHandle('data.txt', { create: true });
const writable = await fileHandle.createWritable();

// Write at different positions
await writable.write('Hello');
await writable.write({ type: 'seek', position: 0 });
await writable.write('Goodbye');

// Result: "Goodbye"
await writable.close();
```

### Copying Files

```javascript
async function copyFile(source, dest) {
  const sourceFile = await source.getFile();
  const buffer = await sourceFile.arrayBuffer();
  
  const writable = await dest.createWritable();
  await writable.write(buffer);
  await writable.close();
}

const sourceHandle = await root.getFileHandle('source.txt');
const destHandle = await root.getFileHandle('dest.txt', { create: true });
await copyFile(sourceHandle, destHandle);
```

### Custom Storage Location

```javascript
import { StorageManager } from 'node-opfs';

// Use a custom directory for storage
const storage = new StorageManager('/path/to/my/storage');
const root = await storage.getDirectory();

// Now all operations use the custom directory
const fileHandle = await root.getFileHandle('test.txt', { create: true });
```

## Default Storage Location

By default, files are stored in `~/.node-opfs` (in the user's home directory). You can change this by creating a custom `StorageManager` instance with a different base directory.

### There is no per-origin isolation

Real browser OPFS is strictly namespaced per origin — two unrelated sites can never see or write each other's private storage; the browser enforces that boundary for you. Node has no equivalent concept of "origin," so this library can't replicate that isolation:

- Every app that uses the default `navigator.storage`/`storage` singleton without configuring a custom `baseDir` shares the **same** `~/.node-opfs` directory.
- Two unrelated Node processes/apps run by the same OS user will silently share — and can overwrite or delete — each other's files if they both use the default location.
- There's no way to detect or prevent this collision from inside the library; it can only happen if you opt into it by not configuring a base directory.

**Recommendation:** any real application should construct its own `StorageManager` with an app-specific `baseDir` (e.g. `new StorageManager(path.join(os.homedir(), '.my-app', 'opfs'))`) rather than relying on the shared default, exactly the way a browser's per-origin storage would be scoped to your site alone:

```javascript
import { StorageManager } from 'node-opfs';
import * as path from 'path';
import * as os from 'os';

const storage = new StorageManager(path.join(os.homedir(), '.my-app', 'opfs'));
const root = await storage.getDirectory();
```

The default `~/.node-opfs` location is best treated as a convenience for quick scripts and testing, not as something multiple independent applications should share.

## File Locking

Per spec, at most one `FileSystemWritableFileStream` or `FileSystemSyncAccessHandle` may be open on a given file at a time; a second attempt rejects with `NoModificationAllowedError`. In a browser this only has to hold within one JS runtime. Since this library is meant to be used by separate Node.js processes/apps that may share the same storage directory, the lock is a real OS advisory lock (`flock(2)` on POSIX, `LockFileEx` on Windows, via [`fs-ext`](https://www.npmjs.com/package/fs-ext)) taken on the file itself — so it's enforced across processes on the same host, not just within one.

```javascript
// Process A
const handle = await fileHandle.createSyncAccessHandle(); // acquires the lock

// Process B, same file, while A still holds it
await fileHandle.createSyncAccessHandle(); // throws NoModificationAllowedError
```

The lock is released when `close()` is called, and automatically by the OS if the holding process exits or crashes without closing it. Being an *advisory* lock, it only excludes other processes that also check it via `flock`/`fcntl` (i.e. other users of this library, or tools like the `flock(1)` command) — it does not prevent a process that writes to the path directly (e.g. a plain `fs.writeFile()` or a text editor) from doing so concurrently.

## Browser Compatibility

This library implements the same API as the browser's File System Access API (OPFS), making it easy to share code between Node.js and browser environments. Simply swap the import when running in different environments.

## Worker Threads (Node)

Use Node's `worker_threads` for best-practice synchronous I/O (mirrors browser Workers). Minimal ESM example:

```javascript
// main.mjs
import { Worker } from 'node:worker_threads';

const worker = new Worker(new URL('./opfs-worker.mjs', import.meta.url), { type: 'module' });

worker.on('message', (msg) => {
  console.log('Worker says:', msg);
});

worker.on('error', (err) => {
  console.error('Worker error:', err);
});

worker.on('exit', (code) => {
  console.log('Worker exited with code', code);
});
```

```javascript
// opfs-worker.mjs
import { parentPort } from 'node:worker_threads';
import { navigator } from 'node-opfs';

const root = await navigator.storage.getDirectory();
const fileHandle = await root.getFileHandle('worker-sync.txt', { create: true });
const accessHandle = await fileHandle.createSyncAccessHandle();

// Write synchronously
const writeBuf = new TextEncoder().encode('Hello from worker');
accessHandle.write(writeBuf, { at: 0 });

// Read synchronously
const readBuf = new Uint8Array(writeBuf.length);
accessHandle.read(readBuf, { at: 0 });

await accessHandle.close();

parentPort.postMessage(new TextDecoder().decode(readBuf));
```

## Known Limitations

- **FileSystemSyncAccessHandle**: The synchronous `read()` and `write()` methods are implemented via Node's `fs.readSync`/`fs.writeSync` on the file descriptor and will block the calling thread. For heavy I/O, prefer using them inside `worker_threads` (similar to browser Workers). Async methods (`FileSystemWritableFileStream`) remain the recommended default for non-worker contexts.
- **No per-origin isolation**: unlike real OPFS, this library has no concept of "origin" — apps that don't configure their own `baseDir` share the same default storage location and can silently clobber each other's files. See [There is no per-origin isolation](#there-is-no-per-origin-isolation).
- **`queryPermission`/`requestPermission` don't match real OPFS semantics**: real OPFS handles are never permission-gated (always `'granted'`); this implementation checks actual filesystem readability instead and can return `'denied'`, which a browser never would for these handles. See the note under [`queryPermission(descriptor?)` / `requestPermission(descriptor?)`](#querypermissiondescriptor--requestpermissiondescriptor).

## License

BSD 2-Clause License

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
