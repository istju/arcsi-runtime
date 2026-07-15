// instance_call.js - Unified tool az instanceComm.js használatához
const { delegateToProxmox } = require('./instanceComm');

/**
 * instance_call tool implementációja.
 * Segítségével egyetlen JSON hívással lehet kommunikálni a Proxmox-Arcsi instance-dal.
 * 
 * @param {Object} input - A tool bemenete
 * @param {string} input.target - Cél instance ('proxmox')
 * @param {string} input.action - Művelet ('chat'|'agent'|'health')
 * @param {string} [input.prompt] - Küldendő üzenet/feladat (chat/agent esetén)
 * @param {string} [input.sessionId] - Session ID (opcionális)
 * @returns {Promise<Object>} - A válasz objektum
 */
async function instance_call(input) {
    const { target, action, prompt, sessionId } = input;

    if (target !== 'proxmox') {
        return { error: `Nem támogatott cél: ${target}` };
    }

    switch (action) {
        case 'health':
            const health = await require('./instanceComm').checkProxmoxHealth();
            return { success: true, health };

        case 'chat':
        case 'agent':
            if (!prompt) {
                return { error: 'Hiányzó prompt paraméter' };
            }
            return await delegateToProxmox({
                prompt,
                sessionId,
                useAgent: action === 'agent'
            });

        default:
            return { error: `Nem támogatott művelet: ${action}` };
    }
}

module.exports = instance_call;
