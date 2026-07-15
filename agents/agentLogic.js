// Agent logic modul
const { toolRegistry } = require('../tools/toolRegistry');
const SETTINGS = require('../config/settings');
const { info, error, debug } = require('../utils/logger');
const { callWithFallback } = require('../utils/providerUtils');
const fs = require('fs');
const path = require('path');
const { RuntimeClient } = require('../runtimeClient');
const runtimeClient = new RuntimeClient();

// JSON EXTRACTOR
function extractJSON(text) {
    if (!text || typeof text !== 'string') return null;
    try {
        const parsed = JSON.parse(text);
        if (parsed.tool || parsed.done !== undefined) return parsed;
    } catch(e) {}
    let depth = 0, start = -1, inString = false, escape = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (!inString) {
            if (ch === '{') { if (depth === 0) start = i; depth++; }
            else if (ch === '}') { depth--; if (depth === 0 && start !== -1) {
                const candidate = text.substring(start, i+1);
                try { const parsed = JSON.parse(candidate);
                    if (parsed.tool || parsed.done !== undefined) return parsed;
                } catch(e) {}
                start = -1;
            }}
        }
    }
    return null;
}

// EXECUTE TOOL
async function executeTool(toolName, toolInput) {
    console.log(`🔧 Tool: ${toolName} | Input: ${JSON.stringify(toolInput).substring(0, 100)}`);
    const handler = toolRegistry.get(toolName);
    if (!handler) return { error: `Ismeretlen tool: ${toolName}`, success: false };
    const startTime = Date.now();

    const TOOL_TIMEOUT_MS = SETTINGS.TOOL_TIMEOUT_MS || 30000;

    try {
        const result = await Promise.race([
            handler(toolInput),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Tool timeout (${TOOL_TIMEOUT_MS / 1000}s) - ${toolName} túl sokáig futott`)), TOOL_TIMEOUT_MS)
            )
        ]);
        const elapsed = Date.now() - startTime;
        if (result.content && typeof result.content === 'string' && result.content.length > SETTINGS.MAX_OUTPUT_SIZE) {
            result.content = result.content.substring(0, SETTINGS.MAX_OUTPUT_SIZE) +
                `\n\n[FIGYELMEZTETÉS: csonkolva.]`;
            result.truncated = true;
        }
        return { ...result, elapsed_ms: elapsed, tool: toolName, success: !result.error };
    } catch (e) {
        return { error: e.message, elapsed_ms: Date.now() - startTime, tool: toolName, success: false };
    }
}

// AGENT CALL (segédfüggvény a notify/email agentekhez)
async function agentCall(systemPrompt, userContent, getProvider) {
    info(`🤖 Agent call: ${userContent.substring(0, 80)}...`);
    const initialProvider = getProvider();
    if (!initialProvider) { error('❌ Nincs provider!'); return '{}'; }
    const messages = [{ role: 'user', content: systemPrompt + '\n\n' + userContent }];
    try {
        const { response, providerUsed } = await callWithFallback(messages, initialProvider, false);
        const data = await response.json();
        let content = data?.choices?.[0]?.message?.content ||
                      data?.message?.content ||
                      data?.response || '{}';
        content = content.replace(/```(?:json)?/gi, '').trim();
        info(`🤖 Agent válasz (${providerUsed.name}): ${content.substring(0, 100)}`);
        return content;
    } catch (err) {
        error(`❌ agentCall hiba: ${err.message}`);
        return '{}';
    }
}

// AGENT LOOP (kiegészítve projekt kontextussal)
async function agentLoop(userMessage, sessionId, provider, maxSteps = 20, existingSession = null, agentSessions, SYSTEM_PROMPT, TOOLS_DEFINITION, LOG_DIR, projectContext = null) {
    let history = [], stepLog = [], stepCount = 0;
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        info(`🆔 Agent run ID: ${runId}`);
        
// Friss email digest mindig lefrissítve, akár új akár folytatott session
    let digestReminder = '';
    try {
        const emailDigest = require('../emailDigest');
        const todayEntries = emailDigest.getTodayDigest();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest' }).format(yesterday);
        const yesterdayEntries = emailDigest.getDailyDigest(yesterdayKey);

        digestReminder = `[Friss adat: ma ${todayEntries.length} fontos email, tegnap (${yesterdayKey}) ${yesterdayEntries.length} fontos email a digest-ben. `;
        if (todayEntries.length > 0) digestReminder += `Mai: ${todayEntries.map(e => `${e.from} - ${e.subject}`).join('; ')}. `;
        if (yesterdayEntries.length > 0) digestReminder += `Tegnapi: ${yesterdayEntries.map(e => `${e.from} - ${e.subject}`).join('; ')}. `;
        digestReminder += `Ha email összefoglalót kérnek, EZT használd, ne keress fájlt!]`;
    } catch(e) { console.error('Digest reminder hiba:', e.message); }

    if (existingSession?.history?.length > 0) {
        history = existingSession.history;
        stepLog = existingSession.stepLog || [];
        stepCount = existingSession.stepCount || 0;
        info(`📌 Folytatás (${history.length} üzenet, ${stepLog.length} lépés)`);
    } else {
        // Dinamikus rendszerprompt a projekt kontextusból
        let basePrompt = SYSTEM_PROMPT;
        if (projectContext) {
            if (projectContext.system_prompt) {
                basePrompt += `\n\n--- PROJEKT KONTEXTUS ---\n${projectContext.system_prompt}\n---\n`;
            }
            if (projectContext.rules && projectContext.rules.length > 0) {
                basePrompt += `\n\nProjekt szabályok:\n${projectContext.rules.map((rule, i) => `${i+1}. ${rule}`).join('\n')}`;
            }
            if (projectContext.description) {
                basePrompt += `\n\nAktuális projekt leírása: ${projectContext.description}`;
            }
        }
// Mai email digest hozzáadása a kontextushoz (agent módban is)
        try {
            const emailDigest = require('../emailDigest');
            const todayEntries = emailDigest.getTodayDigest();

            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest' }).format(yesterday);
            const yesterdayEntries = emailDigest.getDailyDigest(yesterdayKey);

            if (todayEntries.length > 0) {
                basePrompt += `\n\n--- MAI EMAIL ÖSSZEFOGLALÓ (${todayEntries.length} fontos email) ---\n`;
                todayEntries.forEach((e, i) => {
                    basePrompt += `${i+1}. ${e.from} - "${e.subject}" (${e.importance}): ${e.summary}\n`;
                });
                basePrompt += `---\n`;
            } else {
                basePrompt += `\n\n--- MAI EMAIL ÖSSZEFOGLALÓ ---\nNincs mai fontos email a digest-ben.\n---\n`;
            }

            if (yesterdayEntries.length > 0) {
                basePrompt += `\n\n--- TEGNAPI EMAIL ÖSSZEFOGLALÓ (${yesterdayKey}, ${yesterdayEntries.length} fontos email) ---\n`;
                yesterdayEntries.forEach((e, i) => {
                    basePrompt += `${i+1}. ${e.from} - "${e.subject}" (${e.importance}): ${e.summary}\n`;
                });
                basePrompt += `---\n`;
            } else {
                basePrompt += `\n\n--- TEGNAPI EMAIL ÖSSZEFOGLALÓ (${yesterdayKey}) ---\nNem érkezett fontos email tegnap.\n---\n`;
            }

            basePrompt += `\nHa a felhasználó email összefoglalót kér (mai vagy tegnapi), EZT az adatot használd. NE keress fájlokat tool-okkal email digest témában, és NE olvass be ismeretlen, projekt gyökérben lévő fájlokat (pl. het_elemzese.txt, folyamatos_naplo.txt) - ezek nem relevánsak az email digest-hez.\n`;
        } catch(e) { console.error('Digest betöltési hiba agent módban:', e.message); }
        const systemWithTools = `${basePrompt}\n\n${TOOLS_DEFINITION}\n\n
**FONTOS:** Tool híváshoz CSAK JSON-t küldj:
{"tool": "shell_exec", "input": {"command": "ls -la"}, "reason": "listázás"}
Ha kész: {"done": true, "summary": "mit csináltál"}`;
        history.push({ role: 'user', content: systemWithTools });
        history.push({ role: 'assistant', content: 'Rendben, az eszközöket használom!' });
        history.push({ role: 'user', content: userMessage + '\n\n' + digestReminder });
    }

    let finalResponse = '', emptyCount = 0, currentStep = stepCount;

    while (currentStep < maxSteps) {
        currentStep++;
        info(`\n🔷 [${runId}] Agent lépés: ${currentStep}/${maxSteps}`);

        const { response, providerUsed } = await callWithFallback(history, provider, false);
        const data = await response.json();
        let aiText = data?.choices?.[0]?.message?.content ||
                     data?.message?.content || data?.response || '';
        aiText = aiText.trim();
        info(`📝 AI válasz (${aiText.length} chars): ${aiText.substring(0, 500)}`);

        if (!aiText) {
            emptyCount++;
            if (emptyCount >= 2) {
                const lastResult = stepLog[stepLog.length - 1];
                finalResponse = lastResult
                    ? `Feladat elvégezve.\nUtolsó: ${lastResult.tool}\nEredmény: ${JSON.stringify(lastResult.result?.stdout || lastResult.result)}`
                    : 'Feladat elvégezve.';
                break;
            }
            history.push({ role: 'user', content: `Írj összefoglalót: {"done": true, "summary": "..."}` });
            continue;
        }
        emptyCount = 0;

        const parsed = extractJSON(aiText);
        if (parsed?.tool) {
            info(`🔧 TOOL: ${parsed.tool} - ${parsed.reason || ''}`);
            const toolResult = await executeTool(parsed.tool, parsed.input || {});
            info(`📤 Eredmény: ${JSON.stringify(toolResult).substring(0, 150)}`);
            stepLog.push({ step: currentStep, tool: parsed.tool, result: toolResult });
            history.push({ role: 'assistant', content: aiText });
            history.push({
                role: 'user',
                content: toolResult.error
                    ? `❌ HIBA: ${toolResult.error}\n\nPróbálj mást!`
                    : `✅ Tool: ${toolResult.tool} | ${toolResult.elapsed_ms}ms\n${JSON.stringify(toolResult)}\n\nFolytasd! Ha kész: {"done": true, "summary": "..."}`
            });
        } else if (parsed?.done === true) {
            finalResponse = parsed.summary || 'Feladat kész';
            info(`✅ Agent kész ${currentStep} lépés után (${providerUsed.name})`);
            break;
        } else {
            if (stepLog.length > 0) { finalResponse = aiText; break; }
            history.push({ role: 'assistant', content: aiText });
            history.push({ role: 'user', content: `⚠️ Használj tool-t vagy: {"done": true, "summary": "..."}` });
        }
    }

    if (currentStep >= maxSteps && !finalResponse) {
        const lastResult = stepLog[stepLog.length - 1];
        finalResponse = lastResult
            ? `⚠️ Max lépés.\n${lastResult.tool}: ${JSON.stringify(lastResult.result?.stdout || lastResult.result)}`
            : `⚠️ Nem fejeződött be ${maxSteps} lépés alatt.`;
    }

    if (sessionId && agentSessions) {
        agentSessions.set(sessionId, { history, stepLog, stepCount: currentStep, lastRunId: runId });
    }

    try {
        fs.writeFileSync(
            path.join(LOG_DIR, `agent_${Date.now()}.json`),
            JSON.stringify(stepLog, null, 2)
        );
    } catch(e) { debug('Agent log hiba:', e.message); }
    
    // Elvégzett munka automatikus rögzítése a context.json-ba
// Agent state verziózás - tömör döntés-napló (miért, nem csak mit)
    try {
        const decisionsFile = path.join(LOG_DIR, 'agent_decisions.json');
        let decisions = [];
        if (fs.existsSync(decisionsFile)) {
            decisions = JSON.parse(fs.readFileSync(decisionsFile, 'utf8'));
        }
        decisions.push({
            runId,
            timestamp: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }).format(new Date()).replace(', ', 'T'),
            userMessage: userMessage.substring(0, 200),
            decisions: stepLog.map(s => ({
                step: s.step,
                tool: s.tool,
                success: s.result?.success !== false,
                error: s.result?.error || null
            })),
            finalResponse: finalResponse ? finalResponse.substring(0, 300) : null,
            stepCount: currentStep
        });
        // Max 200 döntés-bejegyzés megtartása
        decisions = decisions.slice(-200);
        fs.writeFileSync(decisionsFile, JSON.stringify(decisions, null, 2));
    } catch(e) { debug('Agent decisions log hiba:', e.message); }
    if (stepLog.length > 0 && finalResponse) {
     runtimeClient.logProgress(
        finalResponse.substring(0, 500),
        []
     ).catch(e => debug('logProgress hiba:', e.message));
}

    return finalResponse;
}

module.exports = { extractJSON, executeTool, agentCall, agentLoop };