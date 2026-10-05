import { ministryText } from '../i18n.js';
import { t, th } from '../i18n.js';
// "Ao vivo": the next meeting, how to join it, and the week ahead.
import { APP_CONFIG } from '../data.js';
import { escapeHtml, externalLinkAttrs, safeUrl } from '../html.js';
import { icon } from '../icons.js';
import { WEEKDAY_LABELS, nextMeeting, nextOccurrence, recurrenceLabel, untimedMeetingsOn, zonedDateParts } from '../meetings.js';
import { countdownLabel, errorState, externalHint, formatInZone, loadingState, page, relativeDayLabel, sectionHeading, showBothZones, TIME_ZONE, userZone } from './shared.js';
import { videoRow } from './videos.js';

const shortTime = (value) => String(value || '').slice(0, 5);

// While a live is on the app says so, and since when; the countdown before.
export function liveStatus(next, now = new Date()) {
  return next.isLive ? t("A live está a decorrer desde as {0}.", { 0: formatInZone(next.start) }) : countdownLabel(next.start, now);
}

// The one line the home page's welcome carries, so the live is in view even
// before scrolling: on air now, or when the next one starts.
export function liveChip(state, now = new Date()) {
  if (!state.meetings) return '';
  const next = nextMeeting(state.meetings, TIME_ZONE, now);
  if (!next) return '';
  if (next.isLive) {
    return `<a class="live-chip is-live" href="/ao-vivo"><span class="live-dot" aria-hidden="true"></span><strong>${th("Ao vivo agora")}</strong><span>${escapeHtml(ministryText(next.meeting.title))}</span>${icon('arrowRight', { size: 16 })}</a>`;
  }
  return `<a class="live-chip" href="/ao-vivo">${icon('live', { size: 16 })}<strong>${th("Próxima live")}</strong><span>${escapeHtml(relativeDayLabel(next.start, now))}, ${formatInZone(next.start)} · Luanda</span>${icon('arrowRight', { size: 16 })}</a>`;
}

// Said wherever the next meeting is shown, so a Tuesday never looks empty:
// the general live that day has no fixed time, only "after the ministers'".
function untimedNote(meetings, now) {
  const today = untimedMeetingsOn(meetings, TIME_ZONE, now);
  if (!today.length) return '';
  return `<p class="live-also">${icon('info', { size: 16 })}<span>${th("Hoje também: {1}.", { 1: today.map((meeting) => `<strong>${escapeHtml(ministryText(meeting.title))}</strong> — ${escapeHtml(ministryText(meeting.time_note))}`).join('; ') })}</span></p>`;
}

export function calendarActions({ compact = false } = {}) {
  const feed = '/calendario.ics';
  const subscribe = `webcal://${window.location.host}${feed}`;
  if (compact) {
    return `<a class="text-button" href="${feed}" download="reunioes-istn-sj.ics">${th("{1}Lembrar-me", { 1: icon('bell', { size: 18 }) })}</a>`;
  }
  return `<div class="calendar-actions">
    <a class="button button-outline full-width" href="${escapeHtml(subscribe)}" data-external>${th("{1}Subscrever no calendário", { 1: icon('calendar', { size: 18 }) })}</a>
    <p class="hint">${th("A subscrição atualiza-se sozinha quando a equipa muda um horário. Se o telemóvel não a abrir,")} <a href="${feed}" download="reunioes-istn-sj.ics">${th("descarregue o ficheiro")}</a>.</p>
  </div>`;
}

