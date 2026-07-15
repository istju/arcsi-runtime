// Main routes modul - Arcsi Runtime hálózati térkép
// ================================================================
// INSTANCE TÉRKÉP:
//
// TELEFON (Edge - Policy Layer)
//   Local:     http://127.0.0.1:3000
//   Tailscale: http://YOUR_PHONE_TAILSCALE_IP:3000
//   Képességek: chat, agent, sandbox_write, instance_call
//
// PROXMOX (Core - Interpretation Layer) [opcionális]
//   LAN:       http://YOUR_PROXMOX_LAN_IP:3000
//   Tailscale: http://YOUR_PROXMOX_TAILSCALE_IP:3000
//   Képességek: chat, agent, ha_get_state, qbittorrent_add_torrent, mqtt
//
// HOME ASSISTANT [opcionális]
//   http://YOUR_HA_IP:8123
// ================================================================
const express = require('express');
const router = express.Router();

router.get('/v1/models', (req, res) => {
    res.json({
        data: [{ id: 'gpt-4', object: 'model', created: 1677610602, owned_by: 'openai' }]
    });
});

router.post('/v1/chat/completions', async (req, res) => {
    res.status(501).json({ error: { message: 'Not implemented' } });
});

router.post('/chat', async (req, res) => {
    res.status(501).json({ error: { message: 'Not implemented' } });
});

router.post('/agent/chat', async (req, res) => {
    res.status(501).json({ error: { message: 'Not implemented' } });
});

module.exports = router;
