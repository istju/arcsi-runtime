// utils/traceLogger.js - Egységes trace napló minden eseményhez
const fs = require('fs');
const path = require('path');

const TRACE_FILE = path.join(__dirname, '..', 'chat_logs', 'trace.json');
const MAX_TRACES = 500;

function localTimestamp() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Budapest',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    }).formatToParts(now);
    const get = (type) => parts.find(p => p.type === type).value;
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}.${ms}`;
}

function generateTraceId() {
    return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadTraces() {
    try {
        if (fs.existsSync(TRACE_FILE)) {
            return JSON.parse(fs.readFileSync(TRACE_FILE, 'utf8'));
        }
    } catch(e) {
        console.error('Trace betöltési hiba:', e.message);
    }
    return [];
}

function saveTraces(traces) {
    try {
        const trimmed = traces.slice(-MAX_TRACES);
        fs.writeFileSync(TRACE_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
    } catch(e) {
        console.error('Trace mentési hiba:', e.message);
    }
}

/**
 * Egy esemény hozzáfűzése egy trace lánchoz.
 * @param {string} traceId - a teljes lánc azonosítója
 * @param {string} state - pl. 'email_received', 'rule_matched', 'ai_decision', 'tool_executed', 'completed'
 * @param {Object} data - tetszőleges, az állapotra jellemző adat
 */
function appendTrace(traceId, state, data = {}) {
    const traces = loadTraces();
    let entry = traces.find(t => t.traceId === traceId);
    if (!entry) {
        entry = { traceId, startedAt: localTimestamp(), events: [] };
        traces.push(entry);
    }
    entry.events.push({
        state,
        timestamp: localTimestamp(),
        data
    });
    entry.lastUpdated = localTimestamp();
    saveTraces(traces);
    return entry;
}

function getTrace(traceId) {
    const traces = loadTraces();
    return traces.find(t => t.traceId === traceId) || null;
}

function getRecentTraces(limit = 20) {
    const traces = loadTraces();
    return traces.slice(-limit);
}

/**
 * Statisztika számítása az összes trace alapján - a Reflection Engine alapja
 */
function getStats() {
    const traces = loadTraces();
    const stats = {
        totalTraces: traces.length,
        completed: 0,
        calendarEventsCreated: 0,
        verifyFailed: 0,
        ruleMatched: 0,
        aiDecisions: 0,
        avgDurationMs: 0
    };

    let totalDuration = 0;
    let durationCount = 0;

    for (const trace of traces) {
        const events = trace.events || [];
        const startEvent = events.find(e => e.state === 'email_received');
        const endEvent = events.find(e => e.state === 'completed');

        if (endEvent) stats.completed++;
        if (events.find(e => e.state === 'rule_matched')) stats.ruleMatched++;
        if (events.find(e => e.state === 'ai_decision')) stats.aiDecisions++;

        const toolEvent = events.find(e => e.state === 'tool_executed' && e.data?.tool === 'calendar_create_event');
        if (toolEvent && toolEvent.data?.success) stats.calendarEventsCreated++;

        const verifyEvent = events.find(e => e.state === 'verify_result');
        if (verifyEvent && verifyEvent.data?.verified === false) stats.verifyFailed++;

        if (startEvent && endEvent) {
            const duration = new Date(endEvent.timestamp) - new Date(startEvent.timestamp);
            if (duration >= 0) {
                totalDuration += duration;
                durationCount++;
            }
        }
    }

    stats.avgDurationMs = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;
    return stats;
}

/**
 * Tapasztalati memória - kulcsszó-alapú pattern statisztika a trace.json-ból.
 * Ez segíti a force_ai szabály jövőbeli finomítását: mely kulcsszó-minták
 * vezetnek tényleg naptáreseményhez.
 */
const PATTERN_KEYWORDS = [
    'találkozó', 'megbeszélés', 'tali', 'talizzunk', 'időpont', 'termin',
    'számla', 'fizetés', 'befizetés', 'hírlevél', 'akció', 'kedvezmény'
];

function getPatternStats() {
    const traces = loadTraces();
    const patterns = {};

    for (const kw of PATTERN_KEYWORDS) {
        patterns[kw] = { count: 0, calendar_created: 0, success_rate: 0 };
    }

    for (const trace of traces) {
        const events = trace.events || [];
        const emailEvent = events.find(e => e.state === 'email_received');
        if (!emailEvent) continue;

        const subject = (emailEvent.data?.subject || '').toLowerCase();
        const matchedKeyword = PATTERN_KEYWORDS.find(kw => subject.includes(kw));
        if (!matchedKeyword) continue;

        patterns[matchedKeyword].count++;

        const toolEvent = events.find(e => e.state === 'tool_executed' && e.data?.tool === 'calendar_create_event');
        if (toolEvent && toolEvent.data?.success) {
            patterns[matchedKeyword].calendar_created++;
        }
    }

    for (const kw of Object.keys(patterns)) {
        const p = patterns[kw];
        p.success_rate = p.count > 0 ? Math.round((p.calendar_created / p.count) * 1000) / 10 : 0;
        p.confidence = p.count < 10 ? 'low' : (p.count < 50 ? 'medium' : 'high');
    }

    // Csak azokat adjuk vissza, amikhez van legalább 1 megfigyelés
    const result = {};
    for (const kw of Object.keys(patterns)) {
        if (patterns[kw].count > 0) result[kw] = patterns[kw];
    }
    return result;
}

/**
 * Reflection Engine v1 - egyszerű, szabály-alapú napi összefoglaló.
 * Nincs AI hívás, csak a trace.json adatból számolt statisztika + szöveges ajánlás.
 */
function getDailySummary(dateKey = null) {
    const todayKey = dateKey || new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest' }).format(new Date());
    const traces = loadTraces();

    const todayTraces = traces.filter(t => {
        const ts = t.startedAt || '';
        return ts.startsWith(todayKey);
    });

    const summary = {
        date: todayKey,
        emails_processed: todayTraces.length,
        calendar_events_created: 0,
        verify_failed: 0,
        timeouts: 0,
        completed: 0,
        avg_duration_ms: 0
    };

    let totalDuration = 0;
    let durationCount = 0;

    for (const trace of todayTraces) {
        const events = trace.events || [];
        const startEvent = events.find(e => e.state === 'email_received');
        const endEvent = events.find(e => e.state === 'completed');

        if (endEvent) summary.completed++;

        const toolEvent = events.find(e => e.state === 'tool_executed' && e.data?.tool === 'calendar_create_event');
        if (toolEvent && toolEvent.data?.success) summary.calendar_events_created++;

        const verifyEvent = events.find(e => e.state === 'verify_result');
        if (verifyEvent && verifyEvent.data?.verified === false) summary.verify_failed++;

        const hasTimeout = events.some(e =>
            (e.data?.error && typeof e.data.error === 'string' && e.data.error.toLowerCase().includes('timeout'))
        );
        if (hasTimeout) summary.timeouts++;

        if (startEvent && endEvent) {
            const duration = new Date(endEvent.timestamp) - new Date(startEvent.timestamp);
            if (duration >= 0) {
                totalDuration += duration;
                durationCount++;
            }
        }
    }

    summary.avg_duration_ms = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;

    // Szabály-alapú ajánlás (NEM AI)
    const recommendations = [];
    if (summary.emails_processed > 0 && summary.timeouts / summary.emails_processed > 0.2) {
        recommendations.push('A timeout arány emelkedett. Érdemes ellenőrizni a hálózati kapcsolatot.');
    }
    if (summary.verify_failed > 0) {
        recommendations.push(`${summary.verify_failed} verifikációs hiba történt - érdemes megnézni a Calendar API stabilitását.`);
    }
    if (summary.emails_processed > 0 && summary.completed < summary.emails_processed) {
        recommendations.push(`${summary.emails_processed - summary.completed} email nem ért completed állapotba - lehet hogy elakadt egy folyamat.`);
    }
    if (recommendations.length === 0 && summary.emails_processed > 0) {
        recommendations.push('Minden rendben, nincs szokatlan esemény.');
    }

try {
        const credentialMonitor = require('./credentialMonitor');
        const credStatus = credentialMonitor.getStatus();
        for (const cred of credStatus.credentials) {
            if (cred.status === 'warning') {
                recommendations.push(`⚠️ ${cred.displayName} ${cred.daysRemaining} nap múlva lejár. Futtasd: ${cred.renewalCommand}`);
            } else if (cred.status === 'critical') {
                recommendations.push(`🔴 ${cred.displayName} lejárt vagy hibás! Futtasd: ${cred.renewalCommand}`);
            }
        }
    } catch (e) {
        // credentialMonitor opcionális
    }

    summary.recommendations = recommendations;
    return summary;
}

/**
 * Pattern Alert Engine - automatikus figyelmeztetés alacsony success_rate
 * vagy szokatlan gyakoriság esetén. A getPatternStats()-ra épül.
 */
function getPatternAlerts(successRateThreshold = 50, minCount = 2) {
    const patterns = getPatternStats();
    const alerts = [];

    for (const [keyword, stats] of Object.entries(patterns)) {
        if (stats.count >= minCount && stats.success_rate < successRateThreshold) {
            if (stats.confidence === 'low') {
                alerts.push({
                    type: 'low_confidence_observation',
                    keyword,
                    count: stats.count,
                    success_rate: stats.success_rate,
                    confidence: stats.confidence,
                    message: `ℹ️ Megfigyelés (alacsony megbízhatóság, csak ${stats.count} minta): "${keyword}" success rate ${stats.success_rate}%. Még korai következtetést levonni.`
                });
            } else {
                alerts.push({
                    type: 'low_success_rate',
                    keyword,
                    count: stats.count,
                    success_rate: stats.success_rate,
                    confidence: stats.confidence,
                    message: `⚠️ Pattern warning: "${keyword}" success rate ${stats.success_rate}% (${stats.calendar_created}/${stats.count}, confidence: ${stats.confidence}) - érdemes átnézni a force_ai szabályt.`
                });
            }
        }
        if (stats.count >= 10) {
            alerts.push({
                type: 'high_frequency',
                keyword,
                count: stats.count,
                confidence: stats.confidence,
                message: `ℹ️ A "${keyword}" pattern az elmúlt időszakban ${stats.count} alkalommal fordult elő.`
            });
        }
    }

    return alerts;
}

/**
 * Agent Health Score - egyetlen 0-100 szám a rendszer napi egészségi állapotáról.
 * 100 pontból indul, és arányosan von le a negatív eseményekért.
 */
function getHealthScore(dateKey = null) {
    const summary = getDailySummary(dateKey);
    let score = 100;

    let reliability = 100;
    let performance = 100;
    let recovery = 100;

    if (summary.emails_processed > 0) {
        const completedRate = summary.completed / summary.emails_processed;
        const verifyFailRate = summary.verify_failed / summary.emails_processed;
        const timeoutRate = summary.timeouts / summary.emails_processed;

        reliability -= (1 - completedRate) * 70;
        reliability -= verifyFailRate * 100;
        reliability = Math.max(0, Math.min(100, Math.round(reliability)));

        performance -= timeoutRate * 100;
        if (summary.avg_duration_ms > 5000) {
            performance -= 20;
        }
        performance = Math.max(0, Math.min(100, Math.round(performance)));

        score -= (1 - completedRate) * 40;
        score -= verifyFailRate * 30;
        score -= timeoutRate * 20;
    }

    let credentialsComponent = 100;
    let credentialsStatus = null;
    try {
        const credentialMonitor = require('./credentialMonitor');
        const credStatus = credentialMonitor.getStatus();
        credentialsStatus = credStatus;
        if (credStatus.overall === 'critical') credentialsComponent = 0;
        else if (credStatus.overall === 'warning') credentialsComponent = 60;
        else if (credStatus.overall === 'unknown') credentialsComponent = 90;

        if (credStatus.overall === 'critical') score -= 30;
        else if (credStatus.overall === 'warning') score -= 10;
    } catch (e) {
        // credentialMonitor opcionális - ha hiba van, nem blokkolja a health score-t
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    let status = 'excellent';
    if (score < 60) status = 'critical';
    else if (score < 80) status = 'warning';
    else if (score < 95) status = 'good';

    return {
        date: summary.date,
        health_score: score,
        status,
        components: {
            reliability,
            performance,
            recovery,
            credentials: credentialsComponent
        },
        credentials_detail: credentialsStatus,
        breakdown: {
            completed: summary.completed,
            emails_processed: summary.emails_processed,
            verify_failed: summary.verify_failed,
            timeouts: summary.timeouts
        }
    };
}

const HEALTH_HISTORY_FILE = path.join(__dirname, '..', 'chat_logs', 'health_history.json');

function loadHealthHistory() {
    try {
        if (fs.existsSync(HEALTH_HISTORY_FILE)) {
            return JSON.parse(fs.readFileSync(HEALTH_HISTORY_FILE, 'utf8'));
        }
    } catch(e) {
        console.error('Health history betöltési hiba:', e.message);
    }
    return [];
}

/**
 * Napi health record rögzítése a history-ba. Ha a mai napra már van rekord,
 * felülírja (idempotens - többszöri hívás nem duplikál).
 */
function recordDailyHealth(systemChange = null) {
    const health = getHealthScore();
    const history = loadHealthHistory();

    const record = {
        date: health.date,
        health_score: health.health_score,
        status: health.status,
        completed: health.breakdown.completed,
        verify_failed: health.breakdown.verify_failed,
        timeouts: health.breakdown.timeouts,
        system_change: systemChange
    };

    const existingIndex = history.findIndex(h => h.date === health.date);
    if (existingIndex >= 0) {
        history[existingIndex] = record;
    } else {
        history.push(record);
    }

    const trimmed = history.slice(-90);
    try {
        fs.writeFileSync(HEALTH_HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
    } catch(e) {
        console.error('Health history mentési hiba:', e.message);
    }

    return record;
}

function getHealthHistory(days = 30) {
    const history = loadHealthHistory();
    return history.slice(-days);
}

const ANOMALY_LOG_FILE = path.join(__dirname, '..', 'chat_logs', 'anomaly_log.json');

function loadAnomalyLog() {
    try {
        if (fs.existsSync(ANOMALY_LOG_FILE)) {
            return JSON.parse(fs.readFileSync(ANOMALY_LOG_FILE, 'utf8'));
        }
    } catch(e) {
        console.error('Anomaly log betöltési hiba:', e.message);
    }
    return [];
}

/**
 * Első anomália napló - mini tudásbázis a rendszer saját hibáiról/javításairól.
 * Csak EGYSZER rögzíti egy adott pattern első felismerését (nem duplikál minden riasztásnál).
 */
function recordAnomaly(pattern, successRate, actionTaken = null) {
    const log = loadAnomalyLog();
    const existing = log.find(a => a.pattern === pattern);

    if (existing) {
        if (actionTaken && !existing.action_taken) {
            existing.action_taken = actionTaken;
            existing.action_taken_at = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest' }).format(new Date());
        }
        saveAnomalyLog(log);
        return existing;
    }

    const entry = {
        pattern,
        first_detected: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest' }).format(new Date()),
        success_rate: successRate,
        action_taken: actionTaken,
        action_taken_at: actionTaken ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest' }).format(new Date()) : null
    };
    log.push(entry);
    saveAnomalyLog(log);
    return entry;
}

function saveAnomalyLog(log) {
    try {
        fs.writeFileSync(ANOMALY_LOG_FILE, JSON.stringify(log, null, 2), 'utf8');
    } catch(e) {
        console.error('Anomaly log mentési hiba:', e.message);
    }
}

function getAnomalyLog() {
    return loadAnomalyLog();
}

/**
 * Automatikus ellenőrzés: a jelenlegi pattern alertek alapján rögzíti az
 * újonnan felismert (még nem naplózott) anomáliákat. Csak medium/high
 * confidence esetén rögzít, low confidence-nél még nem von le végleges
 * következtetést.
 */
function checkAndRecordNewAnomalies() {
    const alerts = getPatternAlerts();
    const newlyRecorded = [];

    for (const alert of alerts) {
        if (alert.type === 'low_success_rate' && alert.confidence !== 'low') {
            const existing = loadAnomalyLog().find(a => a.pattern === alert.keyword);
            if (!existing) {
                const recorded = recordAnomaly(alert.keyword, alert.success_rate);
                newlyRecorded.push(recorded);
            }
        }
    }

    return newlyRecorded;
}

module.exports = { generateTraceId, appendTrace, getTrace, getRecentTraces, loadTraces, getStats, getPatternStats, getDailySummary, getPatternAlerts, getHealthScore, recordDailyHealth, getHealthHistory, recordAnomaly, getAnomalyLog, checkAndRecordNewAnomalies };