export function liveCard(state, now = new Date()) {
  const kicker = (label) => `<div class="live-kicker"><span class="live-dot" aria-hidden="true"></span>${label}</div>`;
  if (state.meetingsError) {
    return `<section class="live-card" aria-labelledby="live-card-title">${kicker(`<span id="live-card-title">${th("Próxima reunião")}</span>`)}<p class="live-note">${escapeHtml(scheduleError(state))}</p>${state.meetingsError === 'indisponivel' ? '' : `<button class="button button-light" type="button" data-action="retry-meetings">${th("{0}Tentar de novo", { 0: icon('refresh', { size: 18 }) })}</button>`}</section>`;
  }
  if (!state.meetings) return `<section class="live-card">${kicker(t("Próxima reunião"))}<p class="live-note">${th("A carregar a programação…")}</p></section>`;
  const next = nextMeeting(state.meetings, TIME_ZONE, now);
  if (!next) return `<section class="live-card">${kicker(t("Próxima reunião"))}<p class="live-note">${th("Não há reuniões com hora marcada.")}</p>${untimedNote(state.meetings, now)}</section>`;
  const zoom = safeUrl(next.meeting.zoom_url);
  return `<section class="live-card ${next.isLive ? 'is-live' : ''}" aria-labelledby="live-card-title">
    ${kicker(next.isLive ? `<span class="on-air">${th("Ao vivo agora")}</span>` : t("Próxima reunião"))}
    <h2 id="live-card-title">${escapeHtml(ministryText(next.meeting.title))}</h2>
    <p class="live-time"><strong>${formatInZone(next.start)}</strong><span>${th("{4} · hora de Luanda{5}", { 4: next.isLive ? t("Começou") : relativeDayLabel(next.start, now), 5: showBothZones() ? `<br>${th("{0} no seu fuso horário", { 0: formatInZone(next.start, userZone) })}` : '' })}</span></p>
    <p class="live-countdown" data-countdown="${next.start.toISOString()}" data-live="${next.isLive}">${escapeHtml(liveStatus(next, now))}</p>
    ${untimedNote(state.meetings, now)}
    <div class="live-actions">
      ${next.isLive && next.meeting.zoom_embedded
        ? `<a class="button button-dark" href="/sala.html?meeting=${encodeURIComponent(next.meeting.id)}" data-external>${th("{1}Participar na live", { 1: icon('live', { size: 18 }) })}</a><a class="text-button" href="/ao-vivo">${th("Ver reunião")}</a>`
        : next.isLive && zoom
        ? `<a class="button button-dark" ${externalLinkAttrs(zoom)}>${th("{1}Entrar no Zoom{2}", { 1: icon('external', { size: 18 }), 2: externalHint() })}</a><a class="text-button" href="/ao-vivo">${th("ID e senha")}</a>`
        : `<a class="button button-light" href="/ao-vivo">${next.isLive ? t("Entrar na reunião") : t("Ver reunião")}${icon('arrowRight', { size: 18 })}</a>${calendarActions({ compact: true })}`}
    </div>
  </section>`;
}

function credential(label, spoken, value) {
  if (!value) return '';
  return `<div class="credential"><dt>${label}</dt><dd><span>${escapeHtml(value)}</span><button class="icon-button small" type="button" data-action="copy" data-value="${escapeHtml(value)}" data-label="${label}" data-focus-key="copy:${label}" aria-label="${th("Copiar {5}", { 5: spoken })}">${icon('copy', { size: 18 })}</button></dd></div>`;
}

// Unconfigured is not the reader's connection failing; say which it is.
const scheduleError = (state) => (state.meetingsError === 'indisponivel'
  ? t("A programação ainda não está disponível nesta instalação.")
  : t("Não foi possível carregar a programação. Verifique a ligação à internet."));

function joinPanel(next) {
  const room = next?.meeting;
  const zoom = safeUrl(room?.zoom_url);
  return `<section class="join-panel" aria-labelledby="join-title">
    <h2 id="join-title">${th("Entrar na reunião")}</h2>
    ${room ? `<p>${escapeHtml(ministryText(room.title))}</p>` : `<p>${th("Não há reunião marcada.")}</p>`}
    ${room?.zoom_embedded ? `<a class="button button-gold full-width" href="/sala.html?meeting=${encodeURIComponent(room.id)}" data-external>${th("{1}Participar aqui na App", { 1: icon('live', { size: 18 }) })}</a>
      <p class="hint">${th("Assista à reunião e use «Levantar a mão» para pedir a palavra ao responsável.")}</p>` : ''}
    ${zoom
      ? `<a class="button button-gold full-width" ${externalLinkAttrs(zoom)}>${th("{1}Entrar no Zoom{2}", { 1: icon('external', { size: 18 }), 2: externalHint() })}</a>
         <dl class="credentials">${credential(t("ID da reunião"), t("o ID da reunião"), room.zoom_meeting_id)}${credential(t("Senha"), t("a senha"), room.zoom_passcode)}</dl>`
      : room ? `<p class="notice">${icon('info', { size: 18 })}<span>${th("A equipa ainda não publicou a sala do Zoom desta reunião. Volte a consultar mais perto da hora.")}</span></p>` : ''}
    ${calendarActions()}
    <a class="text-button" ${externalLinkAttrs(APP_CONFIG.sources[0].url)}>${th("{5}Transmissões no YouTube{6}", { 5: icon('external', { size: 16 }), 6: externalHint() })}</a>
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
      <span class="schedule-day">${t(WEEKDAY_LABELS[weekday])}${offset === 0 ? `<b>${th("Hoje")}</b>` : ''}</span>
      <ul class="schedule-items">${onDay.map((meeting) => `<li>
        <span class="schedule-time">${meeting.start_time ? shortTime(meeting.start_time) : '—'}</span>
        <span class="schedule-title">${escapeHtml(ministryText(meeting.title))}${meeting.start_time ? '' : `<small>${escapeHtml(meeting.time_note || t("Hora a confirmar"))}</small>`}</span>
      </li>`).join('')}</ul>
    </li>`;
  }).join('');
  return `<section class="weekly-schedule">
    ${sectionHeading(t("Horário"), t("Os próximos sete dias"), `<span class="zone-tag">${th("Hora de Luanda")}</span>`)}
    <ul class="schedule-list">${rows}</ul>
  </section>`;
}

