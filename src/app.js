import { APP_CONFIG, countryNames, loadDirectory, loadLatestVideos, loadMeetings, loadTeachingLibrary, toWhatsApp } from './data.js';
import { DEFAULT_DURATION_MINUTES, nextMeeting, nextOccurrence, recurrenceLabel, zonedDateParts } from './meetings.js';
import { uploadPhoto } from './upload.js';
import { availableProviders, badgeFor, finishSocialSignIn, loadChurchOptions, loadProfile, readSession, register, requestServantBadge, saveProfile, signIn, signInWithProvider, signOut } from './account.js';
import { verifiedSeal } from './roles.js';

// Confirmed with the ISTN-SJ team: every announced time is Luanda time.
const TIME_ZONE = 'Africa/Luanda';

const app = document.querySelector('#app');
const state = { page: 'home', query: '', category: 'Todas', year: 'Todos', book: 'Todos', sort: 'recent', teachingPage: 1, teachingLibrary: null, directory: null, selectedChurch: null, selectedSource: null, country: 'Todos', latestVideos: {}, videosLoading: true, meetings: null, meetingsError: false, session: null, profile: null, authMode: 'entrar', churchOptions: null, providers: null, uploading: false };
const TEACHING_CATEGORIES = ['Todas', 'Cultos', 'Cultos dos servos', 'Lives', 'Especiais'];
const BOOK_SPELLING_FIXES = { 'Galátas': 'Gálatas', 'Exôdo': 'Êxodo', '1Timóteo': '1 Timóteo' };
const icon = (name) => ({ home: '⌂', teachings: '◫', live: '◉', churches: '⌖', profile: '◌', search: '⌕', arrow: '→', play: '▶', back: '←', calendar: '◷', pin: '⌖', user: '♙', check: '✓', phone: '☎', external: '↗', bell: '♧', globe: '◎', share: '⤴' }[name] || '•');

function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function link(url) { return url ? `target="_blank" rel="noreferrer" href="${url}"` : ''; }

function header({ back = false, title = '', action = '' } = {}) {
  return `<header class="topbar">
    <button class="brand" data-page="home" aria-label="Página inicial"><span class="brand-sun">✦</span><span>ELIAS <small>ISTN-SJ</small></span></button>
    ${title ? `<div class="page-title">${back ? `<button class="icon-button" data-page="${back}" aria-label="Voltar">${icon('back')}</button>` : ''}<strong>${title}</strong></div>` : ''}
    ${action}
  </header>`;
}

function navigation() {
  const items = [['home', 'home', 'Início'], ['teachings', 'teachings', 'Lives'], ['live', 'live', 'Ao vivo'], ['churches', 'churches', 'Igrejas'], ['profile', 'profile', 'Perfil']];
  return `<nav class="bottom-nav" aria-label="Navegação principal">${items.map(([page, name, label]) => `<button class="nav-item ${state.page === page ? 'active' : ''}" data-page="${page}"><span>${icon(name)}</span><small>${label}</small></button>`).join('')}</nav>`;
}

function sourceCard(source, featured = false) {
  return `<article class="source-card ${featured ? 'featured-source' : ''}" data-source="${source.id}" tabindex="0" role="button">
    <img src="${source.image}" alt="" loading="lazy" />
    <div class="source-card-overlay"><span class="platform">${escapeHtml(source.platform)}</span><h3>${escapeHtml(source.title)}</h3><p>${escapeHtml(source.type)} · Abrir fonte externa ${icon('arrow')}</p></div>
  </article>`;
}

function recentVideoCard(video) {
  const date = video.publishedAt ? new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(video.publishedAt)) : '';
  return `<a class="recent-video" ${link(video.url)}><img src="${escapeHtml(video.thumbnail)}" alt="" loading="lazy" /><span class="recent-video-play">${icon('play')}</span><span class="recent-video-copy"><small>${escapeHtml(video.meta || date)}</small><strong><span>${escapeHtml(video.title)}</span></strong><em>Ver no YouTube ${icon('external')}</em></span></a>`;
}

function formatTeachingDate(value) {
  return new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`));
}

function teachingYear(publishedAt) { return publishedAt ? publishedAt.slice(0, 4) : null; }

function teachingCategory(service = '') {
  const value = service.trim().toLowerCase();
  if (value.startsWith('live')) return 'Lives';
  if (value.includes('servos')) return 'Cultos dos servos';
  if (value.startsWith('culto')) return 'Cultos';
  return 'Especiais';
}

function biblicalBook(reference) {
  if (!reference) return null;
  const match = reference.trim().match(/^((?:\d\s*)?[^\d]+)/);
  if (!match) return null;
  const book = match[1].replace(/\s+/g, ' ').trim();
  return BOOK_SPELLING_FIXES[book] || book;
}

function youtubeThumbnail(url) {
  try {
    const parsed = new URL(url);
    const id = parsed.hostname.includes('youtu.be') ? parsed.pathname.slice(1) : parsed.searchParams.get('v');
    return id ? `https://i3.ytimg.com/vi/${id}/hqdefault.jpg` : '';
  } catch { return ''; }
}

function teachingCard(teaching) {
  const thumbnail = youtubeThumbnail(teaching.url);
  const timeRange = teaching.startsAt && teaching.endsAt ? `Mensagem: ${teaching.startsAt.slice(0, 5)} – ${teaching.endsAt.slice(0, 5)}` : '';
  return `<article class="archive-teaching"><a class="archive-teaching-link" ${link(teaching.url)}>${thumbnail ? `<img src="${thumbnail}" alt="" loading="lazy" />` : '<span class="archive-teaching-image">▶</span>'}<span class="archive-teaching-body"><small>${escapeHtml(teaching.service || 'Youtube')} · ${formatTeachingDate(teaching.publishedAt)}</small><strong><span>${escapeHtml(teaching.title)}</span></strong>${teaching.biblicalReference ? `<em>${escapeHtml(teaching.biblicalReference)}</em>` : ''}${timeRange ? `<i>${timeRange}</i>` : ''}<b>Abrir no YouTube ${icon('external')}</b></span></a><button class="archive-share" data-share="${escapeHtml(teaching.id)}" aria-label="Partilhar ${escapeHtml(teaching.title)}" title="Partilhar">${icon('share')}</button></article>`;
}

