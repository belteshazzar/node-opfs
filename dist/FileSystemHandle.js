import * as path from 'path';
import * as fs from 'fs/promises';
import { constants } from 'fs';
import { assertValidName } from './validateName.js';
import { removeFileSystemEntry } from './removeHelper.js';
import { acquireFileLock, releaseFileLock } from './FileLock.js';
/**
 * Base class for FileSystemFileHandle and FileSystemDirectoryHandle
 */
export class FileSystemHandle {
    kind;
    _name;
    _path;
    /**
     * The entry's current name. Backed by a mutable field (not a plain
     * readonly property) because move() updates it in place, matching how a
     * browser's handle keeps referring to the same entry across a rename --
     * from script, this is still read-only (no setter is exposed).
     */
    get name() {
        return this._name;
    }
    constructor(kind, name, filePath) {
        this.kind = kind;
        this._name = name;
        this._path = filePath;
    }
    /**
     * Compares two handles to determine if they represent the same entry
     */
    async isSameEntry(other) {
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
        }
        catch {
            return false;
        }
    }
    /**
     * Request permission for the handle
     */
    async queryPermission(descriptor) {
        // In Node.js, we always have permission if the file exists
        try {
            await fs.access(this._path, constants.R_OK);
            return 'granted';
        }
        catch {
            return 'denied';
        }
    }
    /**
     * Request permission for the handle
     */
    async requestPermission(descriptor) {
        return this.queryPermission(descriptor);
    }
    /**
     * Removes the entry this handle refers to, without needing the parent
     * directory handle. Equivalent to `parent.removeEntry(this.name, options)`.
     */
    async remove(options) {
        const recursive = options?.recursive ?? false;
        await removeFileSystemEntry(this._path, this._name, recursive, this.kind === 'directory');
    }
    /**
     * Moves (and/or renames) the entry this handle refers to, updating this
     * handle in place to keep pointing at it. Overloads match the real API:
     *
     *   move(newName)
     *   move(destinationDirectory)
     *   move(destinationDirectory, newName)
     *
     * `destinationDirectory` is typed as the base FileSystemHandle here
     * (rather than FileSystemDirectoryHandle) to avoid a circular import
     * between this file and FileSystemDirectoryHandle.ts; its `.kind` is
     * checked at runtime instead, the same pattern isSameEntry() already
     * uses.
     */
    async move(destinationOrNewName, newName) {
        let destinationDirPath;
        let finalName;
        if (typeof destinationOrNewName === 'string') {
            finalName = destinationOrNewName;
            destinationDirPath = path.dirname(this._path);
        }
        else {
            if (destinationOrNewName.kind !== 'directory') {
                throw new TypeError('destination_directory must be a directory handle');
            }
            destinationDirPath = destinationOrNewName._path;
            finalName = newName ?? this._name;
        }
        assertValidName(finalName);
        const newPath = path.join(destinationDirPath, finalName);
        // A file with an open FileSystemWritableFileStream/SyncAccessHandle
        // captures its own path in closure at open time (see
        // FileSystemWritableFileStream); moving the entry out from under it
        // would leave that stream writing to a location that no longer
        // matches this handle once it closes. Reject the move instead, the
        // same way a second writer would be rejected.
        const isFile = this.kind === 'file';
        if (isFile) {
            acquireFileLock(this._path, this._name);
        }
        try {
            await fs.rename(this._path, newPath);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new DOMException(`'${this._name}' not found`, 'NotFoundError');
            }
            throw error;
        }
        finally {
            if (isFile) {
                releaseFileLock(this._path);
            }
        }
        this._path = newPath;
        this._name = finalName;
    }
}
//# sourceMappingURL=FileSystemHandle.js.map