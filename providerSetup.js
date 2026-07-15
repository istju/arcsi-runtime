#!/usr/bin/env node
// providerSetup.js - Interaktív Provider Setup Wizard
//
// 1) Új provider hozzáadása sablonból
// 2) Meglévő provider API kulcsának frissítése
// 3) Provider törlése

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const WORK_DIR = __dirname;
const ENV_PATH = path.join(WORK_DIR, '.env');
const PROVIDERS_PATH = path.join(WORK_DIR, 'config', 'providers.js');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
    return new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));
}

function askEnvVarName(question) {
    return ask(question).then((answer) => {
        let cleaned = answer.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
        if (!/^[A-Z_]/.test(cleaned)) {
            cleaned = 'KEY_' + cleaned;
        }
        if (cleaned !== answer.toUpperCase()) {
            console.log(`   ℹ️ Érvényesített env-változó név: ${cleaned}`);
        }
        return cleaned;
    });
}

const TEMPLATES = {
    '1': {
        label: 'OpenAI-kompatibilis Cloud API (pl. DeepSeek, OpenAI, Mistral)',
        build: async () => {
            const name = await ask('Megjelenítendő név (pl. "OpenAI GPT-4o"): ');
            const apiUrl = await ask('API URL (pl. https://api.openai.com/v1/chat/completions): ');
            const model = await ask('Modell név (pl. gpt-4o): ');
            const envVarName = await askEnvVarName('Env változó neve az API kulcshoz (pl. OPENAI_API_KEY): ');
            const apiKey = await ask(`API kulcs (${envVarName} értéke): `);
            return {
                name, api_url: apiUrl, model, format: 'openai', stream: false,
                envVarName, apiKey,
                api_key_expr: `process.env.${envVarName} || ''`
            };
        }
    },
    '2': {
        label: 'Ollama Cloud',
        build: async () => {
            const name = await ask('Megjelenítendő név (pl. "Ollama Cloud (Llama 4)"): ');
            const model = await ask('Modell név (pl. llama4:latest): ');
            const apiKey = await ask('OLLAMA_API_KEY értéke: ');
            return {
                name, api_url: 'https://api.ollama.com/api/chat', model, format: 'ollama', stream: true,
                envVarName: 'OLLAMA_API_KEY', apiKey,
                api_key_expr: `process.env.OLLAMA_API_KEY || ''`
            };
        }
    },
    '3': {
        label: 'Google Gemini',
        build: async () => {
            const name = await ask('Megjelenítendő név (pl. "Gemini 2.5 Pro"): ');
            const model = await ask('Modell név (pl. gemini-2.5-pro): ');
            const apiKey = await ask('GEMINI_API_KEY értéke: ');
            return {
                name, api_url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
                model, format: 'openai', stream: false,
                envVarName: 'GEMINI_API_KEY', apiKey,
                api_key_expr: `process.env.GEMINI_API_KEY || ''`
            };
        }
    },
    '4': {
        label: 'Anthropic Claude',
        build: async () => {
            const name = await ask('Megjelenítendő név (pl. "Claude Sonnet 4.6"): ');
            const model = await ask('Modell név (pl. claude-sonnet-4-6): ');
            const apiKey = await ask('ANTHROPIC_API_KEY értéke: ');
            return {
                name, api_url: 'https://api.anthropic.com/v1/messages',
                model, format: 'anthropic', stream: false,
                envVarName: 'ANTHROPIC_API_KEY', apiKey,
                api_key_expr: `process.env.ANTHROPIC_API_KEY || ''`
            };
        }
    },
    '5': {
        label: 'Teljesen custom (minden mező kézzel)',
        build: async () => {
            const name = await ask('Megjelenítendő név: ');
            const apiUrl = await ask('API URL: ');
            const model = await ask('Modell név: ');
            const format = (await ask('Formátum (openai / ollama / anthropic) [openai]: ')) || 'openai';
            const stream = (await ask('Streaming (igen/nem) [nem]: ')).toLowerCase().startsWith('i');
            const envVarName = await askEnvVarName('Env változó neve az API kulcshoz: ');
            const apiKey = await ask(`API kulcs (${envVarName} értéke): `);
            return {
                name, api_url: apiUrl, model, format, stream,
                envVarName, apiKey,
                api_key_expr: `process.env.${envVarName} || ''`
            };
        }
    }
};

function loadCurrentProviders() {
    const content = fs.readFileSync(PROVIDERS_PATH, 'utf8');
    return content;
}

function appendToEnv(envVarName, apiKey) {
    let envContent = '';
    if (fs.existsSync(ENV_PATH)) {
        envContent = fs.readFileSync(ENV_PATH, 'utf8');
    }
    const lines = envContent.split('\n');
    const existingIndex = lines.findIndex(l => l.startsWith(`${envVarName}=`));
    if (existingIndex >= 0) {
        lines[existingIndex] = `${envVarName}=${apiKey}`;
    } else {
        lines.push(`${envVarName}=${apiKey}`);
    }
    fs.writeFileSync(ENV_PATH, lines.join('\n'));
}

