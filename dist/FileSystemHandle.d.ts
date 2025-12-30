/**
 * Permission state type
 */
export type PermissionState = 'granted' | 'denied' | 'prompt';
/**
 * Base class for FileSystemFileHandle and FileSystemDirectoryHandle
 */
export declare abstract class FileSystemHandle {
    readonly kind: 'file' | 'directory';
    readonly name: string;
    protected readonly _path: string;
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
}
//# sourceMappingURL=FileSystemHandle.d.ts.map