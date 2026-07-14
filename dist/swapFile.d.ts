/**
 * Suffix for the temporary "swap" file that FileSystemWritableFileStream
 * writes to before atomically replacing the real file at close(). This
 * mirrors the browser's OPFS behavior, where writes go to a private
 * temporary file and only become visible to readers once the stream is
 * closed (matching Chromium's own on-disk naming convention for the same
 * mechanism).
 *
 * Known limitation: an entry whose real name happens to end with this
 * suffix (e.g. a file literally named "backup.crswap") will be hidden from
 * FileSystemDirectoryHandle.keys()/values()/entries() even though it isn't
 * a swap file. This is a rare edge case; real OPFS avoids it entirely by
 * keeping swap files outside the directory tree the JS API can enumerate,
 * which isn't practical here since these handles operate on real
 * filesystem paths.
 */
export declare const SWAP_FILE_SUFFIX = ".crswap";
export declare function swapPathFor(filePath: string): string;
export declare function isSwapFileName(name: string): boolean;
//# sourceMappingURL=swapFile.d.ts.map