function removeFromEnv(envVarName) {
    if (!fs.existsSync(ENV_PATH)) return;
    const envContent = fs.readFileSync(ENV_PATH, 'utf8');
    const lines = envContent.split('\n').filter(l => !l.startsWith(`${envVarName}=`));
    fs.writeFileSync(ENV_PATH, lines.join('\n'));
}

function addProviderToFile(providerConfig, newKey) {
    let content = fs.readFileSync(PROVIDERS_PATH, 'utf8');

    const newEntry = `    '${newKey}': {
        name: '${providerConfig.name.replace(/'/g, "\\'")}',
        api_url: '${providerConfig.api_url}',
        api_key: ${providerConfig.api_key_expr},
        model: '${providerConfig.model}',
        format: '${providerConfig.format}',
        stream: ${providerConfig.stream}
    },\n`;

    const marker = '};\n\nconst FALLBACK_ORDER';
    const markerIndex = content.indexOf(marker);

    if (markerIndex === -1) {
        console.error('NEM TALALHATO a beillesztesi pont a providers.js-ben - manualis szerkesztes szukseges.');
        return false;
    }

    let beforeMarker = content.substring(0, markerIndex);
    const trimmedEnd = beforeMarker.replace(/\s+$/, '');
    if (!trimmedEnd.endsWith(',')) {
        beforeMarker = trimmedEnd + ',\n';
    }

    content = beforeMarker + newEntry + content.substring(markerIndex);

    fs.writeFileSync(PROVIDERS_PATH, content);
    return true;
}

function removeProviderFromFile(providerKey) {
    let content = fs.readFileSync(PROVIDERS_PATH, 'utf8');
    const blockRegex = new RegExp(`\\s*'${providerKey}':\\s*\\{[\\s\\S]*?\\n\\s*\\},?\\n`);
    const match = content.match(blockRegex);
    if (!match) {
        return false;
    }
    content = content.replace(blockRegex, '\n');
    fs.writeFileSync(PROVIDERS_PATH, content);
    return true;
}

function validateProvidersFile() {
    try {
        delete require.cache[require.resolve('./config/providers')];
        const { PROVIDERS } = require('./config/providers');
        const count = Object.keys(PROVIDERS).length;
        const withKey = Object.values(PROVIDERS).filter(p => p.api_key && p.api_key !== 'local').length;
        return { valid: true, providerCount: count, validKeyCount: withKey };
    } catch (e) {
        return { valid: false, error: e.message };
    }
}

