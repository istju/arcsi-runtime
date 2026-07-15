// utils/capabilityProfile.js - Capability Profile loader (kezdeti vázlat)
//
// Cél: egy explicit JSON profil mondja meg mely modulok aktívak, hogy
// ugyanaz a mag (Node.js+Python runtime, trace.json, tool registry) más
// modulokkal futtatható legyen a hardver/igény szerint.
//
// Ez egy KEZDETI VÁZLAT - jelenleg csak OLVASÁSRA és lekérdezésre szolgál,
// a tényleges modulok (systemMonitor, calendar_create_event tool stb.) MÉG
// NEM ezt a profilt használják a saját be/kikapcsolásukhoz. Ez egy
// következő lépésben kötendő be fokozatosan, modulonként.

const fs = require('fs');
const path = require('path');

const PROFILE_PATH = path.join(__dirname, '..', 'capability_profile.json');

const DEFAULT_PROFILES = {
    mobile_lite: {
        instance_role: 'edge',
        ram_limit_mb: 2048,
        reflection_engine: true,
        pattern_alerts: true,
        health_history: true,
        credential_monitor: true,
        system_monitor: false,
        calendar_integration: true,
        workflow_engine: false,
        multi_agent: false,
        local_llm: false,
        sandbox_self_test: false,
        history_retention_days: 14
    },
    homelab: {
        instance_role: 'core',
        ram_limit_mb: null,
        reflection_engine: true,
        pattern_alerts: true,
        health_history: true,
        credential_monitor: true,
        system_monitor: true,
        calendar_integration: true,
        workflow_engine: true,
        multi_agent: true,
        local_llm: true,
        sandbox_self_test: true,
        history_retention_days: 365
    }
};

function loadProfile() {
    try {
        if (fs.existsSync(PROFILE_PATH)) {
            const data = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
            return data;
        }
    } catch (e) {
        console.error('Capability profile betöltési hiba:', e.message);
    }
    // Nincs fájl - alapértelmezett: mobile_lite (a jelenlegi Termux környezet)
    return { active_profile: 'mobile_lite', profiles: DEFAULT_PROFILES };
}

function saveProfile(profileData) {
    try {
        fs.writeFileSync(PROFILE_PATH, JSON.stringify(profileData, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('Capability profile mentési hiba:', e.message);
        return false;
    }
}

/**
 * Az aktív profil beállításai (mely modulok engedélyezettek).
 */
function getActiveCapabilities() {
    const data = loadProfile();
    const activeName = data.active_profile || 'mobile_lite';
    return {
        profileName: activeName,
        capabilities: data.profiles?.[activeName] || DEFAULT_PROFILES.mobile_lite
    };
}

/**
 * Egy konkrét capability ellenőrzése. Hasznos egyszerű feltételekhez,
 * pl.: if (capabilityProfile.isEnabled('system_monitor')) { ... }
 */
function isEnabled(capabilityName) {
    const { capabilities } = getActiveCapabilities();
    return !!capabilities[capabilityName];
}

function listProfiles() {
    const data = loadProfile();
    return Object.keys(data.profiles || DEFAULT_PROFILES);
}

function switchProfile(profileName) {
    const data = loadProfile();
    if (!data.profiles?.[profileName] && !DEFAULT_PROFILES[profileName]) {
        return { success: false, error: `Ismeretlen profil: ${profileName}` };
    }
    data.active_profile = profileName;
    if (!data.profiles) data.profiles = DEFAULT_PROFILES;
    saveProfile(data);
    return { success: true, profileName };
}

module.exports = {
    getActiveCapabilities,
    isEnabled,
    listProfiles,
    switchProfile,
    loadProfile,
    saveProfile,
    DEFAULT_PROFILES
};
