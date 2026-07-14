import * as fs from 'fs/promises';
/**
 * Shared implementation for removing a file or directory entry, used by
 * both FileSystemDirectoryHandle.removeEntry() (which discovers the kind
 * via fs.stat, since it only has a name) and FileSystemHandle.remove()
 * (which already knows its own kind).
 */
export async function removeFileSystemEntry(entryPath, name, recursive, isDirectory) {
    try {
        if (isDirectory) {
            if (recursive) {
                await fs.rm(entryPath, { recursive: true, force: false });
            }
            else {
                // Check if directory is empty
                const entries = await fs.readdir(entryPath);
                if (entries.length > 0) {
                    throw new DOMException(`Directory '${name}' is not empty`, 'InvalidModificationError');
                }
                await fs.rmdir(entryPath);
            }
        }
        else {
            await fs.unlink(entryPath);
        }
    }
    catch (error) {
        if (error instanceof DOMException) {
            throw error;
        }
        if (error.code === 'ENOENT') {
            throw new DOMException(`Entry '${name}' not found`, 'NotFoundError');
        }
        throw error;
    }
}
//# sourceMappingURL=removeHelper.js.map