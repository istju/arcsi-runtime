
// AI CHAT PRO v2 - SERVEREM.JS (moduláris)
// CORS, history limit, log cleanup, agent session folytatás
require('dotenv').config({ path: __dirname + '/.env' });

const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// --- MODULÁRIS IMPORT ---
function getLocalDateStr() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest' }).format(new Date());
}
function getLocalDateInfo() {
    const now = new Date();
    const dateStr = getLocalDateStr();
    const weekday = new Intl.DateTimeFormat('hu-HU', { timeZone: 'Europe/Budapest', weekday: 'long' }).format(now);

    // ISO 8601 hét szám kiszámítása
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);

    return { dateStr, weekday, weekNum };
}
const SETTINGS = require('./config/settings');
const { agentCall, agentLoop, executeTool } = require('./agents/agentLogic');
const { info, error, debug, logToFile } = require('./utils/logger');
const { t } = require('./utils/i18n');
const { toolRegistry } = require('./tools/toolRegistry');
const {
  chooseProvider,
  callWithFallback,
  getProvider,
  FALLBACK_ORDER,
} = require('./utils/providerUtils');
const { saveSession, loadSession, deleteSession } = require('./utils/sessionStore');
const { RuntimeClient } = require('./runtimeClient');
const runtimeClient = new RuntimeClient();
const ProjectManager = require('./projects/projectManager');
const projectManager = new ProjectManager(__dirname);

const app = express();
const PORT = SETTINGS.PORT;

// ================================================================
// CAPABILITY MANIFEST - Better Agent / MCP integration
// ================================================================
app.get('/capabilities', (req, res) => {
    const { toolRegistry } = require('./tools/toolRegistry');
    res.json({
        runtime: 'arcsi-runtime',
        version: '1.1.0',
        host: process.env.ARCSI_HOST_TYPE || 'generic',
        tools: Array.from(toolRegistry.keys()),
        environment: {
            node: process.version,
            platform: process.platform,
            arch: process.arch
        },
        features: {
            agent_mode: true,
            sandbox: true,
            research_trace: true,
            instance_call: !!process.env.PROXMOX_ARCSI_URL,
            home_assistant: !!process.env.HA_URL,
            calendar: true
        },
        active_project: null // filled at request time
    });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime_seconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// ================================================================
// LOG DIRECTORY
// ================================================================
const LOG_DIR = SETTINGS.LOG_DIR;
if (!fs.existsSync(LOG_DIR)) {
  try {
    fs.mkdirSync(LOG_DIR);
  } catch (e) {
    debug('Log mappa hiba:', e.message);
  }
}
const LOG_FILE = path.join(
  LOG_DIR,
  'log_' + getLocalDateStr() + '.txt'
);

// ================================================================
// NOTIFICATION RULES
// ================================================================
const RULES_FILE = path.join(__dirname, 'notification_rules.json');

let notificationRules = [];
try {
  if (fs.existsSync(RULES_FILE)) {
    notificationRules = JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));
    info(`📋 ${t('server.rules_loaded', {count: notificationRules.length})}`);
  }
} catch (e) {
  debug('⚠️ Szabály betöltési hiba:', e.message);
}

function saveRules() {
  try {
    fs.writeFileSync(RULES_FILE, JSON.stringify(notificationRules, null, 2), 'utf8');
  } catch (e) {
    debug('⚠️ Szabály mentési hiba:', e.message);
  }
}

function addNotificationRule(rule) {
  notificationRules.push(rule);
  saveRules();
  info(`📋 ${t('server.rule_added', {app: rule.app || '*', action: rule.action})}`);
}

function clearNotificationRules(appName = null) {
  if (appName) {
    notificationRules = notificationRules.filter(r => r.app !== appName);
    info(`🗑️ ${t('server.rules_deleted_app', {app: appName})}`);
  } else {
    notificationRules = [];
    info(`🗑️ Összes szabály törölve`);
  }
  saveRules();
}

function matchNotificationRule(app, title, text) {
  for (const rule of notificationRules) {
    let appMatch = false;
    if (!rule.app) {
      appMatch = true;
    } else if (rule.appRegex) {
      try { appMatch = new RegExp(rule.app, 'i').test(app); } catch {}
    } else {
      appMatch = rule.app.toLowerCase() === (app || '').toLowerCase();
    }
    if (!appMatch) continue;

    let titleMatch = true;
    if (rule.titleRegex) {
      try { titleMatch = new RegExp(rule.titleRegex, 'i').test(title || ''); } catch {}
    }
    let textMatch = true;
    if (rule.textRegex) {
      try { textMatch = new RegExp(rule.textRegex, 'i').test(text || ''); } catch {}
    }
    if (titleMatch && textMatch) {
      return { importance: rule.importance, action: rule.action, reason: rule.reason || 'Szabály alapján' };
    }
  }
  return null;
}

