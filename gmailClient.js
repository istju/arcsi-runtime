// gmailClient.js - Gmail API kliens wrapper
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'gmail_token.json');

let gmailInstance = null;

function getAuthClient() {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const key = credentials.installed || credentials.web;

    const oAuth2Client = new google.auth.OAuth2(
        key.client_id,
        key.client_secret,
        key.redirect_uris ? key.redirect_uris[0] : 'http://localhost'
    );

    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oAuth2Client.setCredentials(token);

    // Automatikus token mentés ha frissül (refresh token alapján)
    oAuth2Client.on('tokens', (newTokens) => {
        const merged = { ...token, ...newTokens };
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
    });

    return oAuth2Client;
}

function getGmail() {
    if (!gmailInstance) {
        const auth = getAuthClient();
        gmailInstance = google.gmail({ version: 'v1', auth });
    }
    return gmailInstance;
}

/**
 * Profil lekérése (teszt / saját email cím)
 */
async function getProfile() {
    const gmail = getGmail();
    const res = await gmail.users.getProfile({ userId: 'me' });
    return res.data;
}

/**
 * Legutóbbi üzenetek listázása (csak ID és snippet)
 */
async function listMessages(maxResults = 10, query = '') {
    const gmail = getGmail();
    const res = await gmail.users.messages.list({
        userId: 'me',
        maxResults,
        q: query
    });
    return res.data.messages || [];
}

/**
 * Egy email teljes tartalmának lekérése és egyszerűsített feldolgozása
 */
async function getMessage(messageId) {
    const gmail = getGmail();
    const res = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
    });

    const msg = res.data;
    const headers = msg.payload?.headers || [];
    const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

    // Body kinyerése (text/plain részből, base64 dekódolva)
    function extractBody(payload) {
        if (payload.body?.data) {
            return Buffer.from(payload.body.data, 'base64').toString('utf8');
        }
        if (payload.parts) {
            for (const part of payload.parts) {
                if (part.mimeType === 'text/plain' && part.body?.data) {
                    return Buffer.from(part.body.data, 'base64').toString('utf8');
                }
            }
            // Fallback: HTML rész, ha nincs plain text
            for (const part of payload.parts) {
                if (part.mimeType === 'text/html' && part.body?.data) {
                    return Buffer.from(part.body.data, 'base64').toString('utf8');
                }
            }
        }
        return msg.snippet || '';
    }

    return {
        id: msg.id,
        threadId: msg.threadId,
        from: getHeader('From'),
        to: getHeader('To'),
        subject: getHeader('Subject'),
        date: getHeader('Date'),
        snippet: msg.snippet,
        body: extractBody(msg.payload).substring(0, 5000),
        labelIds: msg.labelIds || []
    };
}

/**
 * Legutóbbi N email teljes tartalommal (lista + body egyben)
 */
async function getRecentMessages(maxResults = 5, query = '') {
    const list = await listMessages(maxResults, query);
    const messages = [];
    for (const item of list) {
        try {
            const full = await getMessage(item.id);
            messages.push(full);
        } catch (e) {
            console.error(`Gmail üzenet lekérési hiba (${item.id}):`, e.message);
        }
    }
    return messages;
}

/**
 * Email küldése
 */
async function sendMessage(to, subject, body) {
    const gmail = getGmail();
    const messageParts = [
        `To: ${to}`,
        'Content-Type: text/plain; charset=utf-8',
        `Subject: ${subject}`,
        '',
        body
    ];
    const message = messageParts.join('\n');
    const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    const res = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: encodedMessage }
    });
    return res.data;
}

/**
 * Üzenet jelölése olvasottnak (label eltávolítás)
 */
async function markAsRead(messageId) {
    const gmail = getGmail();
    await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: { removeLabelIds: ['UNREAD'] }
    });
}

module.exports = {
    getProfile,
    listMessages,
    getMessage,
    getRecentMessages,
    sendMessage,
    markAsRead
};
