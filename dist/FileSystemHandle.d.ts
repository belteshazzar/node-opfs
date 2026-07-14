/**
 * Permission state type
 */
export type PermissionState = 'granted' | 'denied' | 'prompt';
/**
 * Options for FileSystemHandle.remove()
 */
export interface FileSystemHandleRemoveOptions {
    recursive?: boolean;
}
/**
 * Base class for FileSystemFileHandle and FileSystemDirectoryHandle
 */
export declare abstract class FileSystemHandle {
    readonly kind: 'file' | 'directory';
    protected _name: string;
    protected _path: string;
    /**
     * The entry's current name. Backed by a mutable field (not a plain
     * readonly property) because move() updates it in place, matching how a
     * browser's handle keeps referring to the same entry across a rename --
     * from script, this is still read-only (no setter is exposed).
     */
    get name(): string;
    constructor(kind: 'file' | 'directory', name: string, filePath: string);
    /**
     * Compares two handles to determine if they represent the same entry
     */
    isSameEntry(other: FileSystemHandle): Promise<boolean>;
    /**
     * Request permission for the handle
     */
    queryPermission(descriptor?: {
        mode?: 'read' | 'readwrite';
    }): Promise<PermissionState>;
    /**
     * Request permission for the handle
     */
    requestPermission(descriptor?: {
        mode?: 'read' | 'readwrite';
    }): Promise<PermissionState>;
    /**
     * Removes the entry this handle refers to, without needing the parent
     * directory handle. Equivalent to `parent.removeEntry(this.name, options)`.
     */
    remove(options?: FileSystemHandleRemoveOptions): Promise<void>;
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
    move(destinationOrNewName: FileSystemHandle | string, newName?: string): Promise<void>;
}
//# sourceMappingURL=FileSystemHandle.d.ts.map