function getNextAvailableKey(content) {
    const matches = [...content.matchAll(/'(\d+)':\s*\{/g)];
    const numbers = matches.map(m => parseInt(m[1], 10));
    const max = numbers.length > 0 ? Math.max(...numbers) : 0;
    return String(max + 1);
}

function listExistingProviders() {
    delete require.cache[require.resolve('./config/providers')];
    const { PROVIDERS } = require('./config/providers');
    return PROVIDERS;
}

function findEnvVarForProvider(providerObj) {
    const content = fs.readFileSync(PROVIDERS_PATH, 'utf8');
    const nameEscaped = providerObj.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const blockMatch = content.match(new RegExp(`name:\\s*'${nameEscaped}'[\\s\\S]*?api_key:\\s*process\\.env\\.([A-Z0-9_]+)`));
    return blockMatch ? blockMatch[1] : null;
}

async function updateExistingProviderKey() {
    const providers = listExistingProviders();
    console.log('\nMeglevo providerek:\n');
    for (const [key, p] of Object.entries(providers)) {
        const hasKey = p.api_key && p.api_key !== 'local';
        console.log(`  ${key}) ${p.name} ${hasKey ? 'OK' : (p.api_key === 'local' ? '(lokalis, nincs API kulcs)' : 'HIANYZIK')}`);
    }
    console.log('  0) Vissza\n');

    const choice = await ask('Melyik provider API kulcsat frissitened?: ');
    if (choice === '0' || !providers[choice]) {
        console.log('Vissza a fomenube.');
        return;
    }

    const provider = providers[choice];
    if (provider.api_key === 'local') {
        console.log('Ez egy lokalis modell, nincs API kulcsa amit frissiteni lehetne.');
        return;
    }

    const envVarName = findEnvVarForProvider(provider);
    if (!envVarName) {
        console.log('Nem talaltam az env valtozo nevet ehhez a providerhez - manualis szerkesztes szukseges.');
        return;
    }

    const newKey = await ask(`Uj API kulcs (${envVarName} erteke): `);
    appendToEnv(envVarName, newKey);
    console.log(`\nOK: ${provider.name} API kulcsa frissitve (${envVarName})!`);
    const validation = validateProvidersFile();
       if (validation.valid) {
        console.log(`Ellenorzes: OK - ${validation.providerCount} provider, ${validation.validKeyCount} ervenyes API kulccsal.`);
       } else {
        console.log(`FIGYELEM: a providers.js szintaktikai hibat tartalmazhat: ${validation.error}`);
    }
    console.log('Inditsd ujra a szervert: restart');
}

async function deleteExistingProvider() {
    const providers = listExistingProviders();
    console.log('\nMeglevo providerek:\n');
    for (const [key, p] of Object.entries(providers)) {
        console.log(`  ${key}) ${p.name}`);
    }
    console.log('  0) Vissza\n');

    const choice = await ask('Melyik providert toroljuk?: ');
    if (choice === '0' || !providers[choice]) {
        console.log('Vissza a fomenube.');
        return;
    }

    const provider = providers[choice];
    const confirm = await ask(`Biztosan torlod a "${provider.name}" providert? (igen/nem): `);
    if (!confirm.toLowerCase().startsWith('i')) {
        console.log('Megszakitva.');
        return;
    }

    const envVarName = provider.api_key !== 'local' ? findEnvVarForProvider(provider) : null;

    const removed = removeProviderFromFile(choice);
    if (!removed) {
        console.log('Nem sikerult megtalalni/torolni a provider bejegyzest a providers.js-ben.');
        return;
    }

    if (envVarName) {
        removeFromEnv(envVarName);
        console.log(`\nOK: "${provider.name}" torolve (providers.js + .env: ${envVarName})!`);
    } else {
        console.log(`\nOK: "${provider.name}" torolve (providers.js)!`);
    }
    const validation = validateProvidersFile();
      if (validation.valid) {
        console.log(`Ellenorzes: OK - ${validation.providerCount} provider, ${validation.validKeyCount} ervenyes API kulccsal.`);
      } else {
        console.log(`FIGYELEM: a providers.js szintaktikai hibat tartalmazhat: ${validation.error}`);
    }
    console.log('Inditsd ujra a szervert: restart');
}

async function main() {
    console.log('==================================================');
    console.log('Provider Setup Wizard');
    console.log('==================================================\n');

    console.log('1) Uj provider hozzaadasa');
    console.log('2) Meglevo provider API kulcsanak frissitese');
    console.log('3) Provider torlese');
    console.log('0) Kilepes\n');

    const mainChoice = await ask('Valasztas: ');

    if (mainChoice === '0') {
        console.log('Kilepes.');
        rl.close();
        return;
    }

    if (mainChoice === '2') {
        await updateExistingProviderKey();
        rl.close();
        return;
    }

    if (mainChoice === '3') {
        await deleteExistingProvider();
        rl.close();
        return;
    }

    if (mainChoice !== '1') {
        console.log('Ervenytelen valasztas.');
        rl.close();
        return;
    }

    console.log('\nValassz egy sablont az uj provider hozzaadasahoz:\n');
    for (const [key, tpl] of Object.entries(TEMPLATES)) {
        console.log(`  ${key}) ${tpl.label}`);
    }
    console.log('  0) Kilepes\n');

    const choice = await ask('Valasztas: ');
    if (choice === '0' || !TEMPLATES[choice]) {
        console.log('Kilepes.');
        rl.close();
        return;
    }

    console.log('');
    const providerConfig = await TEMPLATES[choice].build();

    const currentContent = loadCurrentProviders();
    const newKey = getNextAvailableKey(currentContent);

    console.log(`\nOsszefoglalo:`);
    console.log(`   Kulcs: ${newKey}`);
    console.log(`   Nev: ${providerConfig.name}`);
    console.log(`   Modell: ${providerConfig.model}`);
    console.log(`   Formatum: ${providerConfig.format}`);
    console.log(`   Env valtozo: ${providerConfig.envVarName}\n`);

    const confirm = await ask('Mentes? (igen/nem): ');
    if (!confirm.toLowerCase().startsWith('i')) {
        console.log('Megszakitva.');
        rl.close();
        return;
    }

    appendToEnv(providerConfig.envVarName, providerConfig.apiKey);
    const success = addProviderToFile(providerConfig, newKey);

    if (success) {
        console.log(`\nOK: Provider hozzaadva (kulcs: ${newKey})!`);
        console.log(`OK: API kulcs elmentve a .env-be (${providerConfig.envVarName})`);
    const validation = validateProvidersFile();
      if (validation.valid) {
        console.log(`Ellenorzes: OK - ${validation.providerCount} provider, ${validation.validKeyCount} ervenyes API kulccsal.`);
      } else {
        console.log(`FIGYELEM: a providers.js szintaktikai hibat tartalmazhat: ${validation.error}`);
    }
        console.log('\nInditsd ujra a szervert: restart');
    } else {
        console.log('\nHIBA tortent a providers.js frissitese kozben.');
    }

    rl.close();
}

main().catch(err => {
    console.error('Hiba:', err.message);
    rl.close();
});
