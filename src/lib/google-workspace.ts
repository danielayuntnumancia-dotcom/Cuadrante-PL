declare global {
  var google: any;
}

import config from '../../firebase-applet-config.json';

const CLIENT_ID = config.oAuthClientId;
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/calendar';

let accessToken = '';

export function getAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (accessToken) {
      resolve(accessToken);
      return;
    }

    try {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (response: any) => {
          if (response.error !== undefined) {
            reject(response);
          }
          accessToken = response.access_token;
          resolve(accessToken);
        },
      });
      client.requestAccessToken();
    } catch (err) {
      reject(err);
    }
  });
}

export async function exportToGoogleSheets(data: any[][], title: string) {
  const token = await getAccessToken();
  
  // 1. Create Spreadsheet
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: { title: title }
    })
  });
  const sheet = await createRes.json();
  const spreadsheetId = sheet.spreadsheetId;

  // 2. Update values
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range: 'A1',
      majorDimension: 'ROWS',
      values: data
    })
  });

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

export async function syncToGoogleCalendar(events: {summary: string, start: string, end: string, description?: string}[]) {
  const token = await getAccessToken();
  
  // Create a new calendar for the shift
  const createCalRes = await fetch('https://www.googleapis.com/calendar/v3/calendars', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      summary: 'Cuadrante Policía Local',
      timeZone: 'Europe/Madrid'
    })
  });
  
  const calendar = await createCalRes.json();
  const calendarId = calendar.id;

  // Add events
  for (const ev of events) {
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        summary: ev.summary,
        description: ev.description || '',
        start: { date: ev.start.split('T')[0] }, // All day event approach for shifts if just using YYYY-MM-DD
        end: { date: ev.end.split('T')[0] }
      })
    });
  }

  return `https://calendar.google.com/calendar/u/0/r`;
}
