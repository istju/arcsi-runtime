// Security validator modul
const path = require('path');
const fs = require('fs');

const BASE = path.resolve(__dirname, '..', '..');  // /.../.../ai-chat-pro-v2
const ALLOWED_PATHS = [
    BASE + '/',
    path.join(BASE, 'chat_logs') + '/',
    path.join(BASE, 'agent_work') + '/',
    path.join(BASE, 'sandbox') + '/',
];

function isPathAllowed(filePath) {
    if (!filePath || typeof filePath !== 'string') return false;
    if (filePath.includes('..')) {
        console.warn(`⚠️ Path traversal kísérlet blokkolva: ${filePath}`);
        return false;
    }
    if (!path.isAbsolute(filePath)) {
        console.warn(`⚠️ Relatív útvonal blokkolva: ${filePath}`);
        return false;
    }
    try {
        const resolved = fs.realpathSync(filePath);
        return ALLOWED_PATHS.some(allowed => resolved.startsWith(path.resolve(allowed)));
    } catch (e) {
        const dir = path.dirname(filePath);
        try {
            const resolvedDir = fs.realpathSync(dir);
            return ALLOWED_PATHS.some(allowed => resolvedDir.startsWith(path.resolve(allowed)));
        } catch (e2) {
            const normalizedPath = path.normalize(filePath);
            return ALLOWED_PATHS.some(allowed => normalizedPath.startsWith(path.resolve(allowed)));
        }
    }
}

function isUrlSafe(url) {
    // Saját lokális service-ek engedélyezése
    if (url.startsWith('http://localhost:8080') || url.startsWith('http://127.0.0.1:8080') ||
        url.startsWith('http://localhost:8081') || url.startsWith('http://127.0.0.1:8081')) {
        return true;
    }
    try {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname.toLowerCase();
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            console.warn(`⚠️ Tiltott protokoll: ${parsedUrl.protocol}`);
            return false;
        }
        const internalPatterns = [
            /^localhost$/i, /^127\./, /^10\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
            /^192\.168\./, /^0\.0\.0\.0$/, /^169\.254\./, /^::1$/, /^fc00:/i, /^fe80:/i,
            /\.internal$/i, /\.local$/i
        ];
        for (const pattern of internalPatterns) {
            if (pattern.test(hostname)) {
                console.warn(`⚠️ Belső cím blokkolva: ${hostname}`);
                return false;
            }
        }
        return true;
    } catch (e) {
        console.warn(`⚠️ Érvénytelen URL: ${url}`);
        return false;
    }
}

module.exports = { isPathAllowed, isUrlSafe };