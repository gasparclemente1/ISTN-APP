// When each meeting next happens. Every calculation is done in the ministry's
// timezone and then converted to an instant, so a viewer abroad sees the right
// local time without the weekday ever drifting.

export const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const DEFAULT_DURATION_MINUTES = 120;

// A live stays on screen as "a decorrer" until six in the morning in Luanda.
// The lives start in the evening and often run past midnight: at 23:00 someone
// opening the app must see the live they can still join, not tomorrow's. Only
// at 06:00 does the app move on to the next one.
export const LIVE_ENDS_AT_HOUR = 6;

function zoneOffset(instant, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)) - instant;
}

// Wall-clock time in `timeZone` -> UTC instant. Two passes so DST transitions resolve correctly.
export function zonedToInstant({ year, month, day, hour, minute }, timeZone) {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const approximate = wall - zoneOffset(wall, timeZone);
  return new Date(wall - zoneOffset(approximate, timeZone));
}

export function zonedDateParts(date, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date).map((part) => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

// The wall clock in `timeZone` at `date`, down to the minute.
export function zonedDateTimeParts(date, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(date).map((part) => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour) % 24, minute: Number(parts.minute) };
}

const atUtc = (year, month, day) => new Date(Date.UTC(year, month - 1, day));

// The last given weekday of a month, e.g. the last Saturday of March.
function lastWeekdayOfMonth(year, month, weekday) {
  const end = new Date(Date.UTC(year, month, 0));
  const shift = (end.getUTCDay() - weekday + 7) % 7;
  end.setUTCDate(end.getUTCDate() - shift);
  return end;
}

function parseTime(value) {
  if (!value) return null;
  const [hour, minute] = String(value).split(':').map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute) ? { hour, minute } : null;
}

// Candidate dates, soonest first, ignoring the time of day. Yesterday is among
// them: until six in the morning, last night's live is still the one on.
function candidateDates(meeting, today) {
  const { year, month, day } = today;
  switch (meeting.recurrence) {
    case 'weekly': {
      const weekdays = (meeting.weekdays || []).map(Number);
      return Array.from({ length: 9 }, (_, index) => {
        const date = atUtc(year, month, day);
        date.setUTCDate(date.getUTCDate() + index - 1);
        return date;
      }).filter((date) => weekdays.includes(date.getUTCDay()));
    }
    case 'monthly_last': {
      const weekday = Number((meeting.weekdays || [])[0]);
      if (!Number.isFinite(weekday)) return [];
      return [-1, 0, 1, 2].map((ahead) => {
        const target = new Date(Date.UTC(year, month - 1 + ahead, 1));
        return lastWeekdayOfMonth(target.getUTCFullYear(), target.getUTCMonth() + 1, weekday);
      });
    }
    case 'yearly': {
      if (!meeting.event_date) return [];
      const [, eventMonth, eventDay] = meeting.event_date.split('-').map(Number);
      return [-1, 0, 1].map((ahead) => atUtc(year + ahead, eventMonth, eventDay));
    }
    case 'once': {
      if (!meeting.event_date) return [];
      const [onceYear, onceMonth, onceDay] = meeting.event_date.split('-').map(Number);
      return [atUtc(onceYear, onceMonth, onceDay)];
    }
    default:
      return [];
  }
}

// Until when a live that began at `start` counts as going on: the next six in
// the morning in `timeZone`, and never less than the usual length of a meeting
// (a vigil at four still gets its two hours).
export function liveUntil(start, timeZone) {
  const wall = zonedDateTimeParts(start, timeZone);
  const sameDay = wall.hour < LIVE_ENDS_AT_HOUR;
  const date = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + (sameDay ? 0 : 1)));
  const morning = zonedToInstant({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: LIVE_ENDS_AT_HOUR, minute: 0 }, timeZone);
  return new Date(Math.max(morning.getTime(), start.getTime() + DEFAULT_DURATION_MINUTES * 60000));
}

// A meeting with no start_time cannot be placed on a clock, only described.
export function nextOccurrence(meeting, timeZone, now = new Date()) {
  const time = parseTime(meeting.start_time);
  if (!time) return null;
  const today = zonedDateParts(now, timeZone);
  for (const date of candidateDates(meeting, today)) {
    const start = zonedToInstant({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: time.hour, minute: time.minute }, timeZone);
    const until = liveUntil(start, timeZone);
    if (now < until) {
      return { meeting, start, until, isLive: now >= start };
    }
  }
  return null;
}

// Every meeting that can be placed on a clock, soonest first.
export function upcomingMeetings(meetings, timeZone, now = new Date()) {
  return (meetings || [])
    .filter((meeting) => meeting.active !== false)
    .map((meeting) => nextOccurrence(meeting, timeZone, now))
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
}

// Meetings with no fixed start that fall on today's date, such as the general
// live on Tuesdays, which begins after the ministers' live. They cannot be
// counted down to, but on their day the app should still say they happen.
export function untimedMeetingsOn(meetings, timeZone, now = new Date()) {
  const today = zonedDateParts(now, timeZone);
  const key = Date.UTC(today.year, today.month - 1, today.day);
  return (meetings || [])
    .filter((meeting) => meeting.active !== false && !parseTime(meeting.start_time) && meeting.time_note)
    .filter((meeting) => candidateDates(meeting, today).some((date) => date.getTime() === key));
}

// The live going on — the one that began last, if two overlap — or else the
// next to begin.
export function nextMeeting(meetings, timeZone, now = new Date()) {
  const upcoming = upcomingMeetings(meetings, timeZone, now);
  const live = upcoming.filter((occurrence) => occurrence.isLive).sort((a, b) => b.start - a.start)[0];
  return live || upcoming[0] || null;
}

// How a meeting's recurrence reads to a person.
export function recurrenceLabel(meeting) {
  const weekdays = (meeting.weekdays || []).map(Number);
  switch (meeting.recurrence) {
    case 'weekly':
      return weekdays.length === 7 ? 'Todos os dias'
        : weekdays.map((weekday) => WEEKDAY_LABELS[weekday]).join(', ');
    case 'monthly_last':
      return `Último ${WEEKDAY_LABELS[weekdays[0]]?.toLowerCase() || 'dia'} de cada mês`;
    case 'yearly': {
      const [, month, day] = (meeting.event_date || '--').split('-').map(Number);
      return `Todos os anos a ${day} de ${['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][month - 1] || ''}`;
    }
    case 'once': {
      const [year, month, day] = (meeting.event_date || '---').split('-').map(Number);
      return `Apenas a ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
    }
    default:
      return '';
  }
}
