// runtimeClient.js - Node.js kliens a Python daemon Unix socketjéhez
const net = require('net');
const path = require('path');

const SOCKET_PATH = path.join(__dirname, 'runtime', 'arcsi_runtime.sock');
const TIMEOUT_MS = 15000;
const RETRY_COUNT = 3;
const RETRY_DELAY_MS = 500;

class RuntimeClient {
    constructor(socketPath = SOCKET_PATH) {
        this.socketPath = socketPath;
    }

    /**
     * Belső: egy próbálkozás a daemonnak
     */
    _sendOnce(request) {
        return new Promise((resolve, reject) => {
            const client = net.createConnection(this.socketPath);
            let data = '';

            const timeout = setTimeout(() => {
                client.destroy();
                reject(new Error('Socket timeout'));
            }, TIMEOUT_MS);

            client.on('connect', () => {
                client.write(JSON.stringify(request));
                client.end();
            });

            client.on('data', (chunk) => {
                data += chunk.toString();
            });

            client.on('end', () => {
                clearTimeout(timeout);
                try {
                    const response = JSON.parse(data);
                    resolve(response);
                } catch (err) {
                    reject(new Error(`Invalid JSON response: ${err.message}`));
                }
            });

            client.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
    }

    /**
     * Üzenet küldése retry logikával
     */
    async send(request) {
        let lastError;
        for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
            try {
                return await this._sendOnce(request);
            } catch (err) {
                lastError = err;
                if (attempt < RETRY_COUNT) {
                    await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
                }
            }
        }
        throw lastError;
    }

    /**
     * Aktív projekt kontextusának lekérése
     * Visszatér: {project, context} vagy null
     */
    async getActiveProject() {
        try {
            const res = await this.send({ action: 'get_active_project' });
            if (res && res.ok) return res.data;
            return null;
        } catch (err) {
            console.error('RuntimeClient getActiveProject hiba:', err.message);
            return null;
        }
    }

    /**
     * Teljes context lekérése
     */
    async getContext() {
        try {
            const res = await this.send({ action: 'get_context' });
            if (res && res.ok) return res.data;
            return null;
        } catch (err) {
            console.error('RuntimeClient getContext hiba:', err.message);
            return null;
        }
    }

    /**
     * Státusz lekérése
     */
    async getStatus() {
        try {
            const res = await this.send({ action: 'status' });
            if (res && res.ok) return res.data?.status || res.data;
            return null;
        } catch (err) {
            console.error('RuntimeClient getStatus hiba:', err.message);
            return null;
        }
    }

    /**
     * Esemény naplózása
     */
    async logEvent(eventType, payload) {
        try {
            await this.send({ action: 'log_event', event_type: eventType, payload });
        } catch (err) {
            console.error('RuntimeClient logEvent hiba:', err.message);
        }
    }

    /**
     * Tool használat naplózása
     */
    async logTool(tool, input, output) {
        try {
            await this.send({ action: 'log_tool', tool, input, output });
        } catch (err) {
            console.error('RuntimeClient logTool hiba:', err.message);
        }
    }

    /**
     * Context patch - részleges frissítés
     */
    async patchContext(patch, reason = 'node_patch') {
        try {
            const res = await this.send({ action: 'patch_context', patch, reason });
            return res?.ok || false;
        } catch (err) {
            console.error('RuntimeClient patchContext hiba:', err.message);
            return false;
        }
    }

    /**
     * Mező törlése a contextből
     */
    async deleteField(field, reason = 'node_delete') {
        try {
            const res = await this.send({ action: 'delete_field', field, reason });
            return res?.ok || false;
        } catch (err) {
            console.error('RuntimeClient deleteField hiba:', err.message);
            return false;
        }
    }

    /**
     * Visszaállítás egy korábbi verzióra
     */
    async rollback(version) {
        try {
            const res = await this.send({ action: 'rollback', version });
            return res?.ok || false;
        } catch (err) {
            console.error('RuntimeClient rollback hiba:', err.message);
            return false;
        }
    }

    /**
     * Agent memória hozzáadása
     */
    async appendMemory(key, value) {
        try {
            await this.send({ action: 'append_memory', key, value });
        } catch (err) {
            console.error('RuntimeClient appendMemory hiba:', err.message);
        }
    }

    /**
     * Verziók listázása
     */
    async listVersions() {
        try {
            const res = await this.send({ action: 'list_versions' });
            if (res && res.ok) return res.data?.versions || [];
            return [];
        } catch (err) {
            console.error('RuntimeClient listVersions hiba:', err.message);
            return [];
        }
    }

    /**
     * Elvégzett munka rögzítése a context development_notes mezőjébe
     * Segít megőrizni a kontextust újraindítás után
     */
    async logProgress(summary, nextSteps = []) {
        try {
            // Lekérjük a jelenlegi history-t, hogy hozzáfűzzünk, ne felülírjunk
            const ctx = await this.getContext();
            const existingHistory = ctx?.development_notes?.history || [];

            const newEntry = {
                timestamp: new Date().toISOString(),
                summary,
                next_steps: nextSteps
            };

            // Max 20 bejegyzés megtartása, régiek levágása
            const history = [...existingHistory, newEntry].slice(-20);

            const patch = {
                development_notes: {
                    last_updated: newEntry.timestamp,
                    last_summary: summary,
                    next_steps: nextSteps,
                    history: history
                }
            };
            return await this.patchContext(patch, 'progress_log');
        } catch (err) {
            console.error('RuntimeClient logProgress hiba:', err.message);
            return false;
        }
    }
}

module.exports = { RuntimeClient };
