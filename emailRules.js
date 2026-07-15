// emailRules.js - Gmail gyorsszabály kezelő modul
const fs = require('fs');
const path = require('path');

const EMAIL_RULES_FILE = path.join(__dirname, 'email_rules.json');

let emailRules = [];
try {
    if (fs.existsSync(EMAIL_RULES_FILE)) {
        emailRules = JSON.parse(fs.readFileSync(EMAIL_RULES_FILE, 'utf8'));
    }
} catch(e) {
    console.error('Email szabály betöltési hiba:', e.message);
}

function saveEmailRules() {
    try {
        fs.writeFileSync(EMAIL_RULES_FILE, JSON.stringify(emailRules, null, 2), 'utf8');
    } catch(e) {
        console.error('Email szabály mentési hiba:', e.message);
    }
}

function addEmailRule(rule) {
    emailRules.push(rule);
    saveEmailRules();
}

function clearEmailRules(fromPattern = null) {
    if (fromPattern) {
        emailRules = emailRules.filter(r => r.from !== fromPattern);
    } else {
        emailRules = [];
    }
    saveEmailRules();
}

function matchEmailRule(from, subject, body) {
    for (const rule of emailRules) {
        // Kulcsszó-alapú szabály: tárgy VAGY body alapján, feladótól függetlenül
        if (rule.keywordRegex) {
            let keywordMatch = false;
            try {
                const re = new RegExp(rule.keywordRegex, 'i');
                keywordMatch = re.test(subject || '') || re.test(body || '');
            } catch(e) { keywordMatch = false; }

            if (keywordMatch) {
                return { type: rule.type, reason: rule.reason || 'Kulcsszó alapján' };
            }
            continue;
        }

        // Feladó-alapú szabály (eredeti logika)
        let fromMatch = false;
        if (!rule.from) fromMatch = true;
        else if (rule.fromRegex) {
            try { fromMatch = new RegExp(rule.from, 'i').test(from || ''); } catch(e) { fromMatch = false; }
        } else {
            fromMatch = (from || '').toLowerCase().includes(rule.from.toLowerCase());
        }

        if (!fromMatch) continue;

        let subjectMatch = true;
        if (rule.subjectRegex) {
            try { subjectMatch = new RegExp(rule.subjectRegex, 'i').test(subject || ''); } catch(e) { subjectMatch = false; }
        }

        if (fromMatch && subjectMatch) {
            return { type: rule.type, reason: rule.reason || 'Email szabály alapján' };
        }
    }
    return null;
}

module.exports = { addEmailRule, clearEmailRules, matchEmailRule, getRules: () => emailRules };