function otherMeetings(meetings, now) {
  const others = meetings.filter((meeting) => meeting.recurrence !== 'weekly');
  if (!others.length) return '';
  return `<section class="weekly-schedule">
    ${sectionHeading(t("Datas especiais"), t("Mensais e anuais"))}
    <ul class="event-list">${others.map((meeting) => {
      const occurrence = nextOccurrence(meeting, TIME_ZONE, now);
      return `<li>
        <span class="event-icon">${icon('calendar', { size: 20 })}</span>
        <span><strong>${escapeHtml(ministryText(meeting.title))}</strong><small>${escapeHtml(recurrenceLabel(meeting))} · ${meeting.start_time ? `${shortTime(meeting.start_time)} (Luanda)` : escapeHtml(meeting.time_note || t("hora a confirmar"))}</small></span>
        ${occurrence ? `<span class="event-when">${escapeHtml(relativeDayLabel(occurrence.start, now))}</span>` : ''}
      </li>`;
    }).join('')}</ul>
  </section>`;
}

export function livePage(state, now = new Date()) {
  const hero = `<section class="live-hero"><span class="eyebrow">${th("{0}Programação", { 0: icon('live', { size: 16 }) })}</span><h1>${th("Reuniões que nos fortalecem")}</h1><p class="live-hero-lead">${th("Se alimente cada dia na mesa do Senhor no seio de Deus.")}</p><p>${th("Veja a próxima reunião, entre pelo Zoom e guarde os horários no calendário.")}</p></section>`;
  let body;
  if (state.meetingsError) body = `${hero}${errorState(scheduleError(state), state.meetingsError === 'indisponivel' ? '' : 'retry-meetings')}`;
  else if (!state.meetings) body = `${hero}${loadingState(t("A carregar a programação…"))}`;
  else {
    const next = nextMeeting(state.meetings, TIME_ZONE, now);
    const recordings = APP_CONFIG.sources.find((source) => source.id === 'zoom-recordings');
    body = `${hero}
      ${next ? `<section class="next-meeting ${next.isLive ? 'is-live' : ''}" aria-labelledby="next-title">
        <div class="next-date"><span>${next.isLive ? t("Desde as") : escapeHtml(relativeDayLabel(next.start, now))}</span><strong>${formatInZone(next.start)}</strong><small>Luanda</small></div>
        <div>
          <span class="eyebrow">${next.isLive ? `<span class="on-air">${th("Ao vivo agora")}</span>` : t("Próxima reunião")}</span>
          <h2 id="next-title">${escapeHtml(ministryText(next.meeting.title))}</h2>
          <p class="live-countdown" data-countdown="${next.start.toISOString()}" data-live="${next.isLive}">${escapeHtml(liveStatus(next, now))}</p>
          ${showBothZones() ? `<p class="hint">${th("{0} no seu fuso horário ({1})", { 0: formatInZone(next.start, userZone), 1: escapeHtml(userZone) })}</p>` : ''}
        </div>
      </section>` : `<p class="notice">${th("Não há reuniões com hora marcada.")}</p>`}
      ${untimedNote(state.meetings, now)}
      ${joinPanel(next)}
      ${weekSchedule(state.meetings, now)}
      ${otherMeetings(state.meetings, now)}
      ${recordings ? `<section class="recordings">
        ${sectionHeading(t("Depois da reunião"), t("Gravações das lives"), `<a class="link-button" ${externalLinkAttrs(recordings.url)}>${th("Ver canal{1}", { 1: externalHint() })}</a>`)}
        ${videoRow(state, recordings)}
      </section>` : ''}`;
  }
  return page('live', { title: t("Ao vivo"), back: 'home', body });
}
