// utils/credentialMonitor.js - Általános Credential Health Monitor
// Első implementáció: Gmail OAuth token. Később bővíthető GitHub PAT,
// OpenAI/Gemini API kulcsok, Home Assistant Long-lived Token stb.

const fs = require('fs');
const path = require('path');

const registry = new Map();

/**
 * Egy credential regisztrálása. Objektum-alapú config, hogy később új
 * mezőkkel bővíthető legyen anélkül hogy a szignatúrát módosítani kellene.
 *
 * @param {Object} config
 * @param {string} config.id - egyedi azonosító, pl. "gmail"
 * @param {string} config.type - pl. "oauth", "api_key", "pat"
 * @param {string} config.displayName - emberi olvasásra, pl. "Gmail OAuth"
 * @param {Function} config.expiryProvider - () => { expiresAt: Date|null, error: string|null }
 * @param {string} [config.renewalCommand] - pl. "node google_setup_manual.js"
 * @param {number} [config.warningDays=2] - hány napon belüli lejárat számít Warning-nak
 */
function registerCredential(config) {
    if (!config || !config.id) {
        throw new Error('registerCredential: hiányzó id mező a configban');
    }
    registry.set(config.id, {
        warningDays: 2,
        ...config
    });
}

/**
 * Egy adott credential állapotának kiszámítása.
 * @returns {Object} { id, displayName, status: 'healthy'|'warning'|'critical'|'unknown', daysRemaining, error, renewalCommand }
 */
function checkOne(config) {
    let expiryInfo;
    try {
        expiryInfo = config.expiryProvider();
    } catch (e) {
        expiryInfo = { expiresAt: null, error: e.message };
    }

    if (expiryInfo.error) {
        return {
            id: config.id,
            displayName: config.displayName,
            status: 'critical',
            daysRemaining: null,
            error: expiryInfo.error,
            renewalCommand: config.renewalCommand || null
        };
    }

    if (!expiryInfo.expiresAt) {
        return {
            id: config.id,
            displayName: config.displayName,
            status: 'unknown',
            daysRemaining: null,
            error: null,
            renewalCommand: config.renewalCommand || null
        };
    }

    const now = new Date();
    const msRemaining = expiryInfo.expiresAt - now;
    const daysRemaining = msRemaining / (1000 * 60 * 60 * 24);

    let status = 'healthy';
    if (msRemaining <= 0) {
        status = 'critical';
    } else if (daysRemaining <= config.warningDays) {
        status = 'warning';
    }

    return {
        id: config.id,
        displayName: config.displayName,
        status,
        daysRemaining: Math.round(daysRemaining * 10) / 10,
        error: null,
        renewalCommand: config.renewalCommand || null
    };
}

/**
 * Az összes regisztrált credential állapota, plusz egy összesített
 * "overall" mező (a legrosszabb egyedi státusz alapján).
 */
 
function getStatus() {
    try {
        const capabilityProfile = require('./capabilityProfile');
        if (!capabilityProfile.isEnabled('credential_monitor')) {
            return { overall: 'disabled', credentials: [] };
        }
    } catch (e) { /* capabilityProfile opcionális, hiba esetén engedjük át */ }

    const results = [];
    for (const config of registry.values()) {
        results.push(checkOne(config));
    }

    const severityOrder = { healthy: 0, unknown: 1, warning: 2, critical: 3 };
    let overall = 'healthy';
    for (const r of results) {
        if (severityOrder[r.status] > severityOrder[overall]) {
            overall = r.status;
        }
    }

    return { overall, credentials: results };
}

// --- Gmail OAuth - első implementáció ---
const GMAIL_TOKEN_PATH = path.join(__dirname, '..', 'gmail_token.json');

registerCredential({
    id: 'gmail',
    type: 'oauth',
    displayName: 'Gmail OAuth',
    renewalCommand: 'bash ~/.termux/tasker/refresh_google_token.sh',
    warningDays: 2,
    expiryProvider: () => {
        try {
            if (!fs.existsSync(GMAIL_TOKEN_PATH)) {
                return { expiresAt: null, error: 'gmail_token.json nem található' };
            }
            const stat = fs.statSync(GMAIL_TOKEN_PATH);
            const token = JSON.parse(fs.readFileSync(GMAIL_TOKEN_PATH, 'utf8'));

            if (!token.refresh_token_expires_in) {
                // Nincs explicit lejárati infó a tokenben (pl. Production/Internal módban) - nem tudjuk pontosan, "unknown"
                return { expiresAt: null, error: null };
            }

            const expiresAt = new Date(stat.mtime.getTime() + token.refresh_token_expires_in * 1000);
            return { expiresAt, error: null };
        } catch (e) {
            return { expiresAt: null, error: e.message };
        }
    }
});

module.exports = { registerCredential, getStatus };
