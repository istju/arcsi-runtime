// emailDigest.js - Email napi/heti/havi összefoglaló kezelő
const fs = require('fs');
const path = require('path');

const DIGEST_FILE = path.join(__dirname, 'email_digest.json');

function loadDigest() {
    try {
        if (fs.existsSync(DIGEST_FILE)) {
            return JSON.parse(fs.readFileSync(DIGEST_FILE, 'utf8'));
        }
    } catch(e) {
        console.error('Digest betöltési hiba:', e.message);
    }
    return { daily: {}, weekly: [], monthly: [] };
}

function saveDigest(digest) {
    try {
        fs.writeFileSync(DIGEST_FILE, JSON.stringify(digest, null, 2), 'utf8');
    } catch(e) {
        console.error('Digest mentési hiba:', e.message);
    }
}

function todayKey() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest' }).format(new Date());
}

function localTimestamp() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Budapest',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    }).formatToParts(now);
    const get = (type) => parts.find(p => p.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

/**
 * Egy email bejegyzés hozzáadása a mai naphoz
 */
function addDailyEntry(entry) {
    const digest = loadDigest();
    const key = todayKey();

    if (!digest.daily[key]) digest.daily[key] = [];

    digest.daily[key].push({
        time: localTimestamp(),
        from: entry.from,
        subject: entry.subject,
        summary: entry.summary || entry.reason || '',
        importance: entry.importance || 'medium'
    });

    saveDigest(digest);
    return digest.daily[key];
}

/**
 * Mai napi összefoglaló lekérése
 */
function getTodayDigest() {
    const digest = loadDigest();
    return digest.daily[todayKey()] || [];
}

/**
 * Egy adott nap összefoglalója
 */
function getDailyDigest(dateKey) {
    const digest = loadDigest();
    return digest.daily[dateKey] || [];
}

/**
 * Heti összevonás - a daily bejegyzéseket egy hét alapján csoportosítja
 * (a hívó oldalon az AI-val összegezhető a tartalom)
 */
function getWeekEntries(daysBack = 7) {
    const digest = loadDigest();
    const result = [];
    const now = new Date();

    for (let i = 0; i < daysBack; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest' }).format(d);
        if (digest.daily[key]) {
            result.push(...digest.daily[key].map(e => ({ ...e, date: key })));
        }
    }
    return result;
}

/**
 * Napi bejegyzések archiválása heti összefoglalóba (7 napnál régebbi napi adatok törlése)
 */
function archiveOldDailyEntries(retainDays = 7) {
    const digest = loadDigest();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retainDays);
    const cutoffKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest' }).format(cutoff);

    const toArchive = [];
    for (const key of Object.keys(digest.daily)) {
        if (key < cutoffKey) {
            toArchive.push({ date: key, entries: digest.daily[key] });
            delete digest.daily[key];
        }
    }

    if (toArchive.length > 0) {
        digest.weekly.push({
            archived_at: localTimestamp(),
            period: `${toArchive[toArchive.length-1].date} - ${toArchive[0].date}`,
            days: toArchive
        });
        // Max 10 heti archívum megtartása
        digest.weekly = digest.weekly.slice(-10);
    }

    saveDigest(digest);
    return toArchive.length;
}

module.exports = {
    addDailyEntry,
    getTodayDigest,
    getDailyDigest,
    getWeekEntries,
    archiveOldDailyEntries,
    loadDigest
};
