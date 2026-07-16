// utils/i18n.js - Internationalization module
// Language is set via ARCSI_LANG environment variable (default: 'en')

const path = require('path');
const fs = require('fs');

const LANG = process.env.ARCSI_LANG || 'en';
const localePath = path.join(__dirname, '..', 'locales', `${LANG}.json`);

let strings = {};
try {
    strings = JSON.parse(fs.readFileSync(localePath, 'utf8'));
} catch (e) {
    // Fallback to English
    try {
        strings = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', 'en.json'), 'utf8'));
    } catch (e2) {
        console.error('i18n: Could not load any language file');
    }
}

function t(key, vars = {}) {
    const keys = key.split('.');
    let val = strings;
    for (const k of keys) {
        val = val?.[k];
        if (!val) return key; // fallback: return key if not found
    }
    return val.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

module.exports = { t, LANG };
