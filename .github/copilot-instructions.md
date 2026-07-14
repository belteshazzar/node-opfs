# Copilot Instructions for node-opfs

Concise, project-specific guidance to help AI agents work effectively in this repo.

## Overview
- **Goal:** Node.js implementation of the browser OPFS/File System Access API with matching surface and behavior.
- **Entry points:** `navigator.storage.getDirectory()`, `storage.getDirectory()`, and `new StorageManager(baseDir)`. See ../src/index.ts.
- **Default storage root:** `~/.node-opfs` (override via `new StorageManager(path)`), implemented in ../src/StorageManager.ts.

## Architecture
- **Handles:**
  - ../src/FileSystemHandle.ts: shared base with `kind`, `name` (getter backed by mutable `_name`), `isSameEntry()`, permission stubs, `remove()`, `move()`. `move()`/`remove()` are defined once here since they're identical for files and directories; `move()` mutates `_name`/`_path` in place after a successful `fs.rename`, and rejects (via ../src/FileLock.ts) if the file currently has an open writable stream or sync access handle, since those capture their own path in closure at open time.
  - ../src/FileSystemDirectoryHandle.ts: directories; `getFileHandle()`, `getDirectoryHandle()`, `removeEntry()`, `resolve()`, async iteration (`keys()`, `values()`, `entries()`, `[Symbol.asyncIterator]`).
  - ../src/FileSystemFileHandle.ts: files; `getFile()` (returns a real `node:buffer` `File`, with a MIME type best-effort-guessed from the extension via ../src/mimeTypes.ts), `createWritable()`, `createSyncAccessHandle()`.
  - ../src/FileSystemWritableFileStream.ts: write/seek/truncate/close with OPFS-compatible `WriteParams`.
  - ../src/validateName.ts / ../src/removeHelper.ts: shared name-validation and removal logic used by both `FileSystemDirectoryHandle` (removeEntry/getFileHandle/getDirectoryHandle) and `FileSystemHandle` (remove/move).
- **Exports:** ../src/index.ts re-exports `FileSystem*` classes and `{ StorageManager, navigator, storage }`. Default export is the singleton storage manager. `storage`/`navigator.storage` also expose `estimate()`, `persist()`, `persisted()` (see ../src/StorageManager.ts).
- **Runtime:** Pure Node stdlib (`fs`, `fs/promises`, `path`, `os`). No external runtime deps.

## Build, Test, Run
- **Build:** `npm run build` (TypeScript → ESM in `dist/`). tsconfig targets ES2022 ESM; imports in TS use `.js` extensions to match emitted files.
- **Tests:** `npm test` (Node >= 18.15, uses `node --test`). Tests import from `dist/` and assume build is up-to-date. See ../test/opfs.test.js.
- **Examples:** `npm run example` (reads from `dist/`). See ../examples/basic-usage.js and ../examples/verify-api.js.
- **Engines:** Node >= 18.15.0 (relies on ESM, `DOMException`, the `File` export from `node:buffer` (18.13.0/19.2.0+), and `fs.promises.statfs` for `StorageManager.estimate()`'s quota (18.15.0/19.6.0+) — the last of these is the current binding constraint.

## Conventions & Patterns
- **ESM everywhere:** `"type": "module"`; keep `.js` extensions in TypeScript import paths (e.g., `import { X } from './File.js'`) so emitted ESM stays valid.
- **Error semantics:** Throw `DOMException` with web-compatible names:
  - `NotFoundError` for missing files/dirs (e.g., `getFileHandle()`/`getDirectoryHandle()` without `create`).
  - `InvalidModificationError` when removing non-empty dirs without `recursive: true`.
- **Truncation rules:** `FileSystemFileHandle.createWritable({ keepExistingData })` truncates by default; `keepExistingData: true` preserves content and uses `r+` open mode.
- **WriteParams shape:** `write({ type: 'write', position?, data })`, `write({ type: 'seek', position })`, `write({ type: 'truncate', size? })`. See ../src/FileSystemWritableFileStream.ts.
- **Iteration:** Directory handles support async iteration of names/handles/pairs. See tests for expected ordering assertions (sort in tests; FS order is not guaranteed).

## What to Modify/Add
- **New OPFS APIs:** Implement in the corresponding handle class, mirror browser behavior, prefer async `fs/promises`. Ensure exceptions use `DOMException` names above.
- **Cross-file impacts:**
  - Add exports in ../src/index.ts.
  - Update examples/tests only to demonstrate new API; keep imports from `dist/` for runtime.
- **Paths & resolution:** Use `path.join` and `path.relative` consistently; respect the `StorageManager` base dir.

## Gotchas
- **Synchronous access handle:** `FileSystemSyncAccessHandle.read/write` are implemented via Node `fs.readSync/writeSync` on the file descriptor. They block the calling thread; prefer using them in worker contexts. `truncate/getSize/flush/close` are async and supported.
- **Do not import from `src/` at runtime:** examples/tests import from `dist/`. Always build first.
- **Permissions:** `queryPermission/requestPermission` are Node stubs returning `'granted'` when readable; do not introduce interactive prompts.

## References
- Key files: ../src/index.ts, ../src/StorageManager.ts, ../src/FileSystemHandle.ts, ../src/FileSystemDirectoryHandle.ts, ../src/FileSystemFileHandle.ts, ../src/FileSystemWritableFileStream.ts
- Usage docs: ../README.md
- Tests: ../test/opfs.test.js
- Examples: ../examples/basic-usage.js, ../examples/verify-api.js, ../examples/COMPARISON.md
