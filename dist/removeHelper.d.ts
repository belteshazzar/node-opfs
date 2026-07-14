/**
 * Shared implementation for removing a file or directory entry, used by
 * both FileSystemDirectoryHandle.removeEntry() (which discovers the kind
 * via fs.stat, since it only has a name) and FileSystemHandle.remove()
 * (which already knows its own kind).
 */
export declare function removeFileSystemEntry(entryPath: string, name: string, recursive: boolean, isDirectory: boolean): Promise<void>;
//# sourceMappingURL=removeHelper.d.ts.map