// ================================================================
// EXPRESS CONFIG
// ================================================================
app.use(express.json({
  limit: '50mb',
  verify: (req, res, buf) => { req.rawBody = buf.toString(); },
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ================================================================
// CORS (csak localhost)
// ================================================================
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin === 'http://127.0.0.1:3000' || origin === 'http://localhost:3000') {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Session store
const sessions = new Map();
const agentSessions = new Map();
// Perzisztens sessionök visszatöltése induláskor
// (csak a session ID-kat töltjük be, a tényleges adatokat lekéréskor)

// ================================================================
// BEARER TOKEN VÉDELEM (csak agent/gmail endpointokra)
// ================================================================
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (token !== process.env.ARCSI_LOCAL_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// ================================================================
// PROJEKT KONTEXTUS HELPER
// ================================================================
async function buildProjectContext() {
  let activeProject = null;

  // 1. Python runtime daemon (elsődleges)
  try {
    const runtimeData = await runtimeClient.getActiveProject();
    if (runtimeData?.context) {
      activeProject = runtimeData.context;
      info(`📁 ${t('project.active_runtime', {name: activeProject.name})}`);
    }
  } catch (e) {
    debug('Runtime daemon unavailable:', e.message);
  }

  // 2. Fallback: projectManager
  if (!activeProject) {
    try {
      activeProject = projectManager.getActiveProject();
      if (activeProject) info(`📁 ${t('project.active_fallback', {name: activeProject.name})}`);
    } catch (e) {
      debug('ProjectManager fallback hiba:', e.message);
    }
  }

  return activeProject;
}

function applyProjectToPrompt(systemPrompt, activeProject) {
  if (!activeProject) return systemPrompt;

  if (activeProject.system_prompt) {
    systemPrompt += `\n\n--- PROJEKT KONTEXTUS ---\n${activeProject.system_prompt}\n---\n`;
  }
  if (activeProject.rules?.length > 0) {
    systemPrompt += `\n\nProjekt szabályok:\n${activeProject.rules.map((rule, i) => `${i + 1}. ${rule}`).join('\n')}`;
  }
  if (activeProject.description) {
    systemPrompt += `\n\nAktuális projekt leírása: ${activeProject.description}`;
  }
  if (activeProject.development_notes) {
    systemPrompt += `\n\n--- LEGUTÓBBI FEJLESZTÉSI ÁLLAPOT ---\nUtolsó frissítés: ${activeProject.development_notes.last_updated || 'ismeretlen'}\nUtolsó elvégzett munka: ${activeProject.development_notes.last_summary || 'nincs adat'}\nKövetkező lépések: ${(activeProject.development_notes.next_steps || []).join(', ') || 'nincs megadva'}\n---\n`;
  }
  if (activeProject.current_focus) {
    const f = activeProject.current_focus;
    systemPrompt += `\n\n--- JELENLEGI FÓKUSZ ---\nCél: ${f.goal || ''}\nIndok: ${f.reason || ''}\nSikerességi kritériumok: ${(f.success_criteria || []).join(', ')}\n---\n`;
  }
// Research projekt mezők
  if (activeProject.research_goal) {
    systemPrompt += `\n\n--- KUTATÁSI PROJEKT KONTEXTUS ---\nKutatási cél: ${activeProject.research_goal}\n`;
    if (activeProject.mental_model) systemPrompt += `Jelenlegi mentális modell: ${activeProject.mental_model}\n`;
    if (activeProject.core_principles?.length > 0) systemPrompt += `Alapelvek: ${activeProject.core_principles.join(' | ')}\n`;
    if (activeProject.open_questions?.length > 0) systemPrompt += `Nyitott kérdések: ${activeProject.open_questions.join(' | ')}\n`;
    if (activeProject.research_trace?.length > 0) {
      const recentCount = Math.min(3, activeProject.research_trace.length);
      const recent = activeProject.research_trace.slice(-recentCount);
      systemPrompt += `Legutóbbi ${recentCount} kutatási bejegyzés:\n`;
      recent.forEach(trace => {
        systemPrompt += `  [${trace.knowledge_id || '?'}] [${trace.type}] (${trace.date}): ${trace.content.substring(0, 150)}...\n`;
      });
    }
      
    if (activeProject.available_sandbox_tools?.length > 0) {
      systemPrompt += `\nElérhető sandbox Python eszközök:\n`;
      activeProject.available_sandbox_tools.forEach(tool => {
        systemPrompt += `- ${tool.name}: ${tool.purpose}`;
        if (tool.entry_points?.length > 0) systemPrompt += ` | Belépési pontok: ${tool.entry_points.slice(0,3).join(', ')}`;
        if (tool.depends_on?.length > 0) systemPrompt += ` | Függ: ${tool.depends_on.join(', ')}`;
        systemPrompt += `\n`;
      });
    }
    systemPrompt += `---\n`;
  }
  return systemPrompt;
}


// ================================================================
// SYSTEM PROMPTS
// ================================================================
const SYSTEM_PROMPT = `
{{DATE_CONTEXT}}
{{HEALTH_CONTEXT}}
{{CALENDAR_CONTEXT}}
{{PROJECT_PATH_CONTEXT}}
LANGUAGE: ${t('system.language_rule')}

Your name is Arcsi.
You run on Ollama Cloud.
You are an advanced AI Agent system running in an Android (Termux) environment.
Your task: Autonomous problem-solving using tools.

STYLE AND RULES:
1. Be concise and to the point.
2. If you call a tool, send ONLY the JSON, without explanation.
3. If you get an error, try an alternative solution, do not give up immediately.
4. Always use ABSOLUTE paths for file operations.
5. ${t('system.language_rule')}
6. If you use a tool, send ONLY the JSON as your response — no text before or after!

SECURITY:
- Do not run dangerous shell commands (rm -rf, chmod 777, etc.).
- Do not send sensitive data to public webhooks.
- Always verify file paths before writing.
- Only use append_to_research_trace if the user explicitly approves: "save", "yes", "ok save", etc.

NETWORK CONTEXT:
This is the phone (edge) instance. LAN addresses (192.168.x.x) are NOT accessible on mobile data, only on home WiFi.
Proxmox-Arcsi (core, YOUR_PROXMOX_TAILSCALE_IP) has LAN access and Home Assistant.
- HA REST API / climate / device states: instance_call → proxmox → ha_get_state
- qBittorrent (YOUR_QBITTORRENT_IP:8080): instance_call → proxmox → qbittorrent_add_torrent
- MQTT (YOUR_HA_IP:1883): accessible through Proxmox
The phone NEVER connects directly to LAN addresses — always use instance_call.
IMPORTANT: For torrent downloads, NEVER use shell_exec! Only instance_call → proxmox → qbittorrent_add_torrent. If instance_call fails, notify the user — do not try shell_exec workarounds.
- FORBIDDEN: autonomous modification of the system itself (toolRegistry.js, serverem.js, config files) without explicit user request.
- When using instance_call: action="agent" if Proxmox needs to use tools (qbittorrent, ha_get_state etc.), action="chat" only for information queries.
- Gate opener (switch.kapunyito_kapu): instance_call → proxmox → HA REST API (NOT MQTT!).
GOAL:
Execute the user's request in the fewest possible steps, as accurately as possible.
`.trim();

const NOTIFY_PROMPT = `
You are a NotificationAgent.
Your task: analyze the importance of notifications.
Always respond in STRICT JSON format:
{
  "importance": "high|medium|low",
  "action": "alert|mute|archive",
  "reason": "short explanation"
}
`.trim();

const SYSTEM_OPT_PROMPT = `
You are a SystemOptimizerAgent.
Your task: analyze Android system state.
Always respond in STRICT JSON format:
{
  "action": "none|kill|limit|battery_saver|network_switch",
  "target": "packageName or null",
  "reason": "short explanation"
}
`.trim();

const AUTO_PROMPT = `
You are an AutonomousAgent.
Your task: step-by-step workflow execution.
Always respond in STRICT JSON format:
{
  "step": "kill|limit|battery_saver|network_switch|done",
  "target": "packageName or null",
  "reason": "short explanation",
  "next": true|false
}
`.trim();

function getEmailAgentPrompt() {
    const { dateStr, weekday, weekNum } = getLocalDateInfo();
    return `
You are an EmailAgent.
Your task: analyze email content and decide on calendar entry creation.
Today's date: ${dateStr} (${weekday}), week ${weekNum}. If the email contains relative dates (e.g. "next Tuesday", "tomorrow"), calculate from this date.
Always respond in STRICT JSON format, no other text:
If a calendar entry is needed:
{"action":"tasker_run","task":"CreateCalendarEvent","title":"event title","date":"YYYY-MM-DD","time":"HH:MM","location":"location or null"}
If no calendar entry is needed:
{"action":"none","reason":"short explanation"}
`.trim();
}

// ================================================================
// TOOLS DEFINÍCIÓ
// ================================================================
const TOOLS_DEFINITION = `
A következő eszközöket használhatod. Amikor eszközt hívsz, CSAK a JSON-t küldd, semmi más szöveget!

JSON formátum:
{"tool": "tool_neve", "input": {...}, "reason": "miért"}

Elérhető eszközök:
1. file_read - Fájl olvasása: {"path": "teljes_útvonal"}
2. file_write - Fájl írása: {"path": "...", "content": "...", "append": false}
3. shell_exec - Parancs futtatása: {"command": "...", "timeout": 10000}
4. http_request - HTTP kérés: {"url": "...", "method": "GET"}
5. file_list - Könyvtár listázása: {"path": "..."}
6. file_delete - Fájl törlése: {"path": "..."}
7. system_info - Rendszer információ: {}
8. calendar_create_event - Naptáresemény létrehozása: {"title": "...", "date": "YYYY-MM-DD", "time": "HH:MM"}
9. rollback_restore - Fájl visszaállítása: {"target_file": "..."}
10. instance_call - Masik Arcsi instance hivasa: {"target": "proxmox", "action": "agent", "prompt": "Vegrehajtas: qbittorrent_add_torrent, torrent URL: ..."} - FONTOS: action erteke MINDIG "agent" torrent/HA/qbittorrent muveleteknel!
11. sandbox_write - Kód mentése sandbox mappába: {"filename": "test.py", "content": "...", "knowledge_id": "EXP-001", "purpose": "numerikus kísérlet"} - CSAK sandbox/ mappába ír, auto meta fejléccel
12. append_to_research_trace - Labor notebook bővítése: {"knowledge_id": "EXP-001", "type": "experiment", "content": "...", "status": "working", "insight": "..."} - felhasználói jóváhagyás után
13. file_read - Fájl olvasása: {"path": "teljes_útvonal"}

Engedélyezett mappák:
- chat_logs/ (logok)
- agent_work/ (munkaterület)
- (teljes utvonalakat mindig abszolut modon add meg)
`.trim();


// ================================================================
// AGENT ENDPOINTOK
// ================================================================
app.post('/agent/notify', async (req, res) => {
  let app = req.body?.app || '', title = req.body?.title || '', text = req.body?.text || '';
  const timestamp = new Date().toLocaleString('hu-HU');
  info(`[${timestamp}] Notify agent: ${app} - ${title}`);
  try {
    const notifyLogFile = path.join(LOG_DIR, 'notify_log_' + getLocalDateStr() + '.txt');
    fs.appendFileSync(notifyLogFile, `[${timestamp}] APP: ${app} | TITLE: ${title} | TEXT: ${text}\n`, 'utf8');
  } catch (e) { debug('Notify log mentési hiba:', e.message); }

  const ruleMatch = matchNotificationRule(app, title, text);
  if (ruleMatch) {
    info(`⚡ Gyors szabály: ${app} → ${ruleMatch.action}`);
    return res.json(ruleMatch);
  }
  try {
    const content = await agentCall(NOTIFY_PROMPT, `APP: ${app}...`, getProvider);
    let result;
    try { result = JSON.parse(content); } catch {
      result = { importance: 'medium', action: 'alert', reason: 'AI válasz parsing hiba' };
    }
    res.json(result);
  } catch (e) {
    error(`❌ Notify agent hiba: ${e.message}`);
    res.json({ error: e.message });
  }
});

app.post('/push_notify', requireAuth, (req, res) => {
  const { title, message } = req.body || {};
  res.json({ status: 'ok' });
  require('node-fetch')('http://localhost:1821/arcsi_notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title || 'Arcsi', message: message || '' })
  }).catch(e => console.error('Notify hiba:', e.message));
});

app.post('/token/receive', requireAuth, (req, res) => {
  const token = req.body;
  res.json({ status: 'ok' });
  try {
    const tokenPath = path.join(__dirname, 'gmail_token.json');
    fs.writeFileSync(tokenPath, JSON.stringify(token, null, 2));
    info('Gmail token frissitve a Proxmoxtol');
  } catch(e) {
    error('Token mentes hiba:', e.message);
  }
});

// ================================================================
// GMAIL EVENT ENDPOINT - esemény alapú, nem tartalom alapú
// ================================================================
const PROCESSED_NOTIFICATIONS_FILE = path.join(__dirname, 'processed_notifications.json');

function loadProcessedNotifications() {
    try {
        if (fs.existsSync(PROCESSED_NOTIFICATIONS_FILE)) {
            return JSON.parse(fs.readFileSync(PROCESSED_NOTIFICATIONS_FILE, 'utf8'));
        }
    } catch(e) { debug('Processed notifications betöltési hiba:', e.message); }
    return [];
}

function saveProcessedNotifications(list) {
    try {
        const trimmed = list.slice(-500);
        fs.writeFileSync(PROCESSED_NOTIFICATIONS_FILE, JSON.stringify(trimmed, null, 2));
    } catch(e) { debug('Processed notifications mentési hiba:', e.message); }
}

app.post('/agent/gmail-event', requireAuth, async (req, res) => {
    const { event, notification_key } = req.body;

    if (event !== 'gmail_received') {
        return res.status(400).json({ error: 'Ismeretlen event típus' });
    }


    const processed = loadProcessedNotifications();
    if (notification_key && processed.includes(notification_key)) {
        info(`⏭️ Már feldolgozott értesítés: ${notification_key}`);
        return res.json({ skipped: true, reason: 'already_processed' });
    }

       try {
        const gmail = require('./gmailClient');
        const calendarClient = require('./calendarClient');
        const { matchEmailRule } = require('./emailRules');
        const emailDigest = require('./emailDigest');
        const { generateTraceId, appendTrace } = require('./utils/traceLogger');
        const messages = await gmail.getRecentMessages(3, 'is:unread');

        if (messages.length === 0) {
            return res.json({ processed: 0, reason: 'no_unread_messages' });
        }

        const results = [];
        for (const msg of messages) {
         if (processed.includes(msg.id)) {
                info(`⏭️ Email már feldolgozva (messageId): ${msg.id} - ${msg.subject}`);
                continue;
            }
            info(`📧 Email feldolgozása: ${msg.from} - ${msg.subject}`);

            const traceId = generateTraceId();
            appendTrace(traceId, 'email_received', { messageId: msg.id, from: msg.from, subject: msg.subject });

            const ruleMatch = matchEmailRule(msg.from, msg.subject, msg.body);
            let result;

            if (ruleMatch && ruleMatch.type !== 'force_ai') {
                info(`⚡ Gyors email szabály: ${msg.from} → ${ruleMatch.type}`);
                appendTrace(traceId, 'rule_matched', { ruleType: ruleMatch.type, reason: ruleMatch.reason });
                if (ruleMatch.type === 'ignore') {
                    result = { action: 'none', reason: ruleMatch.reason, rule_matched: true };
                } else {
                    result = { action: 'log_important', reason: ruleMatch.reason, rule_matched: true };
                }
            } else {
                if (ruleMatch && ruleMatch.type === 'force_ai') {
                    info(`🎯 Force AI szabály: ${msg.from} → időpont kulcsszó észlelve, AI elemzés naptárhoz`);
                    appendTrace(traceId, 'rule_matched', { ruleType: 'force_ai', reason: ruleMatch.reason });
                }
                const content = await agentCall(
                    getEmailAgentPrompt(),
                    `FROM: ${msg.from}\nSUBJECT: ${msg.subject}\nBODY: ${msg.body.substring(0, 1000)}`,
                    getProvider
                );
                try {
                    result = JSON.parse(content);
                } catch(e) {
                    result = { action: 'none', reason: 'parsing hiba' };
                }
                appendTrace(traceId, 'ai_decision', { action: result.action, title: result.title || null, reason: result.reason || null });
            }

// Ha naptárbejegyzés szükséges, automatikusan létrehozzuk (tool orchestration-on keresztül)
            if (result.action === 'tasker_run' && result.task === 'CreateCalendarEvent') {
                const toolResult = await executeTool('calendar_create_event', {
                    title: result.title,
                    date: result.date,
                    time: result.time,
                    location: result.location,
                    description: `Automatikusan létrehozva email alapján: ${msg.subject}`
                });
                appendTrace(traceId, 'tool_executed', { tool: 'calendar_create_event', success: toolResult.success, error: toolResult.error || null });
                if (toolResult.success) {
                    result.calendar_created = true;
                    result.calendar_link = toolResult.htmlLink;
                    info(`📅 Naptárbejegyzés létrehozva: ${result.title} | ${toolResult.htmlLink}`);
// Verify result - ellenőrizzük hogy a Calendar API valóban visszaadja-e az eseményt
                    let verified = false;
                    let verifyError = null;
                    for (let attempt = 1; attempt <= 2; attempt++) {
                        try {
                            const calendarClient = require('./calendarClient');
                            const verifiedEvent = await calendarClient.getEvent(toolResult.eventId);
                            verified = verifiedEvent && verifiedEvent.status !== 'cancelled';
                            verifyError = null;
                            if (verified) break;
                        } catch (verifyErr) {
                            verifyError = verifyErr.message;
                        }
                        if (attempt === 1) {
                            await new Promise(r => setTimeout(r, 2000));
                        }
                    }
                    appendTrace(traceId, 'verify_result', { verified, eventId: toolResult.eventId, error: verifyError, attempts: verified ? undefined : 2 });
                    if (!verified) {
                        result.verify_failed = true;
                        info(`⚠️ Verify result: 2 próbálkozás után sem sikerült igazolni az eseményt (${toolResult.eventId})${verifyError ? ' - ' + verifyError : ''}`);
                    }
                } else {
                    result.calendar_created = false;
                    result.calendar_error = toolResult.error;
                    error(`❌ Naptárbejegyzés hiba: ${toolResult.error}`);
                }
            }

// Digest mentés - mindig fontos vagy AI által releváns talált emailek
            const isImportant = result.rule_matched && result.action === 'log_important';
            const hasCalendarEvent = result.action === 'tasker_run';
            if (isImportant || hasCalendarEvent) {
                emailDigest.addDailyEntry({
                    from: msg.from,
                    subject: msg.subject,
                    summary: result.reason || result.title || '',
                    importance: hasCalendarEvent ? 'high' : 'medium'
                });
                info(`📋 Digest-be mentve: ${msg.subject}`);
                appendTrace(traceId, 'digest_saved', { subject: msg.subject, importance: hasCalendarEvent ? 'high' : 'medium' });
            }

            appendTrace(traceId, 'completed', { finalAction: result.action, calendarCreated: !!result.calendar_created });

            processed.push(msg.id);
            results.push({ messageId: msg.id, from: msg.from, subject: msg.subject, decision: result });
        }

        if (notification_key) {
            processed.push(notification_key);
        }
        saveProcessedNotifications(processed);

        res.json({ processed: results.length, results });
    } catch (e) {
        error(`❌ Gmail event hiba: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

app.post('/agent/system', async (req, res) => {
  try {
    const content = await agentCall(SYSTEM_OPT_PROMPT, JSON.stringify(req.body, null, 2));
    res.json(JSON.parse(content));
  } catch (e) { res.json({ error: e.message }); }
});

app.post('/agent/autonomous', async (req, res) => {
  try {
    const userContent = `GOAL:\n${req.body.goal}\n\nSTATE:\n${JSON.stringify(req.body.state, null, 2)}`;
    const content = await agentCall(AUTO_PROMPT, userContent);
    res.json(JSON.parse(content));
  } catch (e) { res.json({ error: e.message }); }
});

// Szabálykezelő endpointok
app.post('/agent/rules/add', (req, res) => {
  const { app, titleRegex, textRegex, importance, action, reason, appRegex } = req.body;
  if (!importance || !action) return res.status(400).json({ error: 'importance és action kötelező' });
  const rule = { app: app || null, titleRegex: titleRegex || null, textRegex: textRegex || null, importance, action, reason: reason || 'Egyéni szabály', appRegex: appRegex || false };
  addNotificationRule(rule);
  res.json({ success: true, rule, total_rules: notificationRules.length });
});

app.get('/agent/rules', (req, res) => res.json({ rules: notificationRules }));

app.delete('/agent/rules', (req, res) => {
  const { app } = req.body;
  clearNotificationRules(app);
  res.json({ success: true, total_rules: notificationRules.length });
});

app.post('/agent/rules/load', async (req, res) => {
  const rulesPath = path.join(__dirname, 'agent_work', 'new_rules.json');
  try {
    if (!fs.existsSync(rulesPath)) return res.status(404).json({ error: 'new_rules.json nem található', path: rulesPath });
    const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
    let loadedCount = 0;
    for (const rule of rules) {
      addNotificationRule({ app: rule.app, importance: rule.importance || 'medium', action: rule.action, reason: rule.reason || 'AI által generált szabály' });
      loadedCount++;
    }
    res.json({ success: true, loaded: loadedCount, total_rules: notificationRules.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ================================================================
// EMAIL DIGEST ENDPOINTOK
// ================================================================
app.get('/digest/today', requireAuth, (req, res) => {
    const emailDigest = require('./emailDigest');
    res.json({ entries: emailDigest.getTodayDigest() });
});

app.get('/digest/week', requireAuth, (req, res) => {
    const emailDigest = require('./emailDigest');
    res.json({ entries: emailDigest.getWeekEntries(7) });
});

app.get('/digest/full', requireAuth, (req, res) => {
    const emailDigest = require('./emailDigest');
    res.json(emailDigest.loadDigest());
});

// ================================================================
// TRACE STATS ENDPOINT - Reflection Engine alapja
// ================================================================
app.get('/trace/stats', requireAuth, (req, res) => {
    const { getStats } = require('./utils/traceLogger');
    res.json(getStats());
});

app.get('/trace/recent', requireAuth, (req, res) => {
    const { getRecentTraces } = require('./utils/traceLogger');
    const limit = parseInt(req.query.limit) || 20;
    res.json({ traces: getRecentTraces(limit) });
});

app.get('/trace/patterns', requireAuth, (req, res) => {
    const { getPatternStats } = require('./utils/traceLogger');
    res.json(getPatternStats());
});

app.get('/trace/daily', requireAuth, (req, res) => {
    const { getDailySummary } = require('./utils/traceLogger');
    const date = req.query.date || null;
    res.json(getDailySummary(date));
});

app.get('/trace/alerts', requireAuth, (req, res) => {
    const { getPatternAlerts } = require('./utils/traceLogger');
    res.json({ alerts: getPatternAlerts() });
});

app.get('/trace/health', requireAuth, (req, res) => {
    const { getHealthScore } = require('./utils/traceLogger');
    const date = req.query.date || null;
    res.json(getHealthScore(date));
});

app.post('/trace/record-health', requireAuth, (req, res) => {
    const { recordDailyHealth } = require('./utils/traceLogger');
    const systemChange = req.body?.system_change || null;
    const record = recordDailyHealth(systemChange);
    info(`📊 Health record mentve: ${record.date} - score ${record.health_score} (${record.status})${systemChange ? ' | change: ' + systemChange : ''}`);
    res.json(record);
});

app.get('/trace/health-history', requireAuth, (req, res) => {
    const { getHealthHistory } = require('./utils/traceLogger');
    const days = parseInt(req.query.days) || 30;
    res.json({ history: getHealthHistory(days) });
});

app.get('/trace/anomalies', requireAuth, (req, res) => {
    const { getAnomalyLog, checkAndRecordNewAnomalies } = require('./utils/traceLogger');
    const newlyRecorded = checkAndRecordNewAnomalies();
    if (newlyRecorded.length > 0) {
        info(`🔍 Új anomália rögzítve: ${newlyRecorded.map(a => a.pattern).join(', ')}`);
    }
    res.json({ anomalies: getAnomalyLog() });
});

app.post('/trace/anomalies/action', requireAuth, (req, res) => {
    const { recordAnomaly } = require('./utils/traceLogger');
    const { pattern, action_taken } = req.body;
    if (!pattern || !action_taken) {
        return res.status(400).json({ error: 'Hiányzó pattern vagy action_taken' });
    }
    const entry = recordAnomaly(pattern, null, action_taken);
    info(`📝 Anomália akció rögzítve: ${pattern} → ${action_taken}`);
    res.json(entry);
});

// ================================================================
// ROLLBACK RESTORE ENDPOINT
// ================================================================
app.post('/agent/rollback', requireAuth, async (req, res) => {
    const { target_file } = req.body;
    if (!target_file) return res.status(400).json({ ok: false, error: 'Hiányzó target_file' });

    const toolResult = await executeTool('rollback_restore', { target_file });
    info(`🔁 Rollback kérés: ${target_file} → ${toolResult.ok ? 'SIKERES (' + toolResult.restored_from + ')' : 'HIBA (' + toolResult.error + ')'}`);
    res.json(toolResult);
});

// ================================================================
// RUNTIME STATUS ENDPOINT
// ================================================================
app.get('/runtime/status', async (req, res) => {
  const status = await runtimeClient.getStatus();
  res.json(status || { error: 'Runtime daemon unavailable' });
});

// Debug
app.get('/debug/locals', (req, res) => {
  res.json({
    hasProvider: !!app.locals.provider,
    providerName: app.locals.provider?.name,
    globalProvider: !!global.provider,
    globalProviderName: global.provider?.name,
  });
});

// ================================================================
// NORMÁL CHAT ENDPOINT
// ================================================================
app.post('/chat', async (req, res) => {
  const prompt = req.body.prompt;
  const image = req.body.image;
  const imageType = req.body.imageType;
  const sessionId = req.body.sessionId || req.headers['x-session-id'] || 'default';

  if (!prompt && !image) return res.status(400).send('Üres üzenet.');

  if (!sessions.has(sessionId)) sessions.set(sessionId, []);
  let history = sessions.get(sessionId);
  const MAX_HISTORY_LEN = 100;
  if (history.length > MAX_HISTORY_LEN) {
    history = history.slice(-MAX_HISTORY_LEN);
    sessions.set(sessionId, history);
  }

  const initialProvider = getProvider();

  let userMessage;
  if (image) {
    if (initialProvider.format === 'ollama') {
      userMessage = { role: 'user', content: prompt || 'Mit látsz ezen a képen?', images: [image] };
    } else {
      userMessage = {
        role: 'user',
        content: [
          { type: 'text', text: prompt || 'Mit látsz ezen a képen?' },
          { type: 'image_url', image_url: { url: 'data:' + imageType + ';base64,' + image } },
        ],
      };
    }
  } else {
    userMessage = { role: 'user', content: prompt };
  }

  history.push(userMessage);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  let fullAiResponse;
  const keepAlive = setInterval(() => res.write(' '), 8000);

  try {
    info(`📤 ${t('chat.request', {provider: initialProvider.name, session: sessionId})} | image: ${image ? 'yes' : 'no'}`);

    // Alap rendszerprompt
    const { dateStr: todayStr, weekday: todayWeekday, weekNum: todayWeekNum } = getLocalDateInfo();
let systemPrompt = `
A neved Arcsi. Egy barátságos, segítőkész AI asszisztens vagy.
A mai dátum: ${todayStr} (${todayWeekday}), ${todayWeekNum}. naptári hét. Ezt használd referenciaként minden időbeli kérdésnél (pl. "ma", "mikor volt az utolsó munka").
Vannak eszközeid (file_read, file_write, shell_exec, http_request, file_list, file_delete, system_info),
Az alábbi tool-ok ENGEDÉLYEZVE vannak chat módban is:
- sandbox_write: {"tool": "sandbox_write", "input": {"filename": "...", "content": "...", "knowledge_id": "..."}}
- append_to_research_trace: {"tool": "append_to_research_trace", "input": {"knowledge_id": "...", "content": "..."}} - CSAK explicit jóváhagyás után!
- file_read: {"tool": "file_read", "input": {"path": "/data/data/com.termux/files/home/ai-chat-pro-v2/agent_work/work/UTVONAL/FAJLNEV"}} - sandbox/ es projects/ mappak is elérhetők
Tool hívásnál CSAK a JSON-t küldd, semmi más szöveg!
Only these tools are available. Call in JSON format: {"tool": "sandbox_write", "input": {...}}, concisely.
Soha ne használj JSON formátumot a válaszban, hacsak a felhasználó nem kifejezetten kéri.
Ha a felhasználó olyat kér, amihez tool-ok kellenének, akkor udvariasan kérd meg, hogy kapcsolja be az agent módot a gombbal.
`.trim();

    // Projekt kontextus beépítése (runtime daemon vagy fallback)
    const activeProject = await buildProjectContext();
    systemPrompt = applyProjectToPrompt(systemPrompt, activeProject);
    const projectName = activeProject?.project_name || activeProject?.name || null;
    const projectPath = projectName ? 
      `/data/data/com.termux/files/home/ai-chat-pro-v2/agent_work/work/projects/my_projects/${projectName}/` : 
      null;
    if (projectPath) {
      systemPrompt += `\nAktív projekt mappa: ${projectPath}\nEbben a mappában lévő fájlokat file_read tool-lal olvashatod.`;
    }
// Mai email digest hozzáadása a kontextushoz
    // Mai és tegnapi email digest hozzáadása a kontextushoz
    try {
        const emailDigest = require('./emailDigest');
        const todayEntries = emailDigest.getTodayDigest();

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest' }).format(yesterday);
        const yesterdayEntries = emailDigest.getDailyDigest(yesterdayKey);

        if (todayEntries.length > 0) {
            systemPrompt += `\n\n--- MAI EMAIL ÖSSZEFOGLALÓ (${todayStr}, ${todayEntries.length} fontos email) ---\n`;
            todayEntries.forEach((e, i) => {
                systemPrompt += `${i+1}. ${e.from} - "${e.subject}" (${e.importance}): ${e.summary}\n`;
            });
            systemPrompt += `---\n`;
        } else {
            systemPrompt += `\n\n--- MAI EMAIL ÖSSZEFOGLALÓ (${todayStr}) ---\nNincs mai fontos email a digest-ben.\n---\n`;
        }

        if (yesterdayEntries.length > 0) {
            systemPrompt += `\n\n--- TEGNAPI EMAIL ÖSSZEFOGLALÓ (${yesterdayKey}, ${yesterdayEntries.length} fontos email) ---\n`;
            yesterdayEntries.forEach((e, i) => {
                systemPrompt += `${i+1}. ${e.from} - "${e.subject}" (${e.importance}): ${e.summary}\n`;
            });
            systemPrompt += `---\n`;
        } else {
            systemPrompt += `\n\n--- TEGNAPI EMAIL ÖSSZEFOGLALÓ (${yesterdayKey}) ---\nNem érkezett fontos email tegnap.\n---\n`;
        }
const weekEntries = emailDigest.getWeekEntries(7);
        if (weekEntries.length > 0) {
            const byImportance = { high: 0, medium: 0, low: 0 };
            weekEntries.forEach(e => byImportance[e.importance] = (byImportance[e.importance] || 0) + 1);
            systemPrompt += `\n\n--- HETI EMAIL ÖSSZESÍTŐ (elmúlt 7 nap, összesen ${weekEntries.length} fontos email) ---\nFontosság szerint: high=${byImportance.high || 0}, medium=${byImportance.medium || 0}, low=${byImportance.low || 0}\nFeladók/tárgyak: ${weekEntries.slice(0, 15).map(e => `${e.from} - "${e.subject}"`).join('; ')}\n---\n`;
        } else {
            systemPrompt += `\n\n--- HETI EMAIL ÖSSZESÍTŐ ---\nNem érkezett fontos email az elmúlt 7 napban.\n---\n`;
        }

        const fullDigest = emailDigest.loadDigest();
        const weeklyArchiveCount = fullDigest.weekly?.length || 0;
        let monthlyTotal = weekEntries.length;
        (fullDigest.weekly || []).forEach(w => {
            (w.days || []).forEach(d => { monthlyTotal += (d.entries || []).length; });
        });
        systemPrompt += `\n\n--- HAVI EMAIL ÖSSZESÍTŐ (becslés, ${weeklyArchiveCount} archivált hét + friss adat alapján) ---\nÖsszesen kb. ${monthlyTotal} fontos email az elmúlt időszakban.\n---\n`;

        systemPrompt += `\nA fenti négy digest (mai, tegnapi, heti, havi) mindig elérhető és pontos. Ha a felhasználó email összefoglalót kér, EZT az adatot használd, ne hivatkozz agent módra, fájlokra vagy hiányzó hozzáférésre.\n`;
    } catch(e) { debug('Digest betöltési hiba a chat-ben:', e.message); }

    const messages = [
      { role: 'user', content: systemPrompt },
      { role: 'assistant', content: 'Rendben, segítek!' },
      ...history,
    ];

    const { response: apiResponse, providerUsed } = await callWithFallback(messages, initialProvider, false);
    const data = await apiResponse.json();
    

    fullAiResponse = data?.choices?.[0]?.message?.content || data?.message?.content || data?.response || '';
// Chat tool detektálás
const cleanedResponse = fullAiResponse.replace(/^AI:\s*/m, '');
const toolJsonStart = cleanedResponse.indexOf('{"tool"');
let toolMatch = null;
if (toolJsonStart !== -1) {
  try {
    const candidate = cleanedResponse.slice(toolJsonStart);
    let depth = 0, end = 0;
    for (let i = 0; i < candidate.length; i++) {
      if (candidate[i] === '{') depth++;
      else if (candidate[i] === '}') { depth--; if (depth === 0) { end = i+1; break; } }
    }
    if (end > 0) toolMatch = [candidate.slice(0, end)];
  } catch(e) {}
}
if (toolMatch) {
  try {
    const toolCall = JSON.parse(toolMatch[0]);
    info(`[TOOL DEBUG] tool: ${toolCall.tool} | content length: ${(toolCall.input?.content || '').length}`);
    const toolFn = toolRegistry.get(toolCall.tool);
    if (toolFn) {
      const result = await toolFn(toolCall.input || {});
      fullAiResponse = `✅ Tool végrehajtva: ${toolCall.tool}\n${JSON.stringify(result, null, 2)}`;
    }
  } catch(e) {
    fullAiResponse = `⚠️ Tool hiba: ${e.message}`;
  }
}

res.write(fullAiResponse);

    if (image) {
      history[history.length - 1] = { role: 'user', content: '[kép + szöveg: ' + prompt + ']' };
    }

    history.push({ role: 'assistant', content: fullAiResponse });
    logToFile(sessionId, prompt, fullAiResponse, providerUsed.name);

    // Runtime event log – válasz
    await runtimeClient.logEvent('chat_response', {
      sessionId,
      responseLength: fullAiResponse.length,
      provider: providerUsed.name,
    });

    info(`✅ Válasz kész (${fullAiResponse.length} karakter) - végső provider: ${providerUsed.name}`);
  } catch (e) {
    console.error('❌ CHAT HIBA:', e.message);
    res.write('\n\n[HIBA: ' + e.message + ']');
  } finally {
    clearInterval(keepAlive);
    res.end();
  }
});

// ================================================================
// AGENT SESSION RESET - Új feladat kezdéséhez
// ================================================================
app.post('/agent/reset', (req, res) => {
    const sessionId = req.body.sessionId || 'agent_default';
    const deleted = agentSessions.has(sessionId);
    agentSessions.delete(sessionId);
    deleteSession(sessionId);
    info(`🔄 Agent session törölve: ${sessionId}`);
    res.json({ success: true, deleted, sessionId });
});

app.post('/agent/progress', async (req, res) => {
    const { summary, next_steps = [] } = req.body;
    if (!summary) return res.status(400).json({ error: 'Hiányzó summary' });
    const ok = await runtimeClient.logProgress(summary, next_steps);
    info(`💾 Kontextus mentve: ${summary.substring(0, 80)}`);
    res.json({ ok });
});

// ================================================================
// RUNTIME CONTEXT PATCH ENDPOINT
// ================================================================
app.post('/runtime/context/patch', async (req, res) => {
    const { patch, reason = 'manual_patch' } = req.body;
    if (!patch) return res.status(400).json({ error: 'Hiányzó patch' });
    const ok = await runtimeClient.patchContext(patch, reason);
    info(`🔧 Context patch: ${reason} | ${JSON.stringify(patch).substring(0, 80)}`);
    res.json({ ok });
});

// ================================================================
// AGENT CHAT ENDPOINT
// ================================================================
app.post('/agent/chat', async (req, res) => {
  const { prompt, sessionId, maxSteps } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Hiányzó prompt' });

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const provider = getProvider();
  const steps = maxSteps || 20;
  const sessionKey = sessionId || 'agent_default';
  const existingSession = agentSessions.get(sessionKey) || loadSession(sessionKey);

  info(`🤖 Agent: ${prompt.substring(0, 80)}... (max ${steps} lépés) session: ${sessionKey} ${existingSession ? '(folytatás)' : '(új)'}`);

  try {
    // Projekt kontextus az agent system promptba
    const activeProject = await buildProjectContext();
    const { dateStr: agentDateStr, weekday: agentWeekday, weekNum: agentWeekNum } = getLocalDateInfo();
    let agentSystemPrompt = SYSTEM_PROMPT.replace('{{DATUM_KONTEXTUS}}', `A mai dátum: ${agentDateStr} (${agentWeekday}), ${agentWeekNum}. naptári hét.`);
    agentSystemPrompt = applyProjectToPrompt(agentSystemPrompt, activeProject);
    
    const { getHealthScore: getHS } = require('./utils/traceLogger');
    const hd = getHS();
    agentSystemPrompt = agentSystemPrompt.replace('{{HEALTH_KONTEXTUS}}', 
  `Rendszer health: ${hd.health_score}/100 (${hd.status}). Levonások: reliability=${hd.components?.reliability ?? 100}, credentials=${hd.components?.credentials_component ?? 100}.`);
  
const { getCalendarContext } = require('./utils/calendarContext');
    const calendarText = await getCalendarContext();
    agentSystemPrompt = agentSystemPrompt.replace('{{CALENDAR_KONTEXTUS}}', calendarText);

    // Runtime event log
    await runtimeClient.logEvent('agent_request', {
      sessionKey,
      promptLength: prompt.length,
      maxSteps: steps,
      isResume: !!existingSession,
    });

    const result = await agentLoop(
      prompt, sessionKey, provider, steps, existingSession,
      agentSessions, agentSystemPrompt, TOOLS_DEFINITION, LOG_DIR
    );

    await runtimeClient.logEvent('agent_response', {
      sessionKey,
      resultLength: result?.length || 0,
    });

    // Session mentése fájlba
    const currentSession = agentSessions.get(sessionKey);
    if (currentSession) saveSession(sessionKey, currentSession);

    res.send(result);
  } catch (e) {
    console.error('❌ Agent hiba:', e.message);
    res.status(500).send(`Hiba: ${e.message}`);
  }
});

// ================================================================
// LOKÁLIS AGENT ENDPOINT
// ================================================================
app.post('/agent/local', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Hiányzó prompt' });

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  info(`🤖 Lokális agent: ${prompt.substring(0, 80)}...`);
  try {
    const sessionRes = await fetch('http://localhost:8081/v1/agent/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        yolo: true,
        tools: [
          { type: 'function', function: { name: 'file_read', description: 'Fájl olvasása', parameters: { path: { type: 'string' } } } },
          { type: 'function', function: { name: 'file_write', description: 'Fájl írása', parameters: { path: { type: 'string' }, content: { type: 'string' } } } },
          { type: 'function', function: { name: 'shell_exec', description: 'Shell parancs futtatása', parameters: { command: { type: 'string' } } } },
        ],
      }),
    });
    if (!sessionRes.ok) throw new Error(`Session létrehozás sikertelen: ${sessionRes.status}`);
    const { session_id } = await sessionRes.json();
    info(`📌 Session ID: ${session_id}`);

    const chatRes = await fetch(`http://localhost:8081/v1/agent/session/${session_id}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: prompt }),
    });
    if (!chatRes.ok) throw new Error(`Chat hiba: ${chatRes.status}`);

    const reader = chatRes.body;
    reader.on('data', chunk => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) res.write(data.content);
            if (data.tool_call) info(`🔧 Tool hívás: ${data.tool_call.name}`);
            if (data.error) console.error(`❌ Agent hiba: ${data.error}`);
          } catch (e) { debug('JSON parse hiba stream-ben:', e.message); }
        }
      }
    });
    reader.on('end', () => res.end());
    reader.on('error', err => { console.error('Stream hiba:', err); res.write(`\n\n[HIBA: ${err.message}]`); res.end(); });
  } catch (e) {
    console.error('❌ Lokális agent hiba:', e.message);
    res.write(`[HIBA: ${e.message}]`);
    res.end();
  }
});

