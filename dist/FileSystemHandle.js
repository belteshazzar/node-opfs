import * as fs from 'fs/promises';
import { constants } from 'fs';
/**
 * Base class for FileSystemFileHandle and FileSystemDirectoryHandle
 */
export class FileSystemHandle {
    kind;
    name;
    _path;
    constructor(kind, name, filePath) {
        this.kind = kind;
        this.name = name;
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
}
//# sourceMappingURL=FileSystemHandle.js.map