// calendarClient.js - Google Calendar API kliens wrapper
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'gmail_token.json');

let calendarInstance = null;

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

    oAuth2Client.on('tokens', (newTokens) => {
        const merged = { ...token, ...newTokens };
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
    });

    return oAuth2Client;
}

function getCalendar() {
    if (!calendarInstance) {
        const auth = getAuthClient();
        calendarInstance = google.calendar({ version: 'v3', auth });
    }
    return calendarInstance;
}

/**
 * Naptárak listázása
 */
async function listCalendars() {
    const calendar = getCalendar();
    const res = await calendar.calendarList.list();
    return res.data.items || [];
}

/**
 * Esemény létrehozása
 * @param {Object} params - { title, date, time, durationMinutes, location, description }
 * @param {string} calendarId - alapértelmezett 'primary'
 */
async function createEvent(params, calendarId = 'primary') {
    const calendar = getCalendar();
    const { title, date, time, durationMinutes = 60, location, description } = params;

    if (!date || date === 'unknown') {
        throw new Error('Hiányzó vagy ismeretlen dátum - esemény nem hozható létre');
    }

    const timeZone = 'Europe/Budapest';
    const startTimeStr = time && time !== 'unknown' ? time : '09:00';
    const startDateTime = `${date}T${startTimeStr}:00`;

    const startDate = new Date(startDateTime);
    const endDate = new Date(startDate.getTime() + durationMinutes * 60000);

    const event = {
        summary: title || 'Új esemény',
        location: location && location !== 'null' ? location : undefined,
        description: description || undefined,
        start: {
            dateTime: startDate.toISOString(),
            timeZone
        },
        end: {
            dateTime: endDate.toISOString(),
            timeZone
        }
    };

    const res = await calendar.events.insert({
        calendarId,
        requestBody: event
    });

    return res.data;
}

/**
 * Közelgő események listázása
 */
async function listUpcomingEvents(maxResults = 10, calendarId = 'primary') {
    const calendar = getCalendar();
    const res = await calendar.events.list({
        calendarId,
        timeMin: new Date().toISOString(),
        maxResults,
        singleEvents: true,
        orderBy: 'startTime'
    });
    return res.data.items || [];
}

/**
 * Esemény törlése
 */
 
async function getEvent(eventId, calendarId = 'primary') {
    const calendar = getCalendar();
    const res = await calendar.events.get({ calendarId, eventId });
    return res.data;
}
async function deleteEvent(eventId, calendarId = 'primary') {
    const calendar = getCalendar();
    await calendar.events.delete({ calendarId, eventId });
    return true;
}

module.exports = {
    listCalendars,
    createEvent,
    listUpcomingEvents,
    getEvent,
    deleteEvent
};
