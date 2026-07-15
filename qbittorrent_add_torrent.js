#!/usr/bin/env node

// qbittorrent_add_torrent.js - Torrent hozzáadása a qBittorrent szerverhez
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// qBittorrent API beállítások
const QBITTORRENT_URL = process.env.QBITTORRENT_URL || 'http://localhost:8080';
const QBITTORRENT_USER = process.env.QBITTORRENT_USER || 'admin';
const QBITTORRENT_PASS = process.env.QBITTORRENT_PASS || 'adminadmin';

/**
 * Bejelentkezés a qBittorrent API-ba
 * @returns {Promise<string>} - Session cookie
 */
async function login() {
    const res = await fetch(`${QBITTORRENT_URL}/api/v2/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `username=${QBITTORRENT_USER}&password=${QBITTORRENT_PASS}`
    });

    if (!res.ok) {
        throw new Error(`Login failed: ${res.status}`);
    }

    const cookie = res.headers.get('set-cookie');
    if (!cookie) {
        throw new Error('No session cookie received');
    }

    return cookie.split(';')[0]; // Első cookie, SID=...
}

/**
 * Torrent hozzáadása magnet link alapján
 * @param {string} magnetLink - A torrent magnet linkje
 * @param {string} [category] - Kategória (opcionális)
 * @returns {Promise<void>}
 */
async function addTorrent(magnetLink, category = 'phone') {
    const cookie = await login();

    const formData = new URLSearchParams();
    formData.append('urls', magnetLink);
    if (category) {
        formData.append('category', category);
    }

    const res = await fetch(`${QBITTORRENT_URL}/api/v2/torrents/add`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': cookie
        },
        body: formData.toString()
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Add torrent failed: ${res.status} - ${text}`);
    }

    console.log(`✅ Torrent hozzáadva: ${magnetLink}`);
    console.log(`📁 Kategória: ${category || 'nincs'}`);
}

// CLI interface
if (require.main === module) {
    const magnetLink = process.argv[2];
    const category = process.argv[3] || 'phone';

    if (!magnetLink) {
        console.error('Használat: node qbittorrent_add_torrent.js <magnet_link> [category]');
        process.exit(1);
    }

    addTorrent(magnetLink, category)
        .then(() => console.log('✅ Kész'))
        .catch(err => {
            console.error('❌ Hiba:', err.message);
            process.exit(1);
        });
}

module.exports = { addTorrent };
