// The meetings as an iCalendar feed, for the "add to calendar" and "subscribe"
// buttons. Built by the server from the same rows the app shows, so a
// subscribed calendar follows the panel's edits on its own.
//
// Times are written in Luanda's local time with its zone attached, not in UTC.
// A recurrence rule is expanded in the zone of its start: written in UTC, a
// meeting at 00:30 on Monday in Luanda would start at 23:30 on Sunday, and
// every following week the calendar would put it on the wrong day.
import { DEFAULT_DURATION_MINUTES, nextOccurrence, zonedDateTimeParts } from './meetings.js';
import { safeUrl } from './html.js';

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// RFC 5545 §3.3.11: backslash, semicolon, comma and newline are escaped in text.
export function escapeIcsText(value = '') {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/[;,]/g, (char) => `\\${char}`);
}

// RFC 5545 caps a content line at 75 octets; continuations start with a space.
// Measured in UTF-8 bytes so accented characters are never split mid-sequence.
export function foldIcsLine(line) {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > (parts.length ? 74 : 75)) { parts.push(current); current = ''; bytes = 0; }
    current += char;
    bytes += size;
  }
  if (current) parts.push(current);
  return parts.join('\r\n ');
}

const pad = (value) => String(value).padStart(2, '0');
const utcStamp = (date) => `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;

function localStamp(date, timeZone) {
  const p = zonedDateTimeParts(date, timeZone);
  return `${p.year}${pad(p.month)}${pad(p.day)}T${pad(p.hour)}${pad(p.minute)}00`;
}

// The zone's offset as +HHMM. Enough for a zone without daylight saving, which
// is the only kind this feed is used with (Africa/Luanda).
function offsetOf(timeZone, date) {
  const p = zonedDateTimeParts(date, timeZone);
  const minutes = Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(date.getTime() / 60000) * 60000) / 60000);
  const sign = minutes < 0 ? '-' : '+';
  const absolute = Math.abs(minutes);
  return `${sign}${pad(Math.floor(absolute / 60))}${pad(absolute % 60)}`;
}

function recurrenceRule(meeting) {
  const weekdays = (meeting.weekdays || []).map(Number).filter((day) => WEEKDAY_CODES[day]);
  switch (meeting.recurrence) {
    case 'weekly': return weekdays.length ? `RRULE:FREQ=WEEKLY;BYDAY=${weekdays.map((day) => WEEKDAY_CODES[day]).join(',')}` : '';
    case 'monthly_last': return weekdays.length ? `RRULE:FREQ=MONTHLY;BYDAY=-1${WEEKDAY_CODES[weekdays[0]]}` : '';
    case 'yearly': return 'RRULE:FREQ=YEARLY';
    default: return '';
  }
}

export function buildCalendar(meetings, { timeZone = 'Africa/Luanda', now = new Date(), name = 'Reuniões ELIAS — ISTN-SJ' } = {}) {
  const offset = offsetOf(timeZone, now);
  const events = (meetings || [])
    .filter((meeting) => meeting.active !== false)
    .map((meeting) => ({ meeting, occurrence: nextOccurrence(meeting, timeZone, now) }))
    // A meeting with no fixed start cannot be placed in a calendar.
    .filter(({ occurrence }) => occurrence)
    .map(({ meeting, occurrence }, index) => {
      const start = occurrence.start;
      const end = new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60000);
      const rule = recurrenceRule(meeting);
      const zoom = safeUrl(meeting.zoom_url);
      const details = [
        `Hora de Luanda: ${String(meeting.start_time).slice(0, 5)}.`,
        meeting.zoom_meeting_id ? `ID da reunião: ${meeting.zoom_meeting_id}` : '',
        meeting.zoom_passcode ? `Senha: ${meeting.zoom_passcode}` : '',
        zoom
      ].filter(Boolean).join('\n');
      return [
        'BEGIN:VEVENT',
        `UID:reuniao-${meeting.id || index}@elias-istn-sj`,
        `DTSTAMP:${utcStamp(now)}`,
        `DTSTART;TZID=${timeZone}:${localStamp(start, timeZone)}`,
        `DTEND;TZID=${timeZone}:${localStamp(end, timeZone)}`,
        ...(rule ? [rule] : []),
        `SUMMARY:${escapeIcsText(meeting.title)}`,
        `DESCRIPTION:${escapeIcsText(details)}`,
        ...(zoom ? ['LOCATION:Zoom', `URL:${zoom}`] : []),
        'BEGIN:VALARM',
        'TRIGGER:-PT15M',
        'ACTION:DISPLAY',
        'DESCRIPTION:A reunião começa em 15 minutos',
        'END:VALARM',
        'END:VEVENT'
      ];
    });

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ISTN-SJ//ELIAS//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(name)}`,
    `X-WR-TIMEZONE:${timeZone}`,
    // How often a subscribed calendar should ask again.
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
    'BEGIN:VTIMEZONE',
    `TZID:${timeZone}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    `TZOFFSETFROM:${offset}`,
    `TZOFFSETTO:${offset}`,
    'END:STANDARD',
    'END:VTIMEZONE',
    ...events.flat(),
    'END:VCALENDAR'
  ];
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}
