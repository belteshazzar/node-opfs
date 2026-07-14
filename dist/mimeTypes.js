import * as path from 'path';
/**
 * Best-effort extension -> MIME type table, covering common web-facing file
 * types. Real browsers derive File.type from the file name's extension
 * (not by sniffing content), but the exact table is implementation-defined
 * and varies across browsers/OSes for uncommon extensions -- this isn't a
 * byte-for-byte replica of any specific browser's internal MIME database,
 * just a small dependency-free table for the common cases. Unrecognized
 * extensions fall back to '', matching the real fallback browsers use.
 */
const MIME_TYPES_BY_EXTENSION = {
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.csv': 'text/csv',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.gz': 'application/gzip',
    '.tar': 'application/x-tar',
    '.wasm': 'application/wasm',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.bmp': 'image/bmp',
    '.avif': 'image/avif',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.weba': 'audio/webm',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
};
/**
 * Guesses a MIME type from a file name's extension. Returns '' for unknown
 * extensions, matching the real File API's fallback.
 */
export function guessMimeType(fileName) {
    const extension = path.extname(fileName).toLowerCase();
    return MIME_TYPES_BY_EXTENSION[extension] ?? '';
}
//# sourceMappingURL=mimeTypes.js.map