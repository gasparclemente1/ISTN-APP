// "Ao vivo": the next meeting, how to join it, and the week ahead.
import { APP_CONFIG } from '../data.js';
import { escapeHtml, externalLinkAttrs, safeUrl } from '../html.js';
import { icon } from '../icons.js';
import { WEEKDAY_LABELS, nextMeeting, nextOccurrence, recurrenceLabel, untimedMeetingsOn, zonedDateParts } from '../meetings.js';
import { countdownLabel, errorState, externalHint, formatInZone, loadingState, page, relativeDayLabel, sectionHeading, showBothZones, TIME_ZONE, userZone } from './shared.js';
import { videoRow } from './videos.js';

const shortTime = (value) => String(value || '').slice(0, 5);

export function liveStatus(next, now = new Date()) {
  return next.isLive ? 'A reunião já começou.' : countdownLabel(next.start, now);
}

// Said wherever the next meeting is shown, so a Tuesday never looks empty:
// the general live that day has no fixed time, only "after the ministers'".
function untimedNote(meetings, now) {
  const today = untimedMeetingsOn(meetings, TIME_ZONE, now);
  if (!today.length) return '';
  return `<p class="live-also">${icon('info', { size: 16 })}<span>Hoje também: ${today.map((meeting) => `<strong>${escapeHtml(meeting.title)}</strong> — ${escapeHtml(meeting.time_note)}`).join('; ')}.</span></p>`;
}

export function calendarActions({ compact = false } = {}) {
  const feed = '/calendario.ics';
  const subscribe = `webcal://${window.location.host}${feed}`;
  if (compact) {
    return `<a class="text-button" href="${feed}" download="reunioes-elias-istn-sj.ics">${icon('bell', { size: 18 })}Lembrar-me</a>`;
  }
  return `<div class="calendar-actions">
    <a class="button button-outline full-width" href="${escapeHtml(subscribe)}" data-external>${icon('calendar', { size: 18 })}Subscrever no calendário</a>
    <p class="hint">A subscrição atualiza-se sozinha quando a equipa muda um horário. Se o telemóvel não a abrir, <a href="${feed}" download="reunioes-elias-istn-sj.ics">descarregue o ficheiro</a>.</p>
  </div>`;
}

export function liveCard(state, now = new Date()) {
  const kicker = (label) => `<div class="live-kicker"><span class="live-dot" aria-hidden="true"></span>${label}</div>`;
  if (state.meetingsError) {
    return `<section class="live-card" aria-labelledby="live-card-title">${kicker('<span id="live-card-title">Próxima reunião</span>')}<p class="live-note">${escapeHtml(scheduleError(state))}</p>${state.meetingsError === 'indisponivel' ? '' : `<button class="button button-light" type="button" data-action="retry-meetings">${icon('refresh', { size: 18 })}Tentar de novo</button>`}</section>`;
  }
  if (!state.meetings) return `<section class="live-card">${kicker('Próxima reunião')}<p class="live-note">A carregar a programação…</p></section>`;
  const next = nextMeeting(state.meetings, TIME_ZONE, now);
  if (!next) return `<section class="live-card">${kicker('Próxima reunião')}<p class="live-note">Não há reuniões com hora marcada.</p>${untimedNote(state.meetings, now)}</section>`;
  return `<section class="live-card ${next.isLive ? 'is-live' : ''}" aria-labelledby="live-card-title">
    ${kicker(next.isLive ? 'A decorrer agora' : 'Próxima reunião')}
    <h2 id="live-card-title">${escapeHtml(next.meeting.title)}</h2>
    <p class="live-time"><strong>${formatInZone(next.start)}</strong><span>${relativeDayLabel(next.start, now)} · hora de Luanda${showBothZones() ? `<br>${formatInZone(next.start, userZone)} no seu fuso horário` : ''}</span></p>
    <p class="live-countdown" data-countdown="${next.start.toISOString()}" data-live="${next.isLive}">${escapeHtml(liveStatus(next, now))}</p>
    ${untimedNote(state.meetings, now)}
    <div class="live-actions">
      <a class="button button-light" href="/ao-vivo">${next.isLive ? 'Entrar na reunião' : 'Ver reunião'}${icon('arrowRight', { size: 18 })}</a>
      ${calendarActions({ compact: true })}
    </div>
  </section>`;
}

function credential(label, spoken, value) {
  if (!value) return '';
  return `<div class="credential"><dt>${label}</dt><dd><span>${escapeHtml(value)}</span><button class="icon-button small" type="button" data-action="copy" data-value="${escapeHtml(value)}" data-label="${label}" data-focus-key="copy:${label}" aria-label="Copiar ${spoken}">${icon('copy', { size: 18 })}</button></dd></div>`;
}

// Unconfigured is not the reader's connection failing; say which it is.
const scheduleError = (state) => (state.meetingsError === 'indisponivel'
  ? 'A programação ainda não está disponível nesta instalação.'
  : 'Não foi possível carregar a programação. Verifique a ligação à internet.');

