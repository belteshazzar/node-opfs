# OPFS/File System Access API Compliance Review

Findings from comparing this implementation against the WHATWG File System
Standard (`fs.spec.whatwg.org`) and the browser's Origin Private File System
(OPFS) behavior, as implemented by Chromium/Firefox. Every issue below marked
"Verified" was reproduced against the built `dist/` output on 2026-07-14
(Node v26.3.0); repro scripts are inline in each section.

Scope reviewed: `src/FileSystemHandle.ts`, `src/FileSystemDirectoryHandle.ts`,
`src/FileSystemFileHandle.ts`, `src/FileSystemWritableFileStream.ts`,
`src/StorageManager.ts`, `src/index.ts`.

---

## 1. Critical issues

### 1.1 `..` escapes the storage sandbox (security bug) — Verified — **FIXED**

> Fixed by adding `assertValidName()` (rejects `''`, `'.'`, `'..'`, and any
> name containing a path separator) and applying it in `getFileHandle`,
> `getDirectoryHandle`, **and** `removeEntry` (which had the same hole and is
> arguably worse, since it's destructive — see note below). Regression tests
> added in `test/opfs.test.js`: `'getFileHandle(), getDirectoryHandle(), and
> removeEntry() reject "." and ".." names'` and `'".." cannot be used to
> escape the storage root'`. Re-running the original repro below now throws
> `TypeError: Name is not allowed: '..'` instead of escaping.

`getFileHandle()`/`getDirectoryHandle()` only reject names containing a path
separator ([FileSystemDirectoryHandle.ts:19](src/FileSystemDirectoryHandle.ts#L19),
[:46](src/FileSystemDirectoryHandle.ts#L46)). They never reject `.` or `..`.
Per spec, a valid file name must not be empty, must not be `.` or `..`, and
must not contain `/` — this implementation only checks the last rule.

```js
const parent = await root.getDirectoryHandle('..');
const evil = await parent.getFileHandle('escape.txt', { create: true });
// creates a file in the OS temp dir, *outside* the configured OPFS root
```

Confirmed: `root.getDirectoryHandle('..')` resolves to the parent of the
configured base directory, and a file was successfully created outside the
sandbox. Because `getDirectoryHandle`/`getFileHandle` can be chained, this
allows unbounded traversal to anywhere the Node process can reach on disk —
a full sandbox escape. This is the single most important fix: OPFS's core
guarantee is that content is confined to an origin-private root.

**Fix:** reject names that are `''`, `'.'`, or `'..'` (in addition to the
existing separator check) in both `getFileHandle` and `getDirectoryHandle`.

**Additional finding while fixing this:** `removeEntry()` had *no* name
validation at all (not even the separator check `getFileHandle`/
`getDirectoryHandle` had). `root.removeEntry('..', { recursive: true })`
would have deleted the parent of the storage root — a destructive variant of
this same bug, and arguably more severe than the read/write escape above.
Fixed in the same pass by applying `assertValidName()` there too.

### 1.2 `resolve()` uses a raw string-prefix check (path-confusion bug) — Verified — **FIXED**

> Fixed by dropping the raw `startsWith()` check and driving everything off
> `path.relative()`: a handle is only a descendant if the relative path is
> `''` (same entry) or doesn't start with `..`/isn't absolute (which is how
> `path.relative` signals "not actually contained"). Regression tests added:
> `'resolve() returns null for a sibling with an overlapping name prefix'`
> (the exact `foo`/`foobar` case below) and `'resolve() returns null for
> unrelated directories and self'`. Re-running the original repro now
> correctly returns `null` instead of `['..', 'foobar', 'secret.txt']`.

[FileSystemDirectoryHandle.ts:126](src/FileSystemDirectoryHandle.ts#L126)
tests ancestry with `descendantPath.startsWith(this._path)`. This is a
classic prefix bug: a sibling directory whose name extends the parent's name
is misidentified as a descendant.

```js
const foo    = await root.getDirectoryHandle('foo', { create: true });
const foobar = await root.getDirectoryHandle('foobar', { create: true });
const secret = await foobar.getFileHandle('secret.txt', { create: true });

await foo.resolve(secret);
// => ['..', 'foobar', 'secret.txt']   (spec requires: null, not a descendant)
```

Confirmed exactly this output. `resolve()` must never return a path
containing `..` segments — per spec it returns `null` for anything that
isn't a true descendant. Fix by comparing path segments (e.g. via
`path.relative` and checking the result doesn't start with `..` or equal an
absolute path) rather than string prefixing, or by anchoring the comparison
with a trailing separator (`this._path + path.sep`).

### 1.3 No locking model — concurrent writers silently corrupt data — Verified — **FIXED**

> Fixed by adding a `src/FileLock.ts` module with `acquireFileLock`/
> `releaseFileLock`, keyed by resolved file path (not handle instance, since
> the browser lock applies to the underlying entry). `createWritable()` and
> `createSyncAccessHandle()` in `FileSystemFileHandle.ts` both acquire the
> lock synchronously before doing any async work and throw
> `DOMException(..., 'NoModificationAllowedError')` if it's already held;
> the lock is released in `close()` on both `FileSystemWritableFileStream`
> and `FileSystemSyncAccessHandle`, and also released if the underlying
> `fs.open()` fails after the lock was acquired (so a failed open never
> leaks the lock). Five regression tests added: writable-vs-writable,
> sync-vs-sync, writable-vs-sync in both directions, per-file independence
> (two different files don't conflict), and lock release on open failure.
>
> Note: `createSyncAccessHandle()`'s `fs.open` uses mode `'r+'`, which
> requires the file to already exist — this pairs naturally with
> `getFileHandle(..., { create: true })` always creating a 0-byte file
> first, so it wasn't a locking-specific concern, but is worth knowing if
> you construct a `FileSystemFileHandle` by other means.

The spec gives every OPFS file an implicit readwrite lock: at most one
`FileSystemWritableFileStream` **or** one `FileSystemSyncAccessHandle` may be
open on a given file at a time; a second attempt must reject with
`NoModificationAllowedError`. This implementation has no lock at all:

```js
const a1 = await fh.createSyncAccessHandle();
const a2 = await fh.createSyncAccessHandle(); // browser: throws. Here: succeeds.

const w  = await fh.createWritable();
const a3 = await fh.createSyncAccessHandle(); // browser: throws. Here: succeeds.
```

Both confirmed to succeed silently. Any code that relies on the browser's
"only one writer" guarantee (a common pattern for coordinating access across
tabs/workers) will behave completely differently here — writes can
interleave and corrupt file contents instead of failing fast.

**Fix:** track open handles per resolved path (e.g. a module-level
`Map<string, 'writable'|'sync'>`) and throw `DOMException('...',
'NoModificationAllowedError')` when a conflicting handle is requested;
release the entry on `close()`.

### 1.4 `createWritable()` is not atomic — data loss on crash/abandon — Verified — **FIXED**

> Fixed by adding `src/swapFile.ts` (swap-path naming: `${realPath}.crswap`,
> matching Chromium's own on-disk convention) and moving all swap-file setup
> into `FileSystemFileHandle.createWritable()`: it now creates/opens the
> swap file (a fresh empty file for `keepExistingData: false`, or a
> `fs.copyFile()`-seeded copy for `keepExistingData: true`) and only then
> constructs `FileSystemWritableFileStream` with an already-open fd —
> mirroring how `createSyncAccessHandle()` already worked. All `write()`/
> `truncate()` calls operate on the swap file; `close()` fsyncs, closes the
> swap fd, then does `fsPromises.rename(swapPath, realPath)` — atomic on
> POSIX since both are siblings in the same directory — which is the single
> moment new content becomes visible to `getFile()`/other readers. If the
> stream is never closed, the real file is simply never touched.
>
> Two follow-on fixes needed to make this correct and to keep §1.3 (locking)
> intact:
> - **`FileSystemDirectoryHandle.keys()/values()/entries()`** now filter out
>   any entry ending in `.crswap`, so an in-progress write's swap file
>   doesn't leak into directory listings (real OPFS never exposes swap files
>   via its directory API either). Documented corner case: a *real* file
>   whose name genuinely ends in `.crswap` would also be hidden from listings
>   (still reachable directly via `getFileHandle()`) — acceptable given real
>   OPFS avoids this class of collision entirely by keeping swap files
>   outside the enumerable namespace, which isn't achievable here without
>   more risk (see below).
> - Originally the swap-file setup lived inside the stream's constructor via
>   a fire-and-forget `_init()` promise (mirroring the pre-existing pattern).
>   Regression testing caught that this made `createWritable()` resolve
>   *before* setup finished, so a setup failure (e.g. `keepExistingData: true`
>   with a since-deleted source file) surfaced as an unhandled rejection
>   instead of rejecting `createWritable()` itself — moving setup into
>   `createWritable()` (as described above) fixes this and matches spec,
>   where `createWritable()`'s returned promise doesn't resolve until the
>   swap file is ready.
>
> Considered and rejected: putting swap files in `os.tmpdir()` or a shared
> hidden subdirectory instead of alongside the target file. Both avoid the
> listing-leak entirely, but risk `EXDEV` (cross-device rename failure) if
> that location isn't on the same filesystem/device as the storage root —
> same-directory placement guarantees the atomic rename always works, which
> matters more than perfect listing fidelity.
>
> Eight regression tests added covering: content stays readable while a
> writable is open but not yet written/closed; an abandoned (never-closed)
> writable doesn't lose the original content; `keepExistingData: true` also
> commits atomically; swap files don't appear in `keys()`/`values()`;
> locking (§1.3) still rejects concurrent writers/sync-access-handles under
> the new implementation; and a failed `createWritable()` (missing copy
> source) properly rejects, releases the lock, and leaves no stray swap file.

Per spec, `createWritable()` operates on a private temporary swap file; the
visible file is only replaced atomically when `close()` resolves. If the
writable is never closed (crash, thrown exception, forgotten `await`), the
original file is untouched in a browser.

Here, [FileSystemFileHandle.ts:37](src/FileSystemFileHandle.ts#L37) truncates
the **real** file immediately inside `createWritable()`, before any `write()`
or `close()` call:

```js
let w = await fh.createWritable(); // real file is truncated to 0 bytes *now*
// process crashes / throws before write()/close()
// => original content is permanently gone
```

Confirmed: opening a writable and reading the file back (without writing or
closing) already shows empty content. This is a meaningful behavioral
divergence for anyone relying on OPFS's crash-safety story, and it's silent
— nothing in the API signals that the write path is non-atomic.

**Fix:** write to a temp file (e.g. `${name}.crswap`, matching Chromium's own
convention) and rename-over the target only in `close()`.

---

## 2. Missing OPFS/spec APIs — **FIXED**

| API | Status | Notes |
|---|---|---|
| `FileSystemHandle.prototype.move()` | **Fixed** | See below. |
| `FileSystemHandle.prototype.remove()` | **Fixed** | See below. |
| `StorageManager.estimate()` | **Fixed** | See below. |
| `StorageManager.persist()` / `persisted()` | **Fixed** | See below. |
| `WritableStream` contract (`getWriter()`, `abort()`, `.locked`, piping) | **Fixed** | See §3.3. |

> **`move()`** implemented once on the shared `FileSystemHandle` base class
> (`src/FileSystemHandle.ts`) — identical logic applies to files and
> directories — supporting all three real overloads: `move(newName)`,
> `move(destinationDirectory)`, `move(destinationDirectory, newName)`. Uses
> `fs.rename()` (atomic on the same filesystem) and mutates the handle's
> `name`/internal path in place afterward, so the same handle keeps
> pointing at the entry post-move — this required changing `name` from a
> plain `readonly` field to a getter backed by a mutable `_name` (still
> read-only from outside the class, since there's no setter; verified this
> compiles and behaves correctly before committing to the approach).
> `destinationDirectory` is typed as the base `FileSystemHandle` rather
> than `FileSystemDirectoryHandle` specifically, to avoid a circular
> import between `FileSystemHandle.ts` and `FileSystemDirectoryHandle.ts`;
> its `.kind` is checked at runtime instead (`isSameEntry()` already used
> this same pattern). New name validated via the shared
> `assertValidName()` (extracted to `src/validateName.ts` so both this and
> `FileSystemDirectoryHandle.ts` use one implementation), `NotFoundError`
> if the entry's gone, `TypeError` if the destination isn't a directory
> handle.
>
> Also added a safeguard `move()` itself required: a file with an open
> `FileSystemWritableFileStream`/`FileSystemSyncAccessHandle` captures its
> own path in a closure at open time (see §1.3/§1.4); moving the entry out
> from under it would leave that stream committing to a stale location on
> `close()`. `move()` now acquires the same `src/FileLock.ts` lock used by
> `createWritable()`/`createSyncAccessHandle()` around the rename, so it
> correctly rejects with `NoModificationAllowedError` while the file is
> open elsewhere, and succeeds once it's closed — verified both paths
> empirically.
>
> **`remove()`** and `FileSystemDirectoryHandle.removeEntry()` now share
> one implementation (`removeFileSystemEntry()` in new
> `src/removeHelper.ts`) instead of duplicating the removal/error-handling
> logic — `removeEntry()` still discovers the kind via `fs.stat()` (it only
> has a name), while `remove()` already knows its own `kind`.
>
> **`estimate()`** (`src/StorageManager.ts`) computes `usage` by
> recursively summing real file sizes under the storage root (excluding
> `.crswap` swap files, consistent with them already being hidden from
> `keys()`/`values()`/`entries()` — verified this exclusion holds:
> uncommitted bytes in an open writable don't count until `close()`
> commits them). `quota` is `usage` plus the free space on the underlying
> filesystem via `fs.promises.statfs()` (falls back to `quota === usage`
> if `statfs` isn't supported on the platform/filesystem), which keeps the
> `usage <= quota` invariant real callers rely on — Node has no
> application-level storage quota to report, so "current usage plus
> remaining headroom" is the most honest Node-world equivalent of "how
> much this origin could grow to."
>
> This is the second API (after `File`, in §3.4) that needed a real Node
> version floor correction: `fs.promises.statfs()` requires Node
> v18.15.0/v19.6.0, one patch past the v18.13.0 floor `File` already
> required. Bumped `engines.node` to `>=18.15.0` and updated
> `.github/copilot-instructions.md` to match.
>
> **`persist()`/`persisted()`** always resolve `true` — Node has no
> storage-eviction-under-pressure concept the way browsers do (where
> storage can be evicted unless persistence was explicitly granted), so
> reporting "always persisted" is both the simplest implementation and an
> accurate one.
>
> A real test-hygiene bug surfaced while adding regression tests: most of
> this suite runs against the same persistent `~/.node-opfs` directory
> across every `npm test` invocation (only a few tests use an isolated
> temp `StorageManager`), and it's never cleaned between runs. Existing
> tests tolerate this because `{ create: true }` writes are idempotent
> across reruns. The new directory-`move()` test wasn't: renaming a
> freshly-created source directory onto a destination that already had
> (differently-generated) contents from a prior run fails with `ENOTEMPTY`
> — confirmed by hitting this failure for real on a second run. Fixed by
> having that test clear any leftover destination first.
>
> 15 regression tests added across all four APIs, plus the
> `navigator.storage`/`storage` singletons exposing the three new
> `StorageManager` methods. `test/opfs.test.js` is now 79 tests, all
> passing, including two consecutive full runs to confirm idempotency.

---

## 3. Behavioral deviations from spec

### 3.1 Positioned writes don't advance the stream cursor — Verified — **FIXED**

> Fixed in `FileSystemWritableFileStream`'s sink `write` callback
> (`src/FileSystemWritableFileStream.ts`): the closure-scoped `position`
> variable is now unconditionally set to `target + bytesWritten` after every
> successful write (`target` being the resolved write offset — either the
> explicit `position` from a `WriteParams` write, or the running cursor).
> Previously this only happened when no explicit `position` was given.
> Re-running the exact repro below now produces the spec-correct byte
> layout instead of `WORLD` landing at offset 0.
>
> Three regression tests added: the exact repro from this section (a
> positioned write followed by an unpositioned one, asserting the full
> 20-byte layout including the zero-filled gap); a chain of two positioned
> writes followed by an unpositioned one; and plain sequential unpositioned
> writes interrupted by a positioned write partway through, to make sure
> the cursor still advances correctly on the *next* unpositioned write
> after that.

Per spec, after a `{ type: 'write', position, data }` command, the stream's
internal position becomes `position + data.byteLength`, so a subsequent
unpositioned `write()` continues immediately after it.
[FileSystemWritableFileStream.ts:82](src/FileSystemWritableFileStream.ts#L82)
only updates `_position` when no explicit `position` was given:

```js
if (position === undefined) {
  this._position += bytesWritten;
}
```

```js
const w = await fh.createWritable();
await w.write({ type: 'write', position: 10, data: 'Hello' });
await w.write('WORLD');
await w.close();
// got:      "WORLD\0\0\0\0\0Hello"   (WORLD landed at offset 0)
// expected: "\0\0\0\0\0\0\0\0\0\0HelloWORLD"  (WORLD should land at offset 15)
```

Confirmed via the exact bytes above. **Fix:** always set
`this._position = writePosition + bytesWritten` after a successful write,
positioned or not.

### 3.2 `Blob` is accepted by the type signature but not actually handled — Verified — **FIXED**

> Fixed exactly as prescribed: in the sink's `write` callback
> (`src/FileSystemWritableFileStream.ts`), `chunk instanceof Blob` is now
> checked *before* the `'type' in chunk` duck-typed `WriteParams` check, so
> a bare `Blob` is no longer misrouted into the `WriteParams` branch (and
> rejected there for having an unrecognized `.type` value). Both code
> paths — the top-level chunk and `WriteParams.data` — now handle `Blob` by
> awaiting `blob.arrayBuffer()` and wrapping it in a `Buffer`. Since the
> §3.1 fix already made the cursor-advance logic apply uniformly regardless
> of how `buffer` was produced, a `Blob` write correctly advances the
> cursor for the next unpositioned write with no extra code needed.
>
> Four regression tests added: the exact repro (plain `Blob` passed
> directly to `write()`); a `Blob` as `WriteParams.data` at an explicit
> position; cursor advancement after a `Blob` write; and a multi-part
> binary `Blob` (mixing a `Uint8Array` and a string part) writing its exact
> bytes.

Both `write(data: BufferSource | Blob | string | WriteParams)` and
`WriteParams['data']` declare `Blob` as a valid input
([FileSystemWritableFileStream.ts:43](src/FileSystemWritableFileStream.ts#L43),
[:126](src/FileSystemWritableFileStream.ts#L126)), matching the real spec.
The implementation never checks `instanceof Blob`, and — worse — a bare
`Blob` gets misrouted: the dispatch check `'type' in data`
([:50](src/FileSystemWritableFileStream.ts#L50)) matches `Blob` too, because
`Blob` instances have a `.type` property (their MIME type). A plain
`writable.write(new Blob([...]))` is silently reinterpreted as an attempted
`WriteParams` object and fails:

```js
await w.write(new Blob(['blob content']));
// throws: "Unsupported write type"   (should write the blob's bytes)
```

**Fix:** check `data instanceof Blob` before the `'type' in data` duck-typed
branch, and convert via `Buffer.from(await data.arrayBuffer())` in both the
top-level and `WriteParams.data` code paths.

### 3.3 `FileSystemWritableFileStream` is not a real `WritableStream` — Verified — **FIXED**

> Fixed by rewriting `FileSystemWritableFileStream` to `extends
> WritableStream<FileSystemWriteChunkType>`, backed by an `UnderlyingSink`
> whose `write`/`close`/`abort` callbacks hold the swap-file logic from §1.4
> as closure state (captured before `super()` runs, so nothing touches
> `this` until the base class is fully constructed — verified this pattern
> works with Node's built-in `WritableStream` via a standalone experiment
> before wiring it in). `write()`, `seek()`, and `truncate()` are now thin
> convenience wrappers — `getWriter()` → `writer.write(chunk)` →
> `releaseLock()` — exactly matching how the real spec defines them, so
> chunks written through a manually-acquired writer or piped in via
> `readable.pipeTo(writable)` go through the identical dispatch logic as the
> convenience methods. `abort()`, `getWriter()`, `pipeTo()`/`pipeThrough()`,
> and `.locked` are all inherited from the base class for free — including
> `abort()`, which the old implementation didn't have at all: it discards
> the swap file (via the sink's `abort` callback) and releases the §1.3 lock
> without touching the real file.
>
> Two things worth knowing:
> - `close()` is now the base class's own `close()`, not a hand-rolled
>   method — this is stricter than before in two ways that both make it
>   *more* spec-compliant, not less: calling `close()` a second time now
>   throws `TypeError: Invalid state: WritableStream is closed` (old code
>   silently no-op'd), and `close()` throws if the stream is currently
>   locked to an outstanding writer (old code had no such concept). Neither
>   was exercised by the existing test suite.
> - Node's built-in `WritableStream` doesn't guard against process exit with
>   an unclosed underlying resource — a genuinely abandoned swap-file
>   descriptor (as in the §1.4 "abandoned writable" test) can trigger
>   Node's "FileHandle closed during garbage collection" hard error under
>   the test runner. That regression test now calls the new `abort()` to
>   release the descriptor deterministically after asserting the safety
>   invariant, rather than truly leaking it — abort() being available is
>   what makes that possible.
>
> Five regression tests added: `instanceof WritableStream` +
> `getWriter`/`abort`/`close`/`.locked` all present; `pipeTo()` from a
> `ReadableStream` correctly streams chunks into the file; manual
> `getWriter()`/`writer.write()`/`writer.close()`/`releaseLock()` usage
> works and correctly updates `.locked`; `write()` rejects while the stream
> is locked to another writer; `abort()` discards the swap file, leaves the
> real file untouched, leaves no stray swap file, and releases the lock.

The README advertises "Stream Support," and the real API's writable stream
*is* a `WritableStream` subclass (supports `getWriter()`, `pipeTo()`/
`pipeThrough()` from a `ReadableStream`, `.locked`, `abort()`). This
implementation is a plain class with none of that:

```js
w instanceof WritableStream // false
typeof w.getWriter          // 'undefined'
typeof w.abort              // 'undefined'
```

Confirmed all three. Code written against real OPFS that does
`readable.pipeTo(writable)` (a very common pattern for streaming downloads
into OPFS) will not work against this implementation at all — not a subtle
bug, a hard incompatibility with a commonly-used part of the surface.

**Fix:** either implement by extending `WritableStream` with an underlying
sink that performs the existing write/seek/truncate logic, or clearly
document that this is a simplified non-stream writer (the current README
claim of stream support is inaccurate as written).

### 3.4 `getFile()` returns a `Blob`, not a `File` — Verified — **FIXED**

> Fixed by constructing a real `File` via `import { File } from 'buffer'`
> (Node's `node:buffer` module export, not the ambient global) and
> `new File([buffer], this.name, { type: guessMimeType(this.name),
> lastModified: stats.mtimeMs })`. Deliberately did **not** rely on the
> ambient global `File` (only added to `globalThis` in Node v20.0.0):
> `node:buffer`'s `File` export has been available since v18.13.0/v19.2.0,
> which is a much closer match to this package's declared support range.
> This surfaced a real inaccuracy in `package.json`: `engines.node` said
> `>=18.0.0`, but nothing in this codebase actually worked below
> `18.13.0` once `File` is required (`DOMException` and stable ESM globals
> both need at least that range too) — bumped `engines.node` to
> `>=18.13.0` and updated `.github/copilot-instructions.md` to match, so
> the declared minimum is no longer silently wrong.
>
> Also fixed the same pass, since it's the same code path: dropped
> `lastModifiedDate`, a legacy property this implementation was setting
> that was removed from the File API spec years ago and doesn't exist on
> real File objects in current browsers or in Node's `File` — keeping it
> would have made this *less* compliant with real behavior, not more.
>
> Also addressed the "related, lower-severity" MIME-type note from the
> original review: `type` was unconditionally `application/octet-stream`
> for every file, which is simply wrong for e.g. a `.txt`/`.json`/`.png`
> file in a real browser. Added `src/mimeTypes.ts`, a small dependency-free
> extension → MIME-type table (matches the project's existing "no external
> runtime deps" convention) covering common web-facing extensions, falling
> back to `''` for anything unrecognized — the same fallback real browsers
> use. This is a best-effort common-case table, not a byte-for-byte replica
> of any specific browser's internal MIME database (that's
> implementation-defined and genuinely varies across real browsers/OSes
> for uncommon extensions).
>
> Two regression tests added: `getFile()` returns something that's
> `instanceof File` *and* `instanceof Blob`, has correct `name`/`size`/
> `lastModified`, has no `lastModifiedDate`, and still supports the
> Blob-inherited `text()`/`slice()`/`stream()`; and a MIME-guessing test
> across several common extensions plus two unknown-extension cases
> (falls back to `''`).

[FileSystemFileHandle.ts:22](src/FileSystemFileHandle.ts#L22) builds a
`Blob` and bolts `name`/`lastModified` on via casting:

```js
const file = new Blob([buffer], { type: 'application/octet-stream' }) as any;
file.name = this.name;
```

```js
file instanceof File // false
file instanceof Blob // true
```

Node has had a real global `File` class since v20 (via undici). Any
consumer code doing `if (x instanceof File)` — a very common check, e.g. in
form-data handling or upload code shared between browser and Node — will
misclassify every file this library returns.

**Fix:** `new File([buffer], this.name, { type: ..., lastModified: stats.mtimeMs })`.

Related, lower-severity: `type` is hardcoded to `application/octet-stream`
for every file rather than sniffed/guessed from the extension the way
browsers do. Worth documenting as a known limitation at minimum since
consumers may branch on `file.type`.

### 3.5 Wrong error type when a name exists but is the wrong kind — Verified — **FIXED**

> Fixed in `src/FileSystemDirectoryHandle.ts`: both `getFileHandle()` and
> `getDirectoryHandle()` now throw `DOMException(..., 'TypeMismatchError')`
> for a wrong-kind entry.
>
> This turned out to need more than swapping the error type, though —
> `getFileHandle()` had a **worse** bug than documented here. Its wrong-kind
> check lived *inside* the same `try` block as the `fs.stat()` ENOENT
> handling, so the thrown error was immediately caught by that method's own
> `catch` block and unconditionally overwritten with `NotFoundError` (since
> the thrown `TypeError` has no `.code` property, so it never matched the
> `error.code === 'ENOENT' && create` branch and fell through to the
> catch-all). So calling `getFileHandle()` on an existing directory
> previously reported `NotFoundError`, not even the `TypeError` this
> section originally described — confirmed empirically before fixing.
> `getDirectoryHandle()`'s equivalent check didn't have this exact problem
> (its catch-all re-threw the original error verbatim), but was
> restructured the same way for consistency and to make the same masking
> bug structurally impossible to reintroduce later.
>
> Both methods now separate "resolve the entry, handling ENOENT" (inside
> `try`/`catch`) from "check the entry is the right kind" (outside it, so a
> `TypeMismatchError` thrown there can't be re-caught and reinterpreted as
> something else). The `mkdir` `EEXIST` race-recovery path in
> `getDirectoryHandle()` (another caller created the directory between our
> `stat` and `mkdir` calls) keeps its existing behavior, just using
> `TypeMismatchError` instead of `TypeError` for its own wrong-kind check.
>
> Four regression tests added, covering both methods against both
> `create: true` and `create: false`, each asserting `error.name ===
> 'TypeMismatchError'` and `error instanceof DOMException`.

Spec requires `TypeMismatchError` (a `DOMException`) when e.g.
`getDirectoryHandle('foo')` is called but `foo` is a file. This
implementation throws a plain `TypeError`
([FileSystemDirectoryHandle.ts:28](src/FileSystemDirectoryHandle.ts#L28),
[:55](src/FileSystemDirectoryHandle.ts#L55)):

```js
try { await root.getDirectoryHandle('afile.txt'); }
catch (e) { e.name /* 'TypeError' */; e instanceof DOMException /* false */ }
```

Any code that pattern-matches on `err.name === 'TypeMismatchError'` (a
standard way to handle this specific case) silently falls through.
**Fix:** `throw new DOMException(\`'${name}' is not a directory\`, 'TypeMismatchError')`.

### 3.6 `FileSystemSyncAccessHandle.read/write` treat `at` as optional with an implicit OS cursor — **FIXED (correction: original write-up was wrong)**

> **This section's original premise was factually incorrect**, caught when
> the user pushed back on "documenting a Node-only convenience" and asked
> for real OPFS parity instead — that prompted actually checking the spec
> source rather than trusting memory. Verified against the WHATWG fs spec's
> raw source (`raw.githubusercontent.com/whatwg/fs/main/index.bs`), not
> just MDN (which documents `at` as optional but doesn't say what happens
> when it's omitted): **`FileSystemSyncAccessHandle` *does* have a
> persistent "file position cursor,"** initialized to `0`, per instance.
> Both `read()` and `write()` use `options["at"]` if present, *otherwise*
> the cursor — and, critically, **every call updates the cursor
> afterward, including ones that pass `at` explicitly**: `read()` sets it
> to `readStart + bytesRead`; `write()` sets it to `writePosition +
> bufferSize`. `truncate()` also clamps the cursor down if it now exceeds
> the new size.
>
> This means the *previous* Node implementation had a real, previously
> undiscovered bug of exactly the same shape as §3.1: it delegated
> unpositioned calls to the OS file descriptor's own cursor (via passing
> `position: null` to `fs.readSync`/`writeSync`), but an explicit `at` uses
> pread/pwrite semantics, which **do not move the file descriptor's
> position at all**. So a positioned call followed by an unpositioned one
> used the *pre-positioned-call* location instead of the spec-correct
> `at + bytesTransferred` — silently wrong, and exactly backwards from what
> the original (incorrect) write-up above described as "no persistent
> cursor in the browser."
>
> Fixed by adding a real `_cursor` field to `FileSystemSyncAccessHandle`
> (`src/FileSystemFileHandle.ts`) that mirrors the spec algorithm exactly:
> `read()`/`write()` resolve `readStart`/`writePosition` from `options.at`
> or the cursor, perform the operation, then unconditionally update the
> cursor from the *resolved* position (not just when `at` was omitted).
> `truncate()` clamps the cursor to the new size if it now exceeds it —
> this last part is a second, previously-undocumented finding (the
> original review only flagged this clamping gap for
> `FileSystemWritableFileStream.truncate()` in §3.7; the sync access
> handle had the identical gap, discovered as a natural consequence of
> giving it a real cursor to clamp). `at` remains genuinely optional (no
> `required` marker in the WebIDL, confirmed from spec source) — no
> `TypeError` is thrown for omitting it, matching real behavior exactly.
>
> This required rewriting one existing test
> (`read without position uses current position`) whose assertions
> encoded the *old, incorrect* mental model (that a positioned write
> doesn't affect a later unpositioned read) — it now correctly
> demonstrates that an unpositioned read right after a positioned
> end-of-file write reads 0 bytes (EOF), and that an explicit positioned
> read repositions the cursor for later unpositioned reads. Added a
> dedicated test for the truncate-clamps-cursor behavior too. README
> updated to describe the correct (not merely Node-specific) cursor
> semantics, and the earlier "Node-only convenience" Known Limitations
> entry was removed since it no longer applies.

### 3.7 `truncate()` doesn't clamp the writable stream's position — **FIXED**

> Unlike §3.6, this section's original claim checked out against the
> primary spec source (`raw.githubusercontent.com/whatwg/fs/main/index.bs`)
> — worth re-verifying anyway given §3.6 turned out to be wrong, per
> [[verify-spec-before-documenting-deviations]]. The "truncate" branch of
> `FileSystemWritableFileStream`'s underlying write algorithm: "Otherwise,
> if `newSize` is smaller than `oldSize`: ... If `[[seekOffset]]` is bigger
> than `newSize`, set `[[seekOffset]]` to `newSize`." Note the precise
> asymmetry: the clamp is **only** specified inside the "smaller than"
> (shrinking) branch — growing or same-size truncates never clamp, even if
> the position is already out of bounds from an earlier unchecked `seek()`
> call (`seek()` itself has no bounds checking against the file's current
> size either).
>
> Fixed in the sink's `write` callback (`src/FileSystemWritableFileStream.ts`,
> the `type === 'truncate'` branch): `fs.stat()`s the swap file for its
> current size *before* truncating (needed to know old vs. new for the
> branch condition — truncating first would destroy that information),
> then clamps the closure-scoped `position` only when `newSize < oldSize
> && position > newSize`, matching the spec's branch structure exactly
> rather than a simpler-but-wrong "always clamp if position > newSize."
>
> Two regression tests added: shrinking clamps the position (positioned
> `write()` at the old end-of-file lands right after the truncated end,
> with no zero-filled gap); growing does **not** clamp even when the
> position is already far out of bounds from a deliberate out-of-range
> `seek()` (verified the next unpositioned write lands at the un-clamped
> position, proving the asymmetry holds, not just "clamping never
> happens").

Spec: truncating a `FileSystemWritableFileStream` to a size smaller than the
current position should clamp the position to the new size. Neither the
standalone `truncate()` method nor the `{ type: 'truncate' }` command
([FileSystemWritableFileStream.ts:65](src/FileSystemWritableFileStream.ts#L65),
[:97](src/FileSystemWritableFileStream.ts#L97)) adjust `_position`. Low
severity in isolation, but compounds with §3.1 since both leave `_position`
tracking incomplete/inconsistent with spec.

---

## 4. Design-level / structural gaps

### 4.1 No per-origin isolation — **DOCUMENTED**

> Inherent to porting an origin-scoped browser API to Node, as noted below
> — not fixable in code. Expanded the previously one-line "Default Storage
> Location" README section into a full "There is no per-origin isolation"
> subsection: explains the risk concretely (shared default directory
> across unrelated apps/processes, no way to detect the collision from
> inside the library), and gives the concrete recommendation the original
> note asked for — always construct a `StorageManager` with an
> app-specific `baseDir` — with a runnable example. Cross-referenced from
> Known Limitations.

Real OPFS is strictly namespaced per browser origin — two unrelated sites can
never see each other's private FS. Node has no equivalent concept of
"origin," so by default every app on a machine that doesn't pass a custom
`baseDir` shares `~/.node-opfs`, and two unrelated Node apps run by the same
OS user will silently share (and can clobber) each other's storage. This is
inherent to porting an origin-scoped browser API to Node and can't be fully
fixed, but it's worth calling out prominently in the README (currently only
mentioned in passing as "Default Storage Location") — e.g. recommending
callers always pass an app-specific `baseDir`.

### 4.2 `queryPermission`/`requestPermission` semantics don't match OPFS — **DOCUMENTED**

> Left as-is in code: real OPFS handles never need permission prompts at
> all, so there's no "more correct" runtime behavior to implement here
> beyond always returning `'granted'` — which would make the methods
> pointless rather than more useful, and could mask genuine filesystem
> permission errors that are actually useful information in a Node
> context (unlike in a browser). Documented instead: these methods
> weren't in the README at all before this pass, so added a full
> `queryPermission(descriptor?)` / `requestPermission(descriptor?)`
> section explaining the semantic gap (real OPFS always `'granted'`; this
> implementation checks actual filesystem readability and ignores `mode`
> entirely), plus a cross-referenced entry in Known Limitations.

For handles obtained via `navigator.storage.getDirectory()`, real OPFS
*always* resolves `'granted'` — there is no permission prompt because
origin-private storage isn't user-mediated (this differs from the
File-System-Access-API's picker-based handles, which OPFS is often confused
with). Here, `queryPermission()`
([FileSystemHandle.ts:48](src/FileSystemHandle.ts#L48)) actually checks
`fs.access(..., R_OK)` and can return `'denied'` for OPFS-equivalent
handles, and always ignores the requested `mode` (so a `'readwrite'` query
against a read-only file still reports `'granted'` as long as it's
readable). This is a minor-probability-of-impact but genuine semantic gap:
code checking permission state for OPFS handles should never need to handle
`'denied'`/`'prompt'` at all.

---

## 5. Test coverage gaps

The existing test suite (`test/opfs.test.js`, 30 tests) covers the happy
paths well, but has no coverage for any of the issues in §1–§3. Worth adding
regression tests once fixed:

- `..`/`.`/empty-string name rejection (§1.1)
- `resolve()` against a sibling with an overlapping name prefix (§1.2)
- Concurrent writable/sync-access-handle rejection (§1.3)
- Writable-not-closed leaves original content intact (§1.4)
- Positioned-write cursor advancement (§3.1)
- `Blob` as a direct `write()` argument (§3.2)

---

## 6. Priority summary

| # | Issue | Severity | Effort to fix |
|---|---|---|---|
| 1.1 | `..` sandbox escape (incl. `removeEntry`) | Critical (security) | **Fixed** |
| 1.2 | `resolve()` prefix bug | High (correctness) | **Fixed** |
| 1.4 | Non-atomic `createWritable()` | High (data loss) | **Fixed** |
| 1.3 | No locking model | High (data corruption) | **Fixed** |
| 3.4 | `getFile()` not a real `File` | Medium (compat) | **Fixed** |
| 3.3 | Writable isn't a `WritableStream` | Medium (compat) | **Fixed** |
| 3.1 | Positioned write cursor bug | Medium (correctness) | **Fixed** |
| 3.2 | `Blob` write mishandled | Medium (correctness) | **Fixed** |
| 3.5 | Wrong error type (`TypeMismatchError`) | Low–Medium | **Fixed** |
| 2 | Missing `move()`, `remove()`, `estimate()` | Low–Medium (feature gap) | **Fixed** |
| 3.6 | `FileSystemSyncAccessHandle` cursor semantics | Low | **Fixed** |
| 3.7 | `FileSystemWritableFileStream.truncate()` doesn't clamp position | Low | **Fixed** |
| 4.1, 4.2 | Origin isolation / permission semantics | Low (documentation) | **Documented** |

**Every item in this review is now resolved** — either fixed in code
(§1.1–§1.4, §3.1–§3.7, §2) or, for the handful that are genuinely
inherent/deliberate rather than bugs (§4.1, §4.2), documented
clearly in the README (inline notes at each relevant API, plus
a "Known Limitations" summary that cross-references them) so nothing here
reads as unstated or accidental behavior.
