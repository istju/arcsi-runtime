// utils/providerUtils.js
const fetch = require('node-fetch');
const readline = require('readline');
const { PROVIDERS, FALLBACK_ORDER } = require('../config/providers');
const SETTINGS = require('../config/settings');
const { info, debug } = require('./logger');

function chooseProvider() {
    return new Promise((resolve) => {
        const defaultKey = process.env.DEFAULT_PROVIDER_NUM || SETTINGS.DEFAULT_PROVIDER_NUM || '4';
        const provider = PROVIDERS[defaultKey] || PROVIDERS['4'];
         // Ha nincs interaktív terminal (Tasker, boot, nohup), azonnal indul
        if (!process.stdin.isTTY) {
            console.log(`Nem interaktív mód - provider: ${provider.name}`);
            resolve(provider);
            return;
        }
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

        console.log('\n╔════════════════════════════════════╗');
        console.log('║       AI Chat Pro – Provider       ║');
        console.log('╠════════════════════════════════════╣');
        Object.entries(PROVIDERS).forEach(([key, p]) => {
            const available = (p.api_key && p.api_key !== 'local') ? '✅' : (p.api_key === 'local' ? '🏠' : '❌');
            console.log(`║  ${key})  ${available}  ${p.name.padEnd(28)}║`);
        });
        console.log('╚════════════════════════════════════╝');
        console.log(`\nAlapértelmezett: ${defaultKey} (${provider.name})`);
        console.log('3 másodperc múlva automatikusan indul...');

        let secondsLeft = 3;
        const countdown = setInterval(() => {
            secondsLeft--;
            if (secondsLeft > 0) process.stdout.write(`\r⏳ ${secondsLeft} másodperc...`);
        }, 1000);

        const autoStart = setTimeout(() => {
            clearInterval(countdown);
            rl.close();
            process.stdout.write('\r✅ Automatikus indítás: ' + provider.name + '\n');
            resolve(provider);
        }, 3000);

        rl.question(`\nVálassz providert [${defaultKey}]: `, (answer) => {
            clearTimeout(autoStart);
            clearInterval(countdown);
            rl.close();
            const choice = answer.trim() || defaultKey;
            const selected = PROVIDERS[choice];
            if (!selected) {
                info('Érvénytelen választás, alapértelmezett: ' + defaultKey);
                resolve(provider);
            } else {
                if (!selected.api_key) info('⚠️  Figyelem: nincs API kulcs!');
                if (selected.api_key === 'local') info(`🏠 Lokális modell: ${selected.name}`);
                resolve(selected);
            }
        });
    });
}

async function callWithFallback(messages, initialProvider, stream = false) {
    let lastError = null;
    let providersToTry = [initialProvider];

    for (let key of FALLBACK_ORDER) {
        const candidate = PROVIDERS[key];
        if (candidate && candidate.api_key && candidate.name !== initialProvider.name) {
            if (!providersToTry.find(p => p.name === candidate.name)) {
                providersToTry.push(candidate);
            }
        }
    }

    for (let provider of providersToTry) {
        try {
            info(`🔄 Próbálkozás: ${provider.name}`);
            const timeout = (provider.api_key === 'local') ? 600000 : 180000;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort();
                debug(`⏱️ ${provider.name} timeout (${timeout/1000}s)`);
            }, timeout);

            // Lokális modellnél thinking kikapcsolása (Racka, Qwen3 alapú modellek)
            const body = {
                model: provider.model,
                messages: messages,
                stream: false,
                ...(provider.api_key === 'local' && {
                    chat_template_kwargs: { enable_thinking: false },
                    max_tokens: 512
                })
            };

            let response;
            try {
                response = await fetch(provider.api_url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + provider.api_key
                    },
                    body: JSON.stringify(body),
                    signal: controller.signal
                });
            } finally {
                clearTimeout(timeoutId);
            }

            if (!response.ok) {
                const errText = await response.text();
                debug(`⚠️ ${provider.name} hiba ${response.status}: ${errText.substring(0, 200)}`);
                lastError = new Error(`${provider.name} hiba: ${response.status}`);
                logFallbackTrace(provider.name, response.status === 429 ? '429_rate_limit' : `http_${response.status}`);
                continue;
            }

            const text = await response.text();
            info(`✅ Sikeres válasz: ${provider.name}`);

            if (text.trim().startsWith('data: ')) {
                const lines = text.split('\n');
                let fullContent = '';
                for (const line of lines) {
                    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                        try {
                            const json = JSON.parse(line.slice(6));
                            fullContent += json?.choices?.[0]?.delta?.content ||
                                          json?.choices?.[0]?.message?.content || '';
                        } catch(e) {}
                    }
                }
                const normalData = {
                    choices: [{ message: { content: fullContent, role: 'assistant' } }]
                };
                return {
                    response: { ok: true, json: async () => normalData },
                    providerUsed: provider
                };
            }

            try {
                const data = JSON.parse(text);
                return {
                    response: { ok: true, json: async () => data },
                    providerUsed: provider
                };
            } catch(e) {
                logFallbackTrace(provider.name, 'invalid_json');
                throw new Error(`Invalid JSON: ${text.substring(0, 100)}`);
            }

        } catch (error) {
            if (error.name === 'AbortError') {
                debug(`⏱️ ${provider.name} timeout`);
                logFallbackTrace(provider.name, 'timeout');
            } else {
                debug(`❌ ${provider.name} nem elérhető: ${error.message}`);
                if (!error.message.startsWith('Invalid JSON')) {
                    logFallbackTrace(provider.name, 'other_error');
                }
            }
            lastError = error;
        }
    }

    throw new Error(`Minden provider sikertelen. Utolsó hiba: ${lastError?.message || 'Ismeretlen'}`);
}

function logFallbackTrace(providerName, reason) {
    try {
        const { appendTrace, generateTraceId } = require('./traceLogger');
        appendTrace(generateTraceId(), 'provider_fallback', { provider: providerName, reason });
    } catch (e) {
        // trace opcionális, sosem blokkolja a fallback logikát
    }
}


function getProvider() {
    if (global.provider) return global.provider;
    return null;
}

module.exports = { chooseProvider, callWithFallback, getProvider, PROVIDERS, FALLBACK_ORDER };
