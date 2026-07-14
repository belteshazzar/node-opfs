/**
 * Per spec, a valid file/directory name is non-empty, is not "." or "..",
 * and contains no path separators. Anything else risks escaping the
 * storage root (e.g. `getDirectoryHandle('..')`). Shared by every method
 * that accepts a name for an entry within the tree (getFileHandle,
 * getDirectoryHandle, removeEntry, move).
 */
export declare function assertValidName(name: string): void;
//# sourceMappingURL=validateName.d.ts.map