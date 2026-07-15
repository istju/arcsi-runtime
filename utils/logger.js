const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../chat_logs');
if (!fs.existsSync(LOG_DIR)) {
    try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch(e) {}
}

function localTimestamp() {
    // Helyi (Europe/Budapest) idő ISO-szerű formátumban, de nem UTC
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Budapest',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    }).formatToParts(now);
    const get = (type) => parts.find(p => p.type === type).value;
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}.${ms}`;
}

function info(msg) {
    console.log(`[INFO] ${localTimestamp()} - ${msg}`);
}

function error(msg) {
    console.error(`[ERROR] ${localTimestamp()} - ${msg}`);
}

function debug(msg) {
    console.debug(`[DEBUG] ${localTimestamp()} - ${msg}`);
}

function logToFile(sessionId, userMsg, aiMsg, providerName) {
    const today = localTimestamp().split('T')[0];
    const logFile = path.join(LOG_DIR, 'log_' + today + '.txt');
    const timestamp = new Date().toLocaleString('hu-HU');
    const logEntry = '[' + timestamp + '] [Session: ' + sessionId + '] [Provider: ' + providerName + ']\nUSER: ' + userMsg + '\nAI: ' + aiMsg + '\n' + '='.repeat(60) + '\n';
    try { fs.appendFileSync(logFile, logEntry, 'utf8'); } catch(e) {
        console.error('[LOGGER] Fájl írási hiba:', e.message);
    }
}

module.exports = { info, error, debug, logToFile };