function joinPanel(next) {
  const room = next?.meeting;
  const zoom = safeUrl(room?.zoom_url);
  return `<section class="join-panel" aria-labelledby="join-title">
    <h2 id="join-title">Entrar na reunião</h2>
    ${room ? `<p>${escapeHtml(room.title)}</p>` : '<p>Não há reunião marcada.</p>'}
    ${zoom
      ? `<a class="button button-gold full-width" ${externalLinkAttrs(zoom)}>${icon('external', { size: 18 })}Entrar no Zoom${externalHint}</a>
         <dl class="credentials">${credential('ID da reunião', 'o ID da reunião', room.zoom_meeting_id)}${credential('Senha', 'a senha', room.zoom_passcode)}</dl>`
      : room ? `<p class="notice">${icon('info', { size: 18 })}<span>A equipa ainda não publicou a sala do Zoom desta reunião. Volte a consultar mais perto da hora.</span></p>` : ''}
    ${calendarActions()}
    <a class="text-button" ${externalLinkAttrs(APP_CONFIG.sources[0].url)}>${icon('external', { size: 16 })}Transmissões no YouTube${externalHint}</a>
  </section>`;
}

// The week starting today, each day with the meetings it holds.
function weekSchedule(meetings, now) {
  const weekly = meetings.filter((meeting) => meeting.recurrence === 'weekly');
  if (!weekly.length) return '';
  const today = zonedDateParts(now, TIME_ZONE);
  const todayWeekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
  const days = Array.from({ length: 7 }, (_, offset) => (todayWeekday + offset) % 7);
  const rows = days.map((weekday, offset) => {
    const onDay = weekly
      .filter((meeting) => (meeting.weekdays || []).map(Number).includes(weekday))
      .sort((a, b) => (a.start_time ? 0 : 1) - (b.start_time ? 0 : 1) || shortTime(a.start_time).localeCompare(shortTime(b.start_time)));
    if (!onDay.length) return '';
    return `<li class="${offset === 0 ? 'is-today' : ''}">
      <span class="schedule-day">${WEEKDAY_LABELS[weekday]}${offset === 0 ? '<b>Hoje</b>' : ''}</span>
      <ul class="schedule-items">${onDay.map((meeting) => `<li>
        <span class="schedule-time">${meeting.start_time ? shortTime(meeting.start_time) : '—'}</span>
        <span class="schedule-title">${escapeHtml(meeting.title)}${meeting.start_time ? '' : `<small>${escapeHtml(meeting.time_note || 'Hora a confirmar')}</small>`}</span>
      </li>`).join('')}</ul>
    </li>`;
  }).join('');
  return `<section class="weekly-schedule">
    ${sectionHeading('Horário', 'Os próximos sete dias', '<span class="zone-tag">Hora de Luanda</span>')}
    <ul class="schedule-list">${rows}</ul>
  </section>`;
}

function otherMeetings(meetings, now) {
  const others = meetings.filter((meeting) => meeting.recurrence !== 'weekly');
  if (!others.length) return '';
  return `<section class="weekly-schedule">
    ${sectionHeading('Datas especiais', 'Mensais e anuais')}
    <ul class="event-list">${others.map((meeting) => {
      const occurrence = nextOccurrence(meeting, TIME_ZONE, now);
      return `<li>
        <span class="event-icon">${icon('calendar', { size: 20 })}</span>
        <span><strong>${escapeHtml(meeting.title)}</strong><small>${escapeHtml(recurrenceLabel(meeting))} · ${meeting.start_time ? `${shortTime(meeting.start_time)} (Luanda)` : escapeHtml(meeting.time_note || 'hora a confirmar')}</small></span>
        ${occurrence ? `<span class="event-when">${escapeHtml(relativeDayLabel(occurrence.start, now))}</span>` : ''}
      </li>`;
    }).join('')}</ul>
  </section>`;
}

export function livePage(state, now = new Date()) {
  const hero = `<section class="live-hero"><span class="eyebrow">${icon('live', { size: 16 })}Programação</span><h1>Reuniões que nos aproximam.</h1><p>Veja a próxima reunião, entre pelo Zoom e guarde os horários no calendário.</p></section>`;
  let body;
  if (state.meetingsError) body = `${hero}${errorState(scheduleError(state), state.meetingsError === 'indisponivel' ? '' : 'retry-meetings')}`;
  else if (!state.meetings) body = `${hero}${loadingState('A carregar a programação…')}`;
  else {
    const next = nextMeeting(state.meetings, TIME_ZONE, now);
    const recordings = APP_CONFIG.sources.find((source) => source.id === 'zoom-recordings');
    body = `${hero}
      ${next ? `<section class="next-meeting ${next.isLive ? 'is-live' : ''}" aria-labelledby="next-title">
        <div class="next-date"><span>${escapeHtml(relativeDayLabel(next.start, now))}</span><strong>${formatInZone(next.start)}</strong><small>Luanda</small></div>
        <div>
          <span class="eyebrow">${next.isLive ? 'A decorrer agora' : 'Próxima reunião'}</span>
          <h2 id="next-title">${escapeHtml(next.meeting.title)}</h2>
          <p class="live-countdown" data-countdown="${next.start.toISOString()}" data-live="${next.isLive}">${escapeHtml(liveStatus(next, now))}</p>
          ${showBothZones() ? `<p class="hint">${formatInZone(next.start, userZone)} no seu fuso horário (${escapeHtml(userZone)})</p>` : ''}
        </div>
      </section>` : '<p class="notice">Não há reuniões com hora marcada.</p>'}
      ${untimedNote(state.meetings, now)}
      ${joinPanel(next)}
      ${weekSchedule(state.meetings, now)}
      ${otherMeetings(state.meetings, now)}
      ${recordings ? `<section class="recordings">
        ${sectionHeading('Depois da reunião', 'Gravações das lives', `<a class="link-button" ${externalLinkAttrs(recordings.url)}>Ver canal${externalHint}</a>`)}
        ${videoRow(state, recordings)}
      </section>` : ''}`;
  }
  return page('live', { title: 'Ao vivo', back: 'home', body });
}
