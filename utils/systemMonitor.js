// utils/systemMonitor.js - Opcionális memória/CPU monitorozó modul
const os = require('os');
const SETTINGS = require('../config/settings');
const { info, debug } = require('./logger');

let monitorInterval = null;

function checkSystem() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const usedPercent = (usedMem / totalMem) * 100;
    const loadAvg = os.loadavg()[0]; // 1 perces átlag

    debug(`📊 Monitor: RAM ${usedPercent.toFixed(1)}% használt | Load avg: ${loadAvg.toFixed(2)}`);

    if (usedPercent > SETTINGS.MONITORING_MEM_THRESHOLD_PERCENT) {
        info(`⚠️  MONITOR FIGYELMEZTETÉS: RAM használat magas (${usedPercent.toFixed(1)}%, küszöb: ${SETTINGS.MONITORING_MEM_THRESHOLD_PERCENT}%)`);
    }

    if (loadAvg > SETTINGS.MONITORING_CPU_LOAD_THRESHOLD) {
        info(`⚠️  MONITOR FIGYELMEZTETÉS: CPU load magas (${loadAvg.toFixed(2)}, küszöb: ${SETTINGS.MONITORING_CPU_LOAD_THRESHOLD})`);
    }

    return {
        memory: { totalMem, freeMem, usedMem, usedPercent },
        loadAvg,
        timestamp: new Date().toISOString()
    };
}

/**
 * Monitorozás elindítása, ha a SETTINGS.MONITORING_ENABLED igaz.
 * Ha nincs bekapcsolva, nem indít semmilyen interval-t (nulla overhead).
 */
function startMonitoring() {
    let capabilityAllows = true;
    try {
        const capabilityProfile = require('./capabilityProfile');
        capabilityAllows = capabilityProfile.isEnabled('system_monitor');
    } catch (e) {
        // capabilityProfile opcionális - ha hiba van, az .env beállítás dönt
    }

    if (!SETTINGS.MONITORING_ENABLED) {
        debug('📊 Monitoring disabled (MONITORING_ENABLED=false)');
        return;
    }
    if (!capabilityAllows) {
        debug('📊 Monitoring disabled (capability profile: system_monitor=false)');
        return;
    }
    if (monitorInterval) return; // már fut

    info(`📊 Monitoring started (${SETTINGS.MONITORING_INTERVAL_MS / 1000}s interval)`);
    checkSystem(); // azonnali első futás
    monitorInterval = setInterval(checkSystem, SETTINGS.MONITORING_INTERVAL_MS);
}

function stopMonitoring() {
    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
        info('📊 Monitoring stopped');
    }
}

module.exports = { startMonitoring, stopMonitoring, checkSystem };