async function shareTeaching(teaching) {
  const label = `${teaching.title}${teaching.biblicalReference ? ` (${teaching.biblicalReference})` : ''}`;
  if (navigator.share) {
    try { await navigator.share({ title: teaching.title, text: label, url: teaching.url }); return; }
    catch (error) { if (error.name === 'AbortError') return; }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(`${label}\n${teaching.url}`)}`, '_blank', 'noreferrer');
}

function teachingArchive() {
  if (!state.teachingLibrary) return `<section class="teaching-archive"><div class="video-feed-empty"><span><i class="loader"></i></span><p>A carregar o acervo de pregações…</p></div></section>`;
  const library = state.teachingLibrary;
  const years = ['Todos', ...[...new Set(library.map((teaching) => teachingYear(teaching.publishedAt)).filter(Boolean))].sort((a, b) => b.localeCompare(a))];
  const books = ['Todos', ...[...new Set(library.map((teaching) => biblicalBook(teaching.biblicalReference)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'))];
  const query = state.query.trim().toLowerCase();
  const matching = library.filter((teaching) => {
    const searchable = [teaching.title, teaching.biblicalReference, teaching.service, teaching.description].filter(Boolean).join(' ').toLowerCase();
    return (state.category === 'Todas' || teachingCategory(teaching.service) === state.category)
      && (state.year === 'Todos' || teachingYear(teaching.publishedAt) === state.year)
      && (state.book === 'Todos' || biblicalBook(teaching.biblicalReference) === state.book)
      && (!query || searchable.includes(query));
  });
  const sorted = [...matching].sort((a, b) => state.sort === 'oldest' ? a.publishedAt.localeCompare(b.publishedAt) : b.publishedAt.localeCompare(a.publishedAt));
  const limit = state.teachingPage * 24;
  let lastYear = null;
  const cardsHtml = sorted.slice(0, limit).map((teaching) => {
    const year = teachingYear(teaching.publishedAt);
    const heading = year !== lastYear ? `<div class="archive-year-heading"><span>${year}</span></div>` : '';
    lastYear = year;
    return `${heading}${teachingCard(teaching)}`;
  }).join('');
  const categoryChips = TEACHING_CATEGORIES.map((category) => {
    const total = category === 'Todas' ? library.length : library.filter((teaching) => teachingCategory(teaching.service) === category).length;
    return `<button class="category-chip ${state.category === category ? 'selected' : ''}" data-category="${escapeHtml(category)}"><strong>${escapeHtml(category)}</strong><small>${total}</small></button>`;
  }).join('');
  const activeFilters = [state.category !== 'Todas' && state.category, state.year !== 'Todos' && `Ano ${state.year}`, state.book !== 'Todos' && state.book, query && `“${state.query.trim()}”`].filter(Boolean);
  return `<section class="teaching-archive">
    <div class="category-chips" role="group" aria-label="Filtrar por tipo de encontro">${categoryChips}</div>
    <div class="archive-controls">
      <label class="archive-select"><span>Ano</span><select id="archive-year-filter">${years.map((year) => `<option value="${escapeHtml(year)}" ${state.year === year ? 'selected' : ''}>${escapeHtml(year)}</option>`).join('')}</select></label>
      <label class="archive-select"><span>Livro bíblico</span><select id="archive-book-filter">${books.map((book) => `<option value="${escapeHtml(book)}" ${state.book === book ? 'selected' : ''}>${escapeHtml(book)}</option>`).join('')}</select></label>
      <div class="archive-sort" role="group" aria-label="Ordenar pregações"><button class="filter ${state.sort !== 'oldest' ? 'selected' : ''}" data-sort="recent">Mais recentes</button><button class="filter ${state.sort === 'oldest' ? 'selected' : ''}" data-sort="oldest">Mais antigas</button></div>
    </div>
    <div class="archive-count"><p><strong>${matching.length}</strong> ${matching.length === 1 ? 'pregação encontrada' : 'pregações encontradas'}${activeFilters.length ? ` · ${escapeHtml(activeFilters.join(' · '))}` : ''}</p>${activeFilters.length ? '<button class="text-button" data-clear-filters>Limpar filtros</button>' : ''}</div>
    ${matching.length ? `<div class="archive-grid">${cardsHtml}</div>${matching.length > limit ? `<button class="button button-outline archive-more" data-show-more>Mostrar mais pregações (${matching.length - limit})</button>` : ''}` : `<div class="empty-state"><span>⌕</span><h2>Nenhuma pregação encontrada</h2><p>Tente outro tema, referência ou retire os filtros.</p></div>`}
  </section>`;
}

function latestVideosSection() {
  const sourceList = APP_CONFIG.sources.filter((source) => source.channelId);
  if (!sourceList.length) return '';
  const groups = sourceList.map((source) => ({ source, videos: state.latestVideos[source.channelId]?.videos || [] }));
  const hasVideos = groups.some((group) => group.videos.length);
  const badge = state.videosLoading ? 'A atualizar…' : hasVideos ? 'Feed público' : 'Indisponível';
  return `<section class="latest-videos"><div class="latest-videos-heading"><div><span class="eyebrow">ATUALIZADO PELO YOUTUBE</span><h2>Últimos vídeos publicados</h2></div><span class="fresh-indicator ${hasVideos || state.videosLoading ? '' : 'is-offline'}">${badge}</span></div>${hasVideos
    ? groups.map(({ source, videos }) => `<div class="video-channel-group"><div class="video-channel-title"><span>${escapeHtml(source.title)}</span><a ${link(source.url)}>Abrir canal ${icon('external')}</a></div>${videos.length ? `<div class="recent-videos-row">${videos.slice(0, 3).map(recentVideoCard).join('')}</div>` : `<div class="video-feed-empty"><span>⌁</span><p>Sem vídeos deste canal agora.</p></div>`}</div>`).join('')
    : `<div class="video-feed-empty"><span>${state.videosLoading ? '<i class="loader"></i>' : '⌁'}</span><p>${state.videosLoading ? 'A carregar os últimos vídeos…' : 'O YouTube não está a responder agora. Abra os canais diretamente:'}</p>${state.videosLoading ? '' : `<div class="video-feed-links">${sourceList.map((source) => `<a class="button button-outline" ${link(source.url)}>${escapeHtml(source.title)} ${icon('external')}</a>`).join('')}</div>`}</div>`}</section>`;
}

const userZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const showBothZones = () => userZone && userZone !== TIME_ZONE;

function formatInZone(date, timeZone) {
  return new Intl.DateTimeFormat('pt-PT', { timeZone, hour: '2-digit', minute: '2-digit' }).format(date);
}

// Only returns a countdown inside 24h; beyond that the weekday label already says it.
function countdownLabel(start, now = new Date()) {
  const minutes = Math.max(0, Math.round((start - now) / 60000));
  if (minutes < 60) return `Começa em ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `Começa em ${hours}h ${String(minutes % 60).padStart(2, '0')}min` : '';
}