// ================================================================
// ERROR HANDLER
// ================================================================
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    const rawContent = req.rawBody || 'Nem elérhető';
    error(`⚠️ Érvénytelen JSON érkezett: ${err.message}`);
    try {
      const errorLog = path.join(LOG_DIR, 'error_json_' + getLocalDateStr() + '.log');
      fs.appendFileSync(errorLog, `[${new Date().toLocaleString()}] HIBA: ${err.message}\nBODY: ${rawContent}\n${'='.repeat(50)}\n`, 'utf8');
    } catch (e) { debug('Error log mentési hiba:', e.message); }
    return res.status(400).json({ error: 'Érvénytelen JSON formátum', details: err.message });
  }
  next();
});

// ================================================================
// SERVER START
// ================================================================
chooseProvider().then(provider => {
  app.locals.provider = provider;
  global.provider = provider;
  app.listen(PORT, '0.0.0.0', () => {
    info('\n🚀 ' + t('server.server_started'));
    info(`🔗 ${t('server.server_address', {port: PORT})}`);
    info(`🤖 Provider: ${provider.name}`);
    info(`📁 ${t('server.server_logs', {path: LOG_FILE})}`);
    info(`📋 ${t('server.server_rules', {count: notificationRules.length})}`);
    info(`🔄 ${t('server.server_fallback', {order: FALLBACK_ORDER.join(' → ')})}`);
    info(`⚙️ ${t('server.server_max_steps')}`);
    info(`🔧 ${t('server.server_tools', {tools: Array.from(toolRegistry.keys()).join(', ')})}`);
    info('');
// Email digest automatikus archiválás induláskor (7 napnál régebbi bejegyzések)
    try {
        const emailDigest = require('./emailDigest');
        const archivedCount = emailDigest.archiveOldDailyEntries(7);
        if (archivedCount > 0) {
            info(`📦 Email digest archiválva: ${archivedCount} nap heti archívumba mozgatva`);
        }
    } catch(e) {
        debug('Digest archiválási hiba indításkor:', e.message);
    }

    // Health history automatikus rögzítés induláskor (a tegnapi/aktuális napra, ha még nincs)
    try {
        const { recordDailyHealth } = require('./utils/traceLogger');
        const healthRecord = recordDailyHealth('server_restart');
        info(`📊 ${t('server.health_recorded', {date: healthRecord.date, score: healthRecord.health_score, status: healthRecord.status})}`);
    } catch(e) {
        debug(t('server.health_record_error'), e.message);
    }

    // System monitor indítása (csak ha MONITORING_ENABLED=true)
    const { startMonitoring } = require('./utils/systemMonitor');
    startMonitoring();
  });
});
