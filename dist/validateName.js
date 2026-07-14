import * as path from 'path';
/**
 * Per spec, a valid file/directory name is non-empty, is not "." or "..",
 * and contains no path separators. Anything else risks escaping the
 * storage root (e.g. `getDirectoryHandle('..')`). Shared by every method
 * that accepts a name for an entry within the tree (getFileHandle,
 * getDirectoryHandle, removeEntry, move).
 */
export function assertValidName(name) {
    if (name === '' ||
        name === '.' ||
        name === '..' ||
        name.includes('/') ||
        name.includes(path.sep)) {
        throw new TypeError(`Name is not allowed: '${name}'`);
    }
}
//# sourceMappingURL=validateName.js.map