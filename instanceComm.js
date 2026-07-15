// instanceComm.js - Telefon <-> Proxmox Arcsi instance-kommunikacios modul
//
// Cel: szabvanyositott, megbizhato modon delegalni keresest a masik
// Arcsi-instance fele, kiszervezett IP/kulcs konfiguracioval (.env-bol).
// Ez valtja ki a korabbi, ad-hoc agent-probalkozasokat (kozvetlen
// http_request hivasok, hibas hitelesitesi kiserletek).

const fetch = require('node-fetch');

const PROXMOX_ARCSI_URL = process.env.PROXMOX_ARCSI_URL || null;
const PROXMOX_ARCSI_KEY = process.env.PROXMOX_ARCSI_KEY || null;

/**
 * Kerest kuld a Proxmox-Arcsi /chat vagy /agent/chat endpointjara.
 * @param {Object} options
 * @param {string} options.prompt - a kuldendo uzenet/feladat
 * @param {string} [options.sessionId] - opcionalis session-azonosito
 * @param {boolean} [options.useAgent=false] - true eseten /agent/chat (tool-hasznalat), false eseten /chat
 * @param {number} [options.timeoutMs=60000] - timeout ezredmasodpercben
 * @returns {Promise<{success: boolean, response?: string, error?: string}>}
 */
async function delegateToProxmox({ prompt, sessionId, useAgent = false, timeoutMs = 60000 }) {
    if (!PROXMOX_ARCSI_URL || !PROXMOX_ARCSI_KEY) {
        return { success: false, error: 'PROXMOX_ARCSI_URL vagy PROXMOX_ARCSI_KEY nincs beallitva a .env-ben' };
    }
    if (!prompt) {
        return { success: false, error: 'Hianyzo prompt parameter' };
    }

    const endpoint = useAgent ? '/agent/chat' : '/chat';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(`${PROXMOX_ARCSI_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${PROXMOX_ARCSI_KEY}`
            },
            body: JSON.stringify({ prompt, sessionId: sessionId || `delegate_${Date.now()}` }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const text = await res.text();

        if (!res.ok) {
            return { success: false, error: `Proxmox-Arcsi hiba (${res.status}): ${text}` };
        }

        return { success: true, response: text };
    } catch (e) {
        clearTimeout(timeoutId);
        if (e.name === 'AbortError') {
            return { success: false, error: `Idotullepes (${timeoutMs}ms) a Proxmox-Arcsi valaszara varva` };
        }
        return { success: false, error: e.message };
    }
}

/**
 * Egyszeru elerhetosegi teszt - megnezi elerheto-e a Proxmox-Arcsi /health endpointja.
 */
async function checkProxmoxHealth() {
    if (!PROXMOX_ARCSI_URL) {
        return { reachable: false, error: 'PROXMOX_ARCSI_URL nincs beallitva' };
    }
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${PROXMOX_ARCSI_URL}/health`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) {
            return { reachable: false, error: `HTTP ${res.status}` };
        }
        const data = await res.json();
        return { reachable: true, data };
    } catch (e) {
        return { reachable: false, error: e.message };
    }
}

/**
 * Rendszerinformáció lekérdezése a Proxmox-Arcsi instance-ról
 */
async function getProxmoxSystemInfo() {
    return await delegateToProxmox({
        prompt: "Kérlek add meg a rendszerinformációidat a system_info tool segítségével. Válaszolj CSAK JSON formátumban: {\"tool\": \"system_info\", \"input\": {}, \"reason\": \"rendszerinformáció lekérdezése\"}",
        useAgent: true
    });
}

module.exports = { delegateToProxmox, checkProxmoxHealth, getProxmoxSystemInfo };
