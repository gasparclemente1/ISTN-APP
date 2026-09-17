// Pieces every page is built from: the top bar, the bottom navigation, and the
// loading, error and empty states — each worded so the reader knows what
// happened and what they can do about it.
import { escapeHtml, safeUrl } from '../html.js';
import { icon } from '../icons.js';
import { pathFor } from '../router.js';
import { zonedDateParts } from '../meetings.js';

// Confirmed with the ISTN-SJ team: every announced time is Luanda time.
export const TIME_ZONE = 'Africa/Luanda';
export const userZone = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return TIME_ZONE; }
})();
export const showBothZones = () => Boolean(userZone) && userZone !== TIME_ZONE;

// Set before each render, so the top bar can show who is signed in without
// every view having to pass the profile down.
let account = null;
export function setAccount(next) { account = next; }

function accountAvatar() {
  if (!account) return '';
  const initials = String(account.display_name || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '·';
  const photo = safeUrl(account.photo_url);
  return `<a class="topbar-avatar" href="/perfil" aria-label="A sua conta: ${escapeHtml(account.display_name || 'sem nome')}">${photo
    ? `<img src="${escapeHtml(photo)}" alt="" />`
    : `<span>${escapeHtml(initials)}</span>`}</a>`;
}

const NAV = [
  ['home', 'home', 'Início'],
  ['teachings', 'book', 'Ensinos'],
  ['live', 'live', 'Ao vivo'],
  ['churches', 'church', 'Igrejas'],
  ['profile', 'user', 'Perfil']
];

// Which tab a page belongs to: a church's detail lives under Igrejas.
const SECTION = { source: 'teachings', church: 'churches' };

export function header({ title = '', back = '', action = '' } = {}) {
  const backPath = back ? pathFor(back) : '';
  return `<a class="skip-link" href="#conteudo">Saltar para o conteúdo</a>
  <header class="topbar ${title ? 'has-title' : ''}">
    <a class="brand" href="/" aria-label="ELIAS · ISTN-SJ — página inicial"><span class="brand-sun">${icon('sun', { size: 16 })}</span><span class="brand-name">ELIAS <small>ISTN-SJ</small></span></a>
    ${title ? `<div class="page-title">${backPath ? `<a class="icon-button" href="${backPath}" aria-label="Voltar">${icon('arrowLeft', { size: 22 })}</a>` : ''}<span>${escapeHtml(title)}</span></div>` : ''}
    <div class="topbar-action">${action}${accountAvatar()}</div>
  </header>`;
}

export function navigation(routeName) {
  const current = SECTION[routeName] || routeName;
  return `<nav class="bottom-nav" aria-label="Navegação principal">${NAV.map(([name, iconName, label]) => `
    <a class="nav-item" href="${pathFor(name)}" ${current === name ? 'aria-current="page"' : ''}>${icon(iconName, { size: 22 })}<span>${label}</span></a>`).join('')}
  </nav>`;
}

export function page(routeName, { title, back, action, mainClass = 'page-content', body }) {
  return `${header({ title, back, action })}<main id="conteudo" class="${mainClass}" tabindex="-1">${body}</main>${navigation(routeName)}`;
}

export function statusBadge(status) {
  return status === 'verified'
    ? `<span class="status-badge verified">${icon('check', { size: 12 })}Verificado</span>`
    : `<span class="status-badge needs_review">${icon('clock', { size: 12 })}A confirmar</span>`;
}

export const loadingState = (message) => `<div class="state-box" role="status"><span class="loader" aria-hidden="true"></span><p>${escapeHtml(message)}</p></div>`;

export function errorState(message, retryAction) {
  return `<div class="state-box is-error">${icon('alert', { size: 26 })}<p>${escapeHtml(message)}</p>${retryAction ? `<button class="button button-outline" type="button" data-action="${retryAction}">${icon('refresh', { size: 18 })}Tentar de novo</button>` : ''}</div>`;
}

export function emptyState({ title, text, action = '' }) {
  return `<div class="empty-state">${icon('search', { size: 30 })}<h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p>${action}</div>`;
}

export function sectionHeading(eyebrow, title, link = '') {
  return `<div class="section-heading"><div><span class="eyebrow">${escapeHtml(eyebrow)}</span><h2>${escapeHtml(title)}</h2></div>${link}</div>`;
}

// ---------------------------------------------------------------- tempo ----

export function formatInZone(date, timeZone = TIME_ZONE) {
  return new Intl.DateTimeFormat('pt-PT', { timeZone, hour: '2-digit', minute: '2-digit' }).format(date);
}

// Only inside 24 hours; beyond that the day label already says it.
export function countdownLabel(start, now = new Date()) {
  const minutes = Math.max(0, Math.round((start - now) / 60000));
  if (minutes < 1) return 'Começa agora';
  if (minutes < 60) return `Começa em ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `Começa em ${hours} h ${String(minutes % 60).padStart(2, '0')} min` : '';
}

export function relativeDayLabel(start, now = new Date()) {
  const startDay = zonedDateParts(start, TIME_ZONE);
  const today = zonedDateParts(now, TIME_ZONE);
  const diff = Math.round((Date.UTC(startDay.year, startDay.month - 1, startDay.day) - Date.UTC(today.year, today.month - 1, today.day)) / 86400000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  const label = new Intl.DateTimeFormat('pt-PT', { timeZone: TIME_ZONE, weekday: 'long', ...(diff > 6 ? { day: 'numeric', month: 'short' } : {}) }).format(start);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export const externalHint = '<span class="sr-only"> (abre noutra janela)</span>';
