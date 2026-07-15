// utils/sessionStore.js - Perzisztens agent session kezelés
const fs = require('fs');
const path = require('path');
const { debug, info } = require('./logger');

const SESSIONS_DIR = path.join(__dirname, '../chat_logs/agent_sessions');

// Mappa létrehozása ha nem létezik
if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

function sessionPath(sessionId) {
    return path.join(SESSIONS_DIR, `${sessionId}.json`);
}

function saveSession(sessionId, sessionData) {
    try {
        fs.writeFileSync(
            sessionPath(sessionId),
            JSON.stringify({ ...sessionData, saved_at: new Date().toISOString() }, null, 2)
        );
        debug(`💾 Session mentve: ${sessionId}`);
    } catch(e) {
        debug(`⚠️ Session mentési hiba: ${e.message}`);
    }
}

function loadSession(sessionId) {
    try {
        const p = sessionPath(sessionId);
        if (!fs.existsSync(p)) return null;
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        info(`📂 Session visszatöltve: ${sessionId} (${data.history?.length || 0} üzenet)`);
        return data;
    } catch(e) {
        debug(`⚠️ Session betöltési hiba: ${e.message}`);
        return null;
    }
}

function deleteSession(sessionId) {
    try {
        const p = sessionPath(sessionId);
        if (fs.existsSync(p)) fs.unlinkSync(p);
        debug(`🗑️ Session törölve: ${sessionId}`);
    } catch(e) {
        debug(`⚠️ Session törlési hiba: ${e.message}`);
    }
}

module.exports = { saveSession, loadSession, deleteSession };