function relativeDayLabel(start, now = new Date()) {
  const startDay = zonedDateParts(start, TIME_ZONE);
  const today = zonedDateParts(now, TIME_ZONE);
  const diff = Math.round((Date.UTC(startDay.year, startDay.month - 1, startDay.day) - Date.UTC(today.year, today.month - 1, today.day)) / 86400000);
  if (diff === 0) return 'HOJE';
  if (diff === 1) return 'AMANHÃ';
  return new Intl.DateTimeFormat('pt-PT', { timeZone: TIME_ZONE, weekday: 'long' }).format(start).toUpperCase();
}

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function icsStamp(date) {
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

// RFC 5545 caps a content line at 75 octets; continuations start with a space.
// Measured in UTF-8 bytes so accented characters are never split mid-sequence.
function foldIcsLine(line) {
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
// One recurring calendar entry per meeting that has a fixed start time, each
// with a 15-minute alarm. Times are emitted in UTC, which is exact because
// Angola has no daylight saving.
function buildReminderCalendar(meetings) {
  const now = new Date();
  const events = meetings
    .map((meeting) => ({ meeting, occurrence: nextOccurrence(meeting, TIME_ZONE, now) }))
    .filter(({ occurrence }) => occurrence)
    .map(({ meeting, occurrence }, index) => {
      const start = occurrence.start;
      const end = new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60000);
      const rule = meeting.recurrence === 'weekly'
        ? `RRULE:FREQ=WEEKLY;BYDAY=${(meeting.weekdays || []).map((weekday) => WEEKDAY_CODES[weekday]).join(',')}`
        : meeting.recurrence === 'monthly_last'
          ? `RRULE:FREQ=MONTHLY;BYDAY=-1${WEEKDAY_CODES[(meeting.weekdays || [])[0]]}`
          : meeting.recurrence === 'yearly'
            ? 'RRULE:FREQ=YEARLY'
            : '';
      return [
        'BEGIN:VEVENT',
        `UID:elias-istn-sj-${index}-${start.getTime()}@istn-sj`,
        `DTSTAMP:${icsStamp(now)}`,
        `DTSTART:${icsStamp(start)}`,
        `DTEND:${icsStamp(end)}`,
        ...(rule ? [rule] : []),
        `SUMMARY:${meeting.title}`,
        `DESCRIPTION:Hora de Luanda: ${String(meeting.start_time).slice(0, 5)}.${meeting.zoom_meeting_id ? ` ID da reunião ${meeting.zoom_meeting_id}` : ''}`,
        ...(meeting.zoom_url ? [`URL:${meeting.zoom_url}`] : []),
        'BEGIN:VALARM',
        'TRIGGER:-PT15M',
        'ACTION:DISPLAY',
        'DESCRIPTION:A reunião começa em 15 minutos',
        'END:VALARM',
        'END:VEVENT'
      ];
    });
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ISTN-SJ//ELIAS//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...events.flat(), 'END:VCALENDAR'];
  return lines.map(foldIcsLine).join('\r\n');
}

function downloadReminder() {
  if (!state.meetings?.length) { showToast('A programação ainda não carregou.'); return; }
  const blob = new Blob([buildReminderCalendar(state.meetings)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'reunioes-elias-istn-sj.ics';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Abra o ficheiro para adicionar os lembretes ao seu calendário.');
}

function liveCard(compact = false) {
  const wrapper = (inner) => `<section class="live-card ${compact ? 'compact' : ''}">${inner}</section>`;
  if (state.meetingsError) return wrapper(`<div class="live-kicker"><span class="live-dot"></span> PRÓXIMA REUNIÃO</div><p class="live-note">Não foi possível carregar a programação. <button class="text-button" data-action="retry-meetings">Tentar de novo</button></p>`);
  if (!state.meetings) return wrapper('<div class="live-kicker"><span class="live-dot"></span> PRÓXIMA REUNIÃO</div><p class="live-note">A carregar a programação…</p>');
  const next = nextMeeting(state.meetings, TIME_ZONE);
  if (!next) return wrapper('<div class="live-kicker"><span class="live-dot"></span> PRÓXIMA REUNIÃO</div><p class="live-note">Sem reuniões com hora marcada.</p>');
  const status = next.isLive ? 'A reunião já começou.' : countdownLabel(next.start);
  return wrapper(`<div class="live-kicker"><span class="live-dot"></span> ${next.isLive ? 'A DECORRER AGORA' : 'PRÓXIMA REUNIÃO'}</div>
    <h2>${escapeHtml(next.meeting.title)}</h2>
    <p class="live-time"><strong>${formatInZone(next.start, TIME_ZONE)}</strong> <span>${relativeDayLabel(next.start)} · horário de Luanda${showBothZones() ? `<br>${formatInZone(next.start, userZone)} no seu fuso` : ''}</span></p>
    ${status ? `<p class="live-countdown">${status}</p>` : ''}
    <div class="live-actions">
      <button class="button button-light" data-page="live">Ver reunião <span>${icon('arrow')}</span></button>
      <button class="text-button" data-action="reminder">${icon('bell')} Lembrar-me</button>
    </div>`);
}

function meetingRow(meeting) {
  const occurrence = nextOccurrence(meeting, TIME_ZONE);
  return `<li>
    <span class="schedule-day">${escapeHtml(meeting.title)}<b>${escapeHtml(recurrenceLabel(meeting))}</b></span>
    <span class="schedule-time">${meeting.start_time ? escapeHtml(String(meeting.start_time).slice(0, 5)) : `<em>${escapeHtml(meeting.time_note || 'A confirmar')}</em>`}${occurrence ? `<small>${relativeDayLabel(occurrence.start)}</small>` : ''}</span>
  </li>`;
}

function live() {
  const head = header({ title: 'Ao vivo', back: 'home' });
  const hero = `<section class="live-hero"><span class="live-kicker"><span class="live-dot"></span> PROGRAMAÇÃO</span><h1>Reuniões que nos aproximam.</h1><p>Acompanhe o próximo encontro e entre diretamente pelo Zoom.</p></section>`;
  if (state.meetingsError) return `${head}<main class="page-content live-page">${hero}<div class="video-feed-empty"><span>⌁</span><p>Não foi possível carregar a programação. <button class="text-button" data-action="retry-meetings">Tentar de novo</button></p></div></main>${navigation()}`;
  if (!state.meetings) return `${head}<main class="page-content live-page">${hero}<div class="video-feed-empty"><span><i class="loader"></i></span><p>A carregar a programação…</p></div></main>${navigation()}`;

  const now = new Date();
  const next = nextMeeting(state.meetings, TIME_ZONE, now);
  const room = next?.meeting;
  const gerais = state.meetings.filter((meeting) => meeting.kind === 'geral');
  const especiais = state.meetings.filter((meeting) => meeting.kind !== 'geral');

  return `${head}<main class="page-content live-page">
    ${hero}
    ${next ? `<section class="live-detail-card ${next.isLive ? 'is-live' : ''}">
      <div class="live-date"><span>${relativeDayLabel(next.start, now)}</span><strong>${formatInZone(next.start, TIME_ZONE)}</strong><small>Luanda</small></div>
      <div><span class="eyebrow">${next.isLive ? 'A DECORRER AGORA' : 'PRÓXIMA REUNIÃO'}</span><h2>${escapeHtml(next.meeting.title)}</h2><p>${[next.isLive ? 'A reunião já começou.' : countdownLabel(next.start, now), showBothZones() ? `${formatInZone(next.start, userZone)} no seu fuso` : ''].filter(Boolean).join(' · ')}</p></div>
    </section>` : ''}
    <div class="timezone-row"><span>${icon('calendar')}</span><p>Agora em Luanda: <strong>${formatInZone(now, TIME_ZONE)}</strong>${showBothZones() ? ` · No seu fuso (${escapeHtml(userZone)}): <strong>${formatInZone(now, userZone)}</strong>` : ''}</p></div>
    <section class="join-panel">
      <h2>Entrar na reunião</h2>
      <p>${room ? escapeHtml(room.title) : 'Sem reunião marcada.'}</p>
      ${room?.zoom_url
        ? `<a class="button button-gold full-width" ${link(room.zoom_url)}>Entrar no Zoom ${icon('external')}</a>
           <dl class="meeting-credentials">
             <div><dt>ID da reunião</dt><dd>${escapeHtml(room.zoom_meeting_id || '—')}</dd></div>
             <div><dt>Senha de acesso</dt><dd>${escapeHtml(room.zoom_passcode || '—')}</dd></div>
           </dl>`
        : '<p class="live-note">A sala desta reunião ainda não foi publicada pela equipa.</p>'}
      <button class="button button-outline full-width" data-action="reminder">${icon('bell')} Adicionar lembretes ao calendário</button>
      <a class="text-button external-link" ${link(APP_CONFIG.sources[0].url)}>Ver transmissões no YouTube ${icon('external')}</a>
    </section>
    ${gerais.length ? `<section class="weekly-schedule">
      <div class="section-heading"><div><span class="eyebrow">REUNIÕES GERAIS</span><h2>Todas as semanas</h2></div><span class="zone-tag">Hora de Luanda</span></div>
      <ul class="schedule-list">${gerais.map(meetingRow).join('')}</ul>
    </section>` : ''}
    ${especiais.length ? `<section class="weekly-schedule">
      <div class="section-heading"><div><span class="eyebrow">REUNIÕES ESPECIAIS</span><h2>Encontros próprios</h2></div></div>
      <ul class="schedule-list">${especiais.map(meetingRow).join('')}</ul>
    </section>` : ''}
    <section class="recording-state"><span class="round-icon">${icon('play')}</span><div><span class="eyebrow">APÓS A REUNIÃO</span><h2>Gravação pendente</h2><p>Quando associada pela equipa, a gravação aparecerá no arquivo.</p></div></section>
  </main>${navigation()}`;
}

function home() {
  return `${header({ action: '<button class="icon-button" data-page="teachings" aria-label="Pesquisar ensinos">⌕</button>' })}
  <main>
    <section class="hero"><div class="eyebrow">BEM-VINDO À ELIAS</div><h1>Acompanhe os ensinos.<br><em>Encontre a sua ISTN.</em></h1><p>Um lugar para conteúdos do Profeta Elias, reuniões e comunidades ISTN-SJ.</p><div class="hero-actions"><button class="button button-gold" data-page="teachings">Explorar ensinos ${icon('arrow')}</button><button class="link-button" data-page="churches">Encontrar uma igreja</button></div></section>
    <section class="content-section featured-section"><div class="section-heading"><div><span class="eyebrow">EM DESTAQUE</span><h2>Continue a acompanhar</h2></div><button class="link-button" data-page="teachings">Ver todos</button></div>${sourceCard(APP_CONFIG.sources[0], true)}</section>
    <section class="content-section">${liveCard(true)}</section>
    <section class="content-section">${latestVideosSection()}</section>
    <section class="content-section"><div class="section-heading"><div><span class="eyebrow">BIBLIOTECA</span><h2>Fontes de ensino</h2></div><button class="link-button" data-page="teachings">Explorar</button></div><div class="horizontal-scroll">${APP_CONFIG.sources.slice(1).map((source) => sourceCard(source)).join('')}</div></section>
    ${state.profile ? '' : `<section class="join-invite">
      <span class="round-icon">${icon('user')}</span>
      <div>
        <span class="eyebrow">A SUA CONTA</span>
        <h2>Leve as suas preferências consigo.</h2>
        <p>As suas preferências passam a acompanhá-lo em qualquer telemóvel. E se serve na ISTN, pode pedir o selo de verificação.</p>
      </div>
      <button class="button button-dark" data-page="profile">Entrar ou registar-se</button>
    </section>`}
    <section class="find-istn">
      <img class="find-istn-photo" src="/design/assets/photos/congregacao-istn-640.webp" srcset="/design/assets/photos/congregacao-istn-640.webp 640w, /design/assets/photos/congregacao-istn-1280.webp 1280w" sizes="(min-width: 760px) 700px, 100vw" alt="Membros da ISTN-SJ reunidos com o Profeta Elias" loading="lazy" />
      <span class="round-icon">${icon('globe')}</span>
      <div><span class="eyebrow">ISTN GLOBAL</span><h2>A sua comunidade pode estar mais perto.</h2><p>Procure por país, região ou localidade.</p></div>
      <button class="button button-dark" data-page="churches">Encontrar ISTN</button>
    </section>
  </main>${navigation()}`;
}

function teachings() {
  const total = state.teachingLibrary?.length || 0;
  return `${header({ title: 'Lives', back: 'home' })}<main class="page-content">
    <section class="page-intro"><span class="eyebrow">ACERVO</span><h1>Todas as pregações num só lugar.</h1><p>${total ? `${total} pregações organizadas por tipo de encontro, ano e livro bíblico.` : 'Pregações organizadas por tipo de encontro, ano e livro bíblico.'} Os vídeos abrem no YouTube.</p></section>
    <label class="search-box"><span>${icon('search')}</span><input id="teaching-search" value="${escapeHtml(state.query)}" placeholder="Pesquisar tema, título ou referência bíblica" autocomplete="off" /></label>
    ${teachingArchive()}
    <aside class="verification-note"><span>${icon('check')}</span><p><strong>Conteúdo com cuidado editorial.</strong> Referências bíblicas, resumos e informações do ministério só aparecem quando forem fornecidos e verificados.</p></aside>
  </main>${navigation()}`;
}

function sourceDetail() {
  const source = APP_CONFIG.sources.find((item) => item.id === state.selectedSource) || APP_CONFIG.sources[0];
  return `${header({ title: 'Fonte de ensino', back: 'teachings' })}<main class="detail-page">
    <img class="detail-image" src="${source.image}" alt="" />
    <section class="detail-copy"><span class="platform">${escapeHtml(source.platform)}</span><h1>${escapeHtml(source.title)}</h1><p class="source-type">${escapeHtml(source.type)} · Fonte externa</p><p>${escapeHtml(source.description || 'Este espaço organiza o acesso ao conteúdo disponível na plataforma de origem.')} Não há resumo ou referência atribuída nesta publicação porque esses dados não foram fornecidos para verificação.</p><a class="button button-dark full-width" ${link(source.url)}>Abrir no ${escapeHtml(source.platform)} <span>${icon('external')}</span></a></section>
    <section class="source-facts"><div><span>Origem</span><strong>${escapeHtml(source.platform)}</strong></div><div><span>Estado editorial</span><strong>Fonte a confirmar</strong></div></section>
    <section class="detail-related"><span class="eyebrow">CONTINUE A EXPLORAR</span><h2>Outras fontes</h2><div class="horizontal-scroll">${APP_CONFIG.sources.filter((item) => item.id !== source.id).map((item) => sourceCard(item)).join('')}</div></section>
  </main>${navigation()}`;
}

function statusBadge(status = 'needs_review') { return `<span class="status-badge ${status}">${status === 'verified' ? 'Verificado' : 'A confirmar'}</span>`; }
function churchCard(record, index) {
  const country = countryNames[record.country_code] || record.country || 'Comunidade online';
  const place = record.locality || record.country;
  return `<article class="church-card" data-church="${index}" tabindex="0" role="button"><div class="church-card-top"><span class="church-kind">${record.modality === 'online' ? 'Comunidade online' : 'Local presencial'}</span>${statusBadge(record.verification_status)}</div><h3>ISTN — ${escapeHtml(place)}</h3><p>${icon('pin')} ${escapeHtml(record.region ? `${record.region}, ${country}` : country)}</p>${record.service_day ? `<p>${icon('calendar')} ${escapeHtml(record.service_day)}, ${escapeHtml(record.service_time_local)} (hora local)</p>` : '<p>Horário a confirmar com o responsável</p>'}<div class="church-leader">${icon('user')} ${escapeHtml(record.leader_name || record.contact)}</div><span class="card-arrow">${icon('arrow')}</span></article>`;
}

function churches() {
  const directory = state.directory;
  if (!directory) return `${header({ title: 'Igrejas', back: 'home' })}<main class="page-content"><div class="loading-state"><span class="loader"></span><p>A carregar diretório ISTN…</p></div></main>${navigation()}`;
  const physical = directory.physical.map((item) => ({ ...item, category: 'physical' }));
  const online = directory.online.map((item) => ({ ...item, category: 'online' }));
  const items = [...physical, ...online].filter((record) => state.country === 'Todos' || (record.country_code ? countryNames[record.country_code] === state.country : record.country === state.country));
  const countries = ['Todos', ...new Set([...physical.map((item) => countryNames[item.country_code]), ...online.map((item) => item.country)].filter(Boolean))];
  state.directoryItems = items;
  return `${header({ title: 'Igrejas', back: 'home' })}<main class="page-content">
    <section class="page-intro"><span class="eyebrow">ISTN GLOBAL</span><h1>Encontre a sua comunidade.</h1><p>Use os registos disponíveis para entrar em contacto. Moradas e horários devem ser confirmados com o responsável.</p></section>
    <label class="search-box"><span>${icon('search')}</span><input id="church-search" placeholder="Pesquisar país, região ou localidade" autocomplete="off" /></label>
    <div class="country-select"><label for="country-filter">País</label><select id="country-filter">${countries.map((country) => `<option ${state.country === country ? 'selected' : ''}>${escapeHtml(country)}</option>`).join('')}</select></div>
    <div class="directory-summary"><strong>${items.length}</strong><span>registos operacionais</span><small>Inclui igrejas, casas de oração e comunidades online.</small></div>
    <div id="church-list" class="church-list">${items.map((record, index) => churchCard(record, index)).join('')}</div>
    <aside class="verification-note warning"><span>!</span><p><strong>Dados sujeitos a confirmação.</strong> Esta listagem vem de anúncios operacionais. Não combinámos registos semelhantes nem corrigimos nomes, telefones ou localidades.</p></aside>
  </main>${navigation()}`;
}

function churchDetail() {
  const record = state.selectedChurch;
  const country = countryNames[record.country_code] || record.country;
  const leader = record.leader_name || record.contact;
  const phone = record.leader_phone || record.phone;
  return `${header({ title: 'Comunidade ISTN', back: 'churches' })}<main class="detail-page church-detail">
    <section class="church-detail-head"><span class="round-icon">${record.modality === 'online' ? icon('globe') : icon('pin')}</span><div><span class="church-kind">${record.modality === 'online' ? 'COMUNIDADE ONLINE' : 'LOCAL PRESENCIAL'}</span><h1>ISTN — ${escapeHtml(record.locality || country)}</h1><p>${escapeHtml(record.region ? `${record.region}, ${country}` : country)}</p></div></section>
    ${statusBadge(record.verification_status)}
    <section class="info-list">
      <div><span>${icon('calendar')}</span><p><small>REUNIÃO</small><strong>${record.service_day ? `${record.service_day}, ${record.service_time_local} (hora local)` : 'Horário a confirmar'}</strong></p></div>
      <div><span>${icon('user')}</span><p><small>RESPONSÁVEL</small><strong>${escapeHtml(leader)}</strong></p></div>
      <div><span>${icon('phone')}</span><p><small>CONTACTO</small><strong>${escapeHtml(phone)}</strong></p></div>
    </section>
    <a class="button button-whatsapp full-width" ${link(toWhatsApp(phone))}>Contactar por WhatsApp <span>${icon('external')}</span></a>
    <aside class="verification-note warning"><span>!</span><p><strong>Confirme antes de se deslocar.</strong> ${escapeHtml(record.source || record.note || 'Este contacto é um registo operacional a confirmar pela equipa local.')}</p></aside>
  </main>${navigation()}`;
}

const listaDeNomes = (providers) => providers.map((provider) => provider.name)
  .reduce((texto, nome, indice, todos) => indice === 0 ? nome : `${texto}${indice === todos.length - 1 ? ' ou ' : ', '}${nome}`, '');

function churchOptionLabel(church) {
  const lugar = church.locality || church.country || 'Sem nome';
  const contexto = [church.region, countryNames[church.country_code] || church.country].filter(Boolean).join(', ');
  const tipo = church.place_type === 'casa_de_oracao' ? ' (casa de oração)' : '';
  return contexto ? `${lugar}${tipo} — ${contexto}` : `${lugar}${tipo}`;
}

function profile() {
  ensureChurchOptions();
  const head = header({ title: 'Perfil', back: 'home' });
  if (!state.profile) {
    const registar = state.authMode === 'registar';
    return `${head}<main class="page-content">
      <section class="profile-hero"><span class="round-icon">${icon('user')}</span><h1>${registar ? 'Criar conta' : 'Entrar'}</h1><p>Não precisa de conta para explorar a aplicação. A conta guarda as suas preferências em mais do que um telemóvel e permite pedir o selo de servo.</p></section>
      <form id="account-form" class="account-card">
        ${state.providers?.length ? `<p class="account-note">Com email e palavra-passe, ou por ${escapeHtml(listaDeNomes(state.providers))} — a conta é a mesma em qualquer dos casos.</p>` : ''}
        <label>Email<input type="email" name="email" autocomplete="username" required /></label>
        <label>Palavra-passe<input type="password" name="password" autocomplete="${registar ? 'new-password' : 'current-password'}" required minlength="6" /></label>
        <button class="button button-gold full-width" type="submit">${registar ? 'Criar conta' : 'Entrar'}</button>
      </form>
      ${state.providers?.length ? `<div class="account-providers">
        ${state.providers.map((provider) => `<button class="button button-outline full-width" data-provider="${provider.id}">${escapeHtml(provider.label)}</button>`).join('')}
      </div>` : ''}
      <button class="text-button account-switch" data-action="switch-auth">${registar ? 'Já tenho conta — entrar' : 'Ainda não tenho conta — registar'}</button>
    </main>${navigation()}`;
  }

  const badge = badgeFor(state.profile);
  const claim = state.profile.servo_claim_status;
  return `${head}<main class="page-content">
    <section class="profile-hero">
      <span class="round-icon">${icon('user')}</span>
      <h1 class="verified-name">${escapeHtml(badge?.name || state.profile.display_name || 'A sua conta')}${badge ? verifiedSeal(badge.role, { title: `Conta verificada · ${badge.label}` }) : ''}</h1>
      ${badge ? (badge.tier === 'neutro'
        ? `<p class="verified-line">Servo verificado · ${escapeHtml(badge.label)}${badge.church ? ` em ${escapeHtml(badge.church)}` : ''}</p>`
        : `<p class="verified-role">${escapeHtml(badge.label)}</p>`) : ''}
    </section>
    <form id="profile-form" class="account-card">
      <div class="photo-field">
        ${state.profile.photo_url ? `<img class="photo-preview" src="${escapeHtml(state.profile.photo_url)}" alt="" />` : `<span class="photo-preview empty">${icon('user')}</span>`}
        <div>
          <label class="photo-pick">${state.uploading ? 'A carregar…' : 'Escolher fotografia'}<input type="file" accept="image/jpeg,image/png,image/webp" data-upload="membros" ${state.uploading ? 'disabled' : ''} /></label>
          <small>A imagem é reduzida no telemóvel antes de ser enviada.</small>
        </div>
      </div>
      <label>Nome<input type="text" name="display_name" value="${escapeHtml(state.profile.display_name || '')}" /></label>
      <label>Telefone<input type="tel" name="phone" value="${escapeHtml(state.profile.phone || '')}" placeholder="+244 …" /></label>
      <label>País<select name="country_code">
        <option value="">— não indicar —</option>
        ${Object.entries(countryNames).map(([code, name]) => `<option value="${code}" ${state.profile.country_code === code ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}
      </select></label>
      <label>A minha ISTN<select name="home_church_id">
        <option value="">${state.churchOptions?.length ? '— ainda não escolhi —' : 'A carregar…'}</option>
        ${(state.churchOptions || []).map((church) => `<option value="${church.id}" ${state.profile.home_church_id === church.id ? 'selected' : ''}>${escapeHtml(churchOptionLabel(church))}</option>`).join('')}
      </select></label>
      <label>Idioma<select name="language">
        <option value="pt" ${state.profile.language !== 'fr' ? 'selected' : ''}>Português</option>
        <option value="fr" ${state.profile.language === 'fr' ? 'selected' : ''}>Français</option>
      </select></label>
      <label class="account-check"><input type="checkbox" name="meeting_reminders" ${state.profile.meeting_reminders === false ? '' : 'checked'} /> Quero lembretes das reuniões</label>
      <button class="button button-gold full-width" type="submit">Guardar</button>
    </form>
    <section class="account-card">
      <h2>Selo de servo</h2>
      ${badge
        ? `<p>A sua conta está verificada como <strong>${escapeHtml(badge.label)}</strong>${badge.isMinister ? ', função de ministro' : ''}. O seu nome aparece como <strong>${escapeHtml(badge.name)}</strong>.</p>`
        : claim === 'pendente'
          ? '<p>O seu pedido está a aguardar aprovação da equipa ISTN-SJ.</p>'
          : `<p>Se serve na ISTN, peça o selo. ${claim === 'recusado' ? 'O pedido anterior não foi aprovado; pode voltar a pedir.' : 'A equipa confirma antes de o atribuir — ninguém se verifica a si próprio.'}</p>
             <button class="button button-outline full-width" data-action="request-badge">Pedir verificação</button>`}
    </section>
    <button class="text-button account-switch" data-action="signout">Terminar sessão</button>
  </main>${navigation()}`;
}

function render() {
  const pages = { home, teachings, sourceDetail, live, churches, churchDetail, profile };
  app.innerHTML = pages[state.page]();
  bindPage();
}

function showToast(message) { const toast = document.createElement('div'); toast.className = 'toast'; toast.textContent = message; document.body.append(toast); setTimeout(() => toast.remove(), 3200); }
function go(page) { state.page = page; window.scrollTo({ top: 0, behavior: 'instant' }); render(); }

// The church list is only needed once a member is signed in, and is needed
// however they got there — navigating to the profile, signing in while already
// on it, or returning with a restored session.
function ensureChurchOptions() {
  if (!state.profile || state.churchOptions) return;
  state.churchOptions = [];
  loadChurchOptions().then((churches) => { state.churchOptions = churches; render(); }).catch(() => {});
}
function bindPage() {
  app.querySelectorAll('[data-page]').forEach((element) => element.addEventListener('click', () => go(element.dataset.page)));
  app.querySelectorAll('[data-source]').forEach((element) => { const open = () => { state.selectedSource = element.dataset.source; go('sourceDetail'); }; element.addEventListener('click', open); element.addEventListener('keydown', (event) => { if (event.key === 'Enter') open(); }); });
  document.querySelectorAll('[data-provider]').forEach((element) => element.addEventListener('click', () => {
    signInWithProvider(element.dataset.provider).catch((error) => showToast(error.message));
  }));

  document.querySelector('[data-action="switch-auth"]')?.addEventListener('click', () => {
    state.authMode = state.authMode === 'registar' ? 'entrar' : 'registar'; render();
  });

  document.querySelector('#account-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const { email, password } = Object.fromEntries(new FormData(event.target).entries());
    try {
      const session = state.authMode === 'registar' ? await register(email, password) : await signIn(email, password);
      if (!session) { showToast('Conta criada. Confirme o email antes de entrar.'); state.authMode = 'entrar'; render(); return; }
      state.session = session;
      state.profile = await loadProfile(session);
      ensureChurchOptions();
      render();
      showToast('Sessão iniciada.');
    } catch (error) { showToast(error.message); }
  });

  document.querySelectorAll('[data-upload]').forEach((input) => input.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    state.uploading = true; render();
    try {
      const url = await uploadPhoto(file, event.target.dataset.upload, state.session.user.id, state.session);
      state.profile = await saveProfile({ photo_url: url }) || state.profile;
      showToast('Fotografia atualizada.');
    } catch (error) { showToast(error.message); }
    finally { state.uploading = false; render(); }
  }));

  document.querySelector('#profile-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target).entries());
    try {
      state.profile = await saveProfile({
        display_name: values.display_name?.trim() || null,
        phone: values.phone?.trim() || null,
        country_code: values.country_code || null,
        home_church_id: values.home_church_id || null,
        language: values.language || 'pt',
        meeting_reminders: !!values.meeting_reminders
      }) || state.profile;
      render();
      showToast('Preferências guardadas.');
    } catch (error) { showToast(error.message); }
  });

  document.querySelector('[data-action="request-badge"]')?.addEventListener('click', async () => {
    try {
      state.profile = await requestServantBadge() || state.profile;
      state.profile = await loadProfile();
      render();
      showToast('Pedido enviado. A equipa ISTN-SJ vai confirmar.');
    } catch (error) { showToast(error.message); }
  });

  document.querySelector('[data-action="signout"]')?.addEventListener('click', () => {
    signOut(); state.session = null; state.profile = null; render(); showToast('Sessão terminada.');
  });

  app.querySelectorAll('[data-action="reminder"]').forEach((element) => element.addEventListener('click', downloadReminder));
  app.querySelectorAll('[data-action="retry-meetings"]').forEach((element) => element.addEventListener('click', refreshMeetings));
  app.querySelectorAll('[data-share]').forEach((element) => element.addEventListener('click', () => {
    const teaching = state.teachingLibrary?.find((item) => item.id === element.dataset.share);
    if (teaching) shareTeaching(teaching);
  }));
  app.querySelectorAll('[data-action="preferences"]').forEach((element) => element.addEventListener('click', () => showToast('As preferências serão guardadas numa próxima versão.')));
  const teachingSearch = document.querySelector('#teaching-search'); if (teachingSearch) teachingSearch.addEventListener('input', (event) => { state.query = event.target.value; state.teachingPage = 1; render(); document.querySelector('#teaching-search')?.focus(); });
  app.querySelectorAll('[data-category]').forEach((element) => element.addEventListener('click', () => { state.category = element.dataset.category; state.teachingPage = 1; render(); }));
  app.querySelectorAll('[data-clear-filters]').forEach((element) => element.addEventListener('click', () => { Object.assign(state, { category: 'Todas', year: 'Todos', book: 'Todos', query: '', teachingPage: 1 }); render(); }));
  app.querySelectorAll('[data-sort]').forEach((element) => element.addEventListener('click', () => { state.sort = element.dataset.sort; state.teachingPage = 1; render(); }));
  const archiveYearFilter = document.querySelector('#archive-year-filter'); if (archiveYearFilter) archiveYearFilter.addEventListener('change', (event) => { state.year = event.target.value; state.teachingPage = 1; render(); });
  const archiveBookFilter = document.querySelector('#archive-book-filter'); if (archiveBookFilter) archiveBookFilter.addEventListener('change', (event) => { state.book = event.target.value; state.teachingPage = 1; render(); });
  app.querySelectorAll('[data-show-more]').forEach((element) => element.addEventListener('click', () => { state.teachingPage += 1; render(); }));
  const countryFilter = document.querySelector('#country-filter'); if (countryFilter) countryFilter.addEventListener('change', (event) => { state.country = event.target.value; render(); });
  const churchSearch = document.querySelector('#church-search'); if (churchSearch) churchSearch.addEventListener('input', (event) => { const text = event.target.value.toLowerCase(); const cards = document.querySelectorAll('.church-card'); cards.forEach((card) => { const item = state.directoryItems[Number(card.dataset.church)]; card.hidden = !JSON.stringify(item).toLowerCase().includes(text); }); });
  app.querySelectorAll('[data-church]').forEach((element) => { const open = () => { state.selectedChurch = state.directoryItems[Number(element.dataset.church)]; go('churchDetail'); }; element.addEventListener('click', open); element.addEventListener('keydown', (event) => { if (event.key === 'Enter') open(); }); });
}

loadDirectory().then((directory) => { state.directory = directory; render(); }).catch(() => { state.directory = { physical: [], online: [] }; render(); showToast('Não foi possível carregar o diretório neste momento.'); });
function refreshMeetings() {
  state.meetingsError = false;
  return loadMeetings()
    .then((meetings) => { state.meetings = meetings; })
    .catch(() => { state.meetingsError = true; })
    .finally(render);
}
refreshMeetings();
availableProviders().then((providers) => { state.providers = providers; render(); }).catch(() => {});
finishSocialSignIn()
  .catch((error) => { showToast(error.message); return null; })
  .then((social) => {
    const session = social || readSession();
    if (!session) return;
    state.session = session;
    if (social) state.page = 'profile';
    return loadProfile(session)
      .then((profile) => { state.profile = profile; ensureChurchOptions(); render(); })
      .catch(() => { state.session = null; });
  });
loadTeachingLibrary().then((teachings) => { state.teachingLibrary = teachings; render(); }).catch(() => { showToast('Não foi possível carregar o acervo Youtube.'); });
// allSettled, not all: one channel failing must not discard the other's videos.
Promise.allSettled(APP_CONFIG.sources.filter((source) => source.channelId).map(async (source) => [source.channelId, await loadLatestVideos(source.channelId)]))
  .then((results) => { state.latestVideos = Object.fromEntries(results.filter((result) => result.status === 'fulfilled').map((result) => result.value)); })
  .finally(() => { state.videosLoading = false; render(); });
render();
