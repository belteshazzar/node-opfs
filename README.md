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

## Browser Compatibility

This library implements the same API as the browser's File System Access API (OPFS), making it easy to share code between Node.js and browser environments. Simply swap the import when running in different environments.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
