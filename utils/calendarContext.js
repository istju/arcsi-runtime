const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const TOKEN_PATH = path.join(__dirname, '..', 'gmail_token.json');
const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials.json');

async function getCalendarContext() {
  try {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    const key = credentials.installed || credentials.web;
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));

    const oAuth2Client = new google.auth.OAuth2(
      key.client_id, key.client_secret, 'urn:ietf:wg:oauth:2.0:oob'
    );
    oAuth2Client.setCredentials(token);

    const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
    
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 2);

    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: tomorrow.toISOString(),
      maxResults: 5,
      singleEvents: true,
      orderBy: 'startTime'
    });

    const events = res.data.items || [];
    if (events.length === 0) return 'Naptár: nincs közelgő esemény.';

    const lines = events.map(e => {
      const start = e.start.dateTime || e.start.date;
      const time = new Date(start).toLocaleString('hu-HU', { 
        timeZone: 'Europe/Budapest',
        month: 'numeric', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
      return '📅 ' + time + ' - ' + e.summary;
    });

    return 'Közelgő események:\n' + lines.join('\n');
  } catch(e) {
    return 'Naptár: nem elérhető (' + e.message + ')';
  }
}

module.exports = { getCalendarContext };
