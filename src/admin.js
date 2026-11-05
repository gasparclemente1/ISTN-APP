import { WEEKDAY_LABELS, recurrenceLabel } from './meetings.js';
import { uploadPhoto, uploadAudio, audioDuration, AUDIO_TYPES } from './upload.js';
import { badgeTier, isMinisterRole, quietCheck, roleLabel, rolesForGender, servantName, verifiedSeal } from './roles.js';
import { ISTN_COUNTRIES, countryList, countryName } from './countries.js';
import { DEFAULT_COUNTRY, phoneControl, phoneFromFields, phoneFromValues } from './phones.js';
import { escapeHtml, safeUrl } from './html.js';
import { slugify } from './text.js';
import { renderInto } from './dom.js';
import { PUBLISH_SCOPES, authorName, formatPostDate } from './posts.js';
import { formatDuration, normalizePrayer, normalizeThemes, sortPrayers } from './prayers.js';
import { matchesRecord, recordPage, readAllPages, sortRecords } from './admin-records.js';
import { setLanguage } from './i18n.js';
import { SEAT_LABELS, normalizeChurch, sharedPhones } from './directory.js';

// The administration is Portuguese; do not overwrite the member app's saved language.
setLanguage('pt', { remember: false });

const root = document.querySelector('#admin');
const SESSION_KEY = 'elias-admin-session';

const state = {
  config: null, session: null, profile: null,
  lists: {}, feedTab: 'publications', dirty: false,
  view: 'meetings', meetings: null, churches: null, claims: null,
  editing: null, meeting: null, servo: null, uploading: false,
  servos: null, services: null, busy: false,
  audit: null, auditNames: {}, auditTable: '', auditHasMore: false,
  posts: null, postComments: null, postAuthors: null, publishers: null, communities: null,
  prayers: null, prayerThemes: null, prayerDraft: null, prayerUploading: false
};

function readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
function writeSession(session) {
  try { session ? localStorage.setItem(SESSION_KEY, JSON.stringify(session)) : localStorage.removeItem(SESSION_KEY); } catch { /* modo privado */ }
  state.session = session;
}

function toast(message, tone = 'ok') {
  const element = document.createElement('div');
  element.className = `toast admin-toast ${tone}`;
  element.setAttribute('role', tone === 'erro' ? 'alert' : 'status');
  element.textContent = message;
  document.body.append(element);
  setTimeout(() => element.remove(), 3600);
}

// ------------------------------------------------------------------ rede ---

async function authRequest(grant, body) {
  const response = await fetch(`${state.config.supabaseUrl}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST',
    headers: { apikey: state.config.supabaseKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    // Not JSON means the request never reached Supabase — almost always a
    // misconfigured SUPABASE_URL pointing somewhere that is not the project.
    if (payload === null) throw new Error(`A ligação ao Supabase está mal configurada (${state.config.supabaseUrl} respondeu ${response.status}).`);
    const reason = payload.error_description || payload.msg || payload.error || '';
    if (/invalid login credentials/i.test(reason)) throw new Error('Email ou palavra-passe incorretos.');
    if (/email not confirmed/i.test(reason)) throw new Error('Confirme o email antes de entrar.');
    throw new Error(reason || 'Não foi possível entrar.');
  }
  return payload;
}

async function rest(path, options = {}, retry = true) {
  const response = await fetch(`${state.config.supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: state.config.supabaseKey,
      Authorization: `Bearer ${state.session?.access_token || state.config.supabaseKey}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  if (response.status === 401 && retry && state.session?.refresh_token) {
    try {
      writeSession(await authRequest('refresh_token', { refresh_token: state.session.refresh_token }));
      return rest(path, options, false);
    } catch {
      writeSession(null);
      throw new Error('A sessão expirou. Entre novamente.');
    }
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.message || `A base de dados respondeu ${response.status}.`);
  }
  // return=minimal answers 201 with an empty body, which is not JSON.
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// ------------------------------------------------------------------ dados --

async function loadProfile() {
  const rows = await rest(`admin_profiles?select=id,full_name,role,church_id&id=eq.${state.session.user.id}`);
  if (!rows[0]) throw new Error('Esta conta não tem acesso à administração. Peça acesso à equipa central.');
  state.profile = rows[0];
}

async function loadMeetings() {
  state.meetings = await rest('meetings?select=*&order=kind.asc,sort_order.asc');
}

async function loadChurches() {
  state.churches = await readAllPages(rest, 'churches?select=*&order=country_code.asc,region.asc,locality.asc,id.asc');
}

// The requests waiting on the team. Row level security only shows the central
// team members who asked for something, never the rest of the congregation.
async function loadClaims() {
  state.claims = isCentral()
    ? await readAllPages(rest, 'app_users?select=id,display_name,photo_url,gender,phone,country_code,city,home_church_id,claimed_role,updated_at&servo_claim_status=eq.pendente&order=updated_at.asc,id.asc')
    : [];
}

// Phone numbers live apart from servos since migration 007, readable only by
// the team. Joined here so the editor works with one record per servant.
async function loadServos() {
  const [servos, contacts] = await Promise.all([
    readAllPages(rest, 'servos?select=*&order=role.asc,full_name.asc,id.asc'),
    readAllPages(rest, 'servo_contacts?select=servo_id,phone,phone_public&order=servo_id.asc').catch(() => [])
  ]);
  const byServo = new Map(contacts.map((contact) => [contact.servo_id, contact]));
  state.servos = servos.map((servo) => ({ ...servo, phone: byServo.get(servo.id)?.phone ?? servo.phone ?? null, phone_public: Boolean(byServo.get(servo.id)?.phone_public) }));
}

async function saveServoPhone(servoId, phone) {
  if (phone) {
    await rest('servo_contacts?on_conflict=servo_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ servo_id: servoId, phone })
    });
  } else {
    await rest(`servo_contacts?servo_id=eq.${servoId}`, { method: 'DELETE' });
  }
}

async function loadServices(churchId) {
  state.services = await rest(`church_services?select=*&church_id=eq.${churchId}&order=weekday.asc,start_time.asc`);
}

// The change history, newest first. Members' own rows (app_users) are left
// out on purpose: the team sees a member's data only through the claims it has
// to act on, not by browsing what people changed on their profiles.
const AUDIT_PAGE = 40;
async function loadAudit({ more = false } = {}) {
  const offset = more ? state.audit.length : 0;
  const table = state.auditTable ? `&table_name=eq.${encodeURIComponent(state.auditTable)}` : '&table_name=neq.app_users';
  const rows = await rest(`audit_log?select=id,table_name,record_id,action,changed_by,changed_at,old_value,new_value${table}&order=changed_at.desc&limit=${AUDIT_PAGE + 1}&offset=${offset}`);
  state.auditHasMore = rows.length > AUDIT_PAGE;
  state.audit = [...(more ? state.audit : []), ...rows.slice(0, AUDIT_PAGE)];
  const unknown = [...new Set(state.audit.map((row) => row.changed_by).filter((id) => id && !(id in state.auditNames)))];
  if (unknown.length) {
    const people = await rest(`admin_profiles?select=id,full_name&id=in.(${unknown.join(',')})`).catch(() => []);
    unknown.forEach((id) => { state.auditNames[id] = people.find((person) => person.id === id)?.full_name || 'Conta sem perfil de equipa'; });
  }
}

// Announcements, the comments on them, and who was granted the right to
// publish. A local editor sees and moderates only their own church's.
async function loadFeed() {
  const [posts, comments, authors, communities] = await Promise.all([
    readAllPages(rest, 'posts?select=id,title,body,church_id,community_id,highlighted,highlight_until,hidden,published_at,author_id&order=published_at.desc,id.asc'),
    readAllPages(rest, 'post_comments?select=id,post_id,author_id,body,hidden,created_at&order=created_at.desc,id.asc'),
    readAllPages(rest, 'post_authors?select=id,display_name,photo_url,servo_role,verified&order=id.asc').catch(() => []),
    rest('communities?select=id,name,short_name&order=sort_order.asc').catch(() => [])
  ]);
  state.posts = posts;
  state.postComments = comments;
  state.postAuthors = new Map((authors || []).map((author) => [author.id, author]));
  state.communities = communities || [];
}

async function loadPublishers() {
  state.publishers = isCentral()
    ? await readAllPages(rest, 'app_users?select=id,display_name,publish_scope,home_church_id,servo_id&servo_claim_status=eq.aprovado&order=display_name.asc,id.asc')
    : [];
}

const isCentral = () => state.profile?.role === 'central';

// ----------------------------------------------------------------- vistas --

function loginView() {
  return `<main class="admin-login">
    <div class="admin-login-card">
      <span class="brand-sun">✦</span>
      <h1>Administração</h1>
      <p>Área reservada à equipa ISTN-SJ.</p>
      <form id="login-form">
        <label>Email<input type="email" name="email" autocomplete="username" required /></label>
        <label>Palavra-passe<input type="password" name="password" autocomplete="current-password" required /></label>
        <button class="button button-gold full-width" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'A entrar…' : 'Entrar'}</button>
      </form>
      <a class="text-button" href="/">← Voltar à aplicação</a>
    </div>
  </main>`;
}

function listState(key) {
  return state.lists[key] ||= { query: '', country: '', status: '', role: '', church: '', theme: '', sort: 'name', page: 1, size: 25 };
}
function listInput(key, placeholder) {
  return `<label class="search-box"><span aria-hidden="true">⌕</span><input type="search" id="${key}-query" data-list="${key}" data-field="query" value="${escapeHtml(listState(key).query)}" aria-label="Pesquisar ${placeholder}" placeholder="${escapeHtml(placeholder)}" autocomplete="off" /></label>`;
}
function listSelect(key, field, title, options) {
  return `<label>${title}<select id="${key}-${field}" data-list="${key}" data-field="${field}">${options.map(([id, name]) => `<option value="${escapeHtml(id)}" ${String(listState(key)[field]) === String(id) ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select></label>`;
}
function countriesFilter(key, rows) {
  const codes = [...new Set(rows.map((r) => r.country_code).filter(Boolean))];
  return listSelect(key, 'country', 'País', [['', 'Todos os países'], ...codes.map((c) => [c, countryName(c)]).sort((a, b) => a[1].localeCompare(b[1], 'pt'))]);
}
function resetFilters(key) {
  return `<button class="text-button" type="button" data-reset-list="${key}">Limpar filtros</button>`;
}
function emptyResults(key) {
  return `<div class="admin-empty"><strong>Nenhum registo encontrado</strong><p>Experimente outro nome ou ajuste os filtros.</p>${resetFilters(key)}</div>`;
}
function pager(key, total, top = false) {
  const prefs = listState(key);
  const page = recordPage(Array(total), prefs.page, prefs.size);
  prefs.page = page.page;
  if (top) return `<div class="admin-pagination admin-results-top"><span role="status">${page.from}–${page.to} de ${total} registos</span><div class="admin-page-buttons"><button class="button button-outline" type="button" data-page-list="${key}" data-page="${page.page - 1}" ${page.page === 1 ? 'disabled' : ''} aria-label="Página anterior">←</button><span>${page.page} / ${page.pages}</span><button class="button button-outline" type="button" data-page-list="${key}" data-page="${page.page + 1}" ${page.page === page.pages ? 'disabled' : ''} aria-label="Página seguinte">→</button></div></div>`;
  return `<div class="admin-pagination"><span>${page.from}–${page.to} de ${total} registos</span>
    ${listSelect(key, 'size', 'Por página', [[25, '25'], [50, '50'], [100, '100']])}
    <div class="admin-page-buttons"><button class="button button-outline" type="button" data-page-list="${key}" data-page="${page.page - 1}" ${page.page === 1 ? 'disabled' : ''} aria-label="Página anterior">← Anterior</button>
    <span>Página ${page.page} de ${page.pages}</span><button class="button button-outline" type="button" data-page-list="${key}" data-page="${page.page + 1}" ${page.page === page.pages ? 'disabled' : ''} aria-label="Página seguinte">Seguinte →</button></div></div>`;
}
const pageRows = (key, rows) => recordPage(rows, listState(key).page, listState(key).size).rows;
function pageHeader(title, description, action = '') {
  return `<div class="admin-section-heading"><div><h1>${title}</h1><p class="admin-hint">${description}</p></div><div class="admin-heading-actions">${action}<button class="button button-outline" type="button" data-action="refresh" ${state.busy ? 'disabled' : ''}>Actualizar</button></div></div>`;
}

function shell(content) {
  const role = isCentral() ? 'Equipa central' : 'Editor local';
  const pending = state.claims?.length || 0;
  const tabs = [['meetings', 'Reuniões'], ['churches', 'Diretório'], ['servos', 'Servos'], ['posts', 'Anúncios'], ['prayers', 'Orações'], ['claims', 'Pedidos'], ['history', 'Histórico']]
    .filter(([id]) => !['meetings', 'claims', 'history'].includes(id) || isCentral())
    .map(([id, label]) => `<button class="admin-tab ${state.view === id ? 'selected' : ''}" data-view="${id}" aria-current="${state.view === id ? 'page' : 'false'}">${label}${id === 'claims' && pending ? `<span class="tab-count">${pending}</span>` : ''}</button>`).join('');
  return `<a class="skip-link" href="#admin-content">Saltar para o conteúdo</a><header class="admin-bar">
      <div><strong>ISTN-SJ · Administração</strong><small>${escapeHtml(state.profile?.full_name || state.session.user.email)} · ${role}</small></div>
      <div class="admin-bar-actions"><a class="text-button" href="/">Ver aplicação</a><button class="button button-outline" data-action="signout">Sair</button></div>
    </header>
    <nav class="admin-tabs" aria-label="Áreas da administração">${tabs}</nav>
    <main class="admin-main" id="admin-content" tabindex="-1">${content}</main>`;
}

const RECURRENCES = [
  ['weekly', 'Semanal — em dias fixos da semana'],
  ['monthly_last', 'Mensal — no último dia da semana escolhido'],
  ['yearly', 'Anual — sempre na mesma data'],
  ['once', 'Apenas uma vez — numa data']
];

function meetingsView() {
  if (!isCentral()) return '<p class="admin-empty">Só a equipa central pode alterar as reuniões.</p>';
  if (!state.meetings) return '<p class="admin-empty">A carregar…</p>';
  const group = (kind, title, hint) => {
    const rows = state.meetings.filter((meeting) => meeting.kind === kind);
    return `<h3>${title}</h3><p class="admin-hint">${hint}</p>
      <ul class="admin-list">${rows.map((meeting) => `<li>
        <button data-meeting="${meeting.id}">
          <span>
            <strong>${escapeHtml(meeting.title)}${meeting.active ? '' : ' · inativa'}</strong>
            <small>${escapeHtml(recurrenceLabel(meeting))} · ${escapeHtml(meeting.start_time ? meeting.start_time.slice(0, 5) : meeting.time_note || 'sem hora')}</small>
          </span>
          <span class="status-badge ${meeting.zoom_url ? 'verified' : 'needs_review'}">${meeting.zoom_url ? 'Zoom definido' : 'Sem Zoom'}</span>
        </button>
      </li>`).join('') || '<li class="admin-empty">Nenhuma reunião.</li>'}</ul>`;
  };
  return `<div class="admin-card">
    ${pageHeader('Reuniões', 'Horários na hora de Luanda. Use uma descrição quando não houver hora fixa.', '<button class="button button-gold" data-action="new-meeting">+ Adicionar reunião</button>')}
    ${group('geral', 'Reuniões gerais', 'As reuniões convencionais, abertas a toda a igreja.')}
    ${group('especial', 'Reuniões especiais', 'Ministros, crianças, vigílias e quaisquer outras.')}
  </div>`;
}

function meetingEditor() {
  const meeting = state.meeting;
  const isNew = !meeting.id;
  const weekdays = (meeting.weekdays || []).map(Number);
  return `<div class="admin-overlay"><form id="meeting-form" class="admin-card admin-dialog">
    <h2>${isNew ? 'Nova reunião' : escapeHtml(meeting.title)}</h2>
    <label>Título<input type="text" name="title" value="${escapeHtml(meeting.title || '')}" required /></label>
    <div class="admin-row">
      <label>Tipo<select name="kind">
        <option value="geral" ${meeting.kind === 'geral' ? 'selected' : ''}>Geral (convencional)</option>
        <option value="especial" ${meeting.kind !== 'geral' ? 'selected' : ''}>Especial</option>
      </select></label>
      <label>Hora de início<input type="time" name="start_time" value="${escapeHtml((meeting.start_time || '').slice(0, 5))}" /></label>
    </div>
    <label>Se não tiver hora fixa, explique quando começa<input type="text" name="time_note" value="${escapeHtml(meeting.time_note || '')}" placeholder="Ex.: Após a live dos ministros" /></label>
    <h3>Quando se repete</h3>
    <label>Recorrência<select name="recurrence" id="recurrence-select">
      ${RECURRENCES.map(([id, label]) => `<option value="${id}" ${meeting.recurrence === id ? 'selected' : ''}>${label}</option>`).join('')}
    </select></label>
    <fieldset class="admin-weekdays" data-when="weekly monthly_last">
      <legend>Dias da semana</legend>
      ${WEEKDAY_LABELS.map((label, index) => `<label class="admin-check"><input type="checkbox" name="weekday" value="${index}" ${weekdays.includes(index) ? 'checked' : ''} /> ${label}</label>`).join('')}
    </fieldset>
    <label data-when="yearly once">Data<input type="date" name="event_date" value="${escapeHtml(meeting.event_date || '')}" /></label>
    <h3>Sala do Zoom</h3>
    <label>Link<input type="url" name="zoom_url" value="${escapeHtml(meeting.zoom_url || '')}" placeholder="https://us02web.zoom.us/j/..." /></label>
    <div class="admin-row">
      <label>ID da reunião<input type="text" name="zoom_meeting_id" value="${escapeHtml(meeting.zoom_meeting_id || '')}" /></label>
      <label>Senha<input type="text" name="zoom_passcode" value="${escapeHtml(meeting.zoom_passcode || '')}" /></label>
    </div>
    <label class="admin-check"><input type="checkbox" name="active" ${meeting.active === false ? '' : 'checked'} /> Visível na aplicação</label>
    <div class="admin-dialog-actions">
      ${isNew ? '' : '<button class="button button-outline admin-danger" type="button" data-action="delete-meeting">Eliminar</button>'}
      <button class="button button-outline" type="button" data-action="cancel-meeting">Cancelar</button>
      <button class="button button-gold" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'A guardar…' : isNew ? 'Criar reunião' : 'Guardar'}</button>
    </div>
  </form></div>`;
}

const churchLabel = (id) => {
  const church = state.churches?.find((item) => item.id === id);
  return church ? (church.name || church.locality || church.country || 'Sem nome') : 'Sem igreja';
};

function claimsView() {
  if (!isCentral()) return '<p class="admin-empty">Só a equipa central trata pedidos de verificação.</p>';
  if (!state.claims) return '<p class="admin-empty">A carregar…</p>';
  const churches = state.churches || [];
  const servos = state.servos || [];
  const card = (claim) => {
    const church = churches.find((item) => item.id === claim.home_church_id);
    // Existing records this person might already be: same church and role
    // first, then same church. Linking avoids creating a duplicate servant.
    const candidates = servos
      .filter((servo) => servo.church_id === claim.home_church_id)
      .sort((a, b) => (b.role === claim.claimed_role) - (a.role === claim.claimed_role));
    const since = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short' }).format(new Date(claim.updated_at));
    return `<article class="claim-card">
      <div class="claim-head">
        ${safeUrl(claim.photo_url) ? `<img class="claim-photo" src="${escapeHtml(safeUrl(claim.photo_url))}" alt="" />` : `<span class="claim-photo empty">${escapeHtml((claim.display_name || '?').trim().charAt(0).toUpperCase())}</span>`}
        <div>
          <strong>${escapeHtml(claim.display_name || 'Sem nome')}</strong>
          <small>Pede: <b>${escapeHtml(roleLabel(claim.claimed_role))}</b>${isMinisterRole(claim.claimed_role) ? ' · ministro' : ''} · desde ${since}</small>
        </div>
      </div>
      <dl class="claim-facts">
        <div><dt>Igreja</dt><dd>${escapeHtml(church ? (church.name || church.locality || church.country) : '—')}${church?.region ? `, ${escapeHtml(church.region)}` : ''}</dd></div>
        <div><dt>Género</dt><dd>${escapeHtml({ masculino: 'Masculino', feminino: 'Feminino' }[claim.gender] || '—')}</dd></div>
        <div><dt>Telefone</dt><dd>${escapeHtml(claim.phone || '—')}</dd></div>
        <div><dt>Onde vive</dt><dd>${escapeHtml([claim.city, countryName(claim.country_code)].filter(Boolean).join(', ') || '—')}</dd></div>
      </dl>
      <label class="claim-link">Ligar a um servo já registado
        <select data-claim-servo="${claim.id}">
          <option value="">— Criar um registo novo com estes dados —</option>
          ${candidates.map((servo) => `<option value="${servo.id}">${escapeHtml(servantName(servo))} · ${escapeHtml(roleLabel(servo.role))}</option>`).join('')}
        </select>
      </label>
      <div class="claim-actions">
        <button class="button button-outline admin-danger" data-claim-reject="${claim.id}" ${state.busy ? 'disabled' : ''}>Recusar</button>
        <button class="button button-gold" data-claim-approve="${claim.id}" ${state.busy ? 'disabled' : ''}>Aprovar</button>
      </div>
    </article>`;
  };
  return `<div class="admin-card">
    ${pageHeader('Pedidos de verificação', `${state.claims.length} pedidos pendentes · Confirme com a igreja antes de aprovar.`)}
    <div class="admin-toolbar">${listInput('claims', 'Nome, igreja, cidade ou telefone')}${countriesFilter('claims', state.claims)}${resetFilters('claims')}</div>
    ${(() => { const prefs = listState('claims'); const rows = state.claims.filter((c) => (!prefs.country || c.country_code === prefs.country) && matchesRecord([c.display_name, c.city, churchLabel(c.home_church_id), c.phone], [c.phone], prefs.query)); return `${pager('claims', rows.length, true)}<div class="claim-list">${pageRows('claims', rows).map(card).join('') || emptyResults('claims')}</div>${pager('claims', rows.length)}`; })()}
  </div>`;
}

const TABLE_LABELS = { churches: 'Igreja', church_services: 'Horário de culto', meetings: 'Reunião', servos: 'Servo', servo_contacts: 'Contacto de servo', live_config: 'Configuração antiga' };
const ACTION_LABELS = { insert: 'criou', update: 'alterou', delete: 'eliminou' };
const IGNORED_FIELDS = new Set(['id', 'updated_at', 'created_at', 'church_id', 'servo_id', 'verified_by']);
const FIELD_LABELS = {
  title: 'Título', kind: 'Tipo', start_time: 'Hora de início', time_note: 'Explicação da hora', recurrence: 'Recorrência',
  weekdays: 'Dias da semana', event_date: 'Data', zoom_url: 'Link do Zoom', zoom_meeting_id: 'ID do Zoom', zoom_passcode: 'Senha do Zoom',
  name: 'Nome da igreja', active: 'Ativo', sort_order: 'Ordem', place_type: 'Tipo de lugar', became_church_on: 'Passou a igreja em', locality: 'Localidade',
  region: 'Região', address: 'Endereço', leader_name: 'Responsável', leader_phone: 'Telefone', whatsapp_group_url: 'Grupo de WhatsApp',
  seat: 'Sede', other_leaders: 'Outros responsáveis', photo_url: 'Fotografia', note: 'Nota', verification_status: 'Verificação', verified_at: 'Verificado em', full_name: 'Nome',
  gender: 'Género', role: 'Função', phone: 'Telefone', weekday: 'Dia', label: 'Descrição'
};

function recordName(row) {
  const value = row.new_value || row.old_value || {};
  return value.title || value.full_name || value.name || value.locality || value.country || (value.weekday !== undefined ? WEEKDAY_LABELS[value.weekday] : '') || value.phone || row.record_id;
}

const shown = (value) => (value === null || value === undefined || value === '' ? '—' : Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? JSON.stringify(value) : String(value));

function changedFields(row) {
  const before = row.old_value || {};
  const after = row.new_value || {};
  if (row.action !== 'update') return [];
  return Object.keys(after)
    .filter((key) => !IGNORED_FIELDS.has(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => ({ key: FIELD_LABELS[key] || key, before: shown(before[key]), after: shown(after[key]) }));
}

function historyView() {
  if (!isCentral()) return '<p class="admin-empty">Só a equipa central consulta o histórico.</p>';
  if (!state.audit) return '<p class="admin-empty">A carregar…</p>';
  const when = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `<div class="admin-card">
    <h2>Histórico de alterações</h2>
    <p class="admin-hint">Registado pela base de dados em cada gravação, por quem a fez. Não pode ser alterado a partir do painel.</p>
    <label class="admin-inline">Mostrar<select id="audit-table">
      <option value="">Tudo</option>
      ${Object.entries(TABLE_LABELS).map(([id, label]) => `<option value="${id}" ${state.auditTable === id ? 'selected' : ''}>${label}</option>`).join('')}
    </select></label>
    <ul class="audit-list">${state.audit.map((row) => {
      const fields = changedFields(row);
      return `<li>
        <div class="audit-head">
          <strong>${escapeHtml(row.changed_by ? state.auditNames[row.changed_by] || '…' : 'Sistema ou importação')}</strong>
          <span>${escapeHtml(ACTION_LABELS[row.action] || row.action)} ${escapeHtml((TABLE_LABELS[row.table_name] || row.table_name).toLowerCase())}</span>
          <b>${escapeHtml(recordName(row))}</b>
          <time datetime="${escapeHtml(row.changed_at)}">${when.format(new Date(row.changed_at))}</time>
        </div>
        ${fields.length ? `<dl class="audit-fields">${fields.map((field) => `<div><dt>${escapeHtml(field.key)}</dt><dd><del>${escapeHtml(field.before)}</del> → <ins>${escapeHtml(field.after)}</ins></dd></div>`).join('')}</dl>` : ''}
      </li>`;
    }).join('') || '<li class="admin-empty">Sem alterações registadas.</li>'}</ul>
    ${state.auditHasMore ? '<button class="button button-outline" type="button" data-action="audit-more">Ver mais antigas</button>' : ''}
  </div>`;
}

// ---------------------------------------------------------------- orações --

// The Prophet's prayers. The team uploads the recording, names it and files it
// under one of its own themes; everything a pastor needs to find it later is
// written here and nowhere else.
async function loadPrayers() {
  const [rows, themes] = await Promise.all([
    readAllPages(rest, 'prayers?select=id,theme_id,title,description,audio_url,duration_seconds,file_bytes,hidden,published_at&order=published_at.desc,id.asc'),
    rest('prayer_themes?select=id,slug,name,sort_order&order=sort_order.asc')
  ]);
  state.prayerThemes = normalizeThemes(themes);
  state.prayers = (rows || []).map((row) => ({ ...normalizePrayer(row, { themes: state.prayerThemes }), hidden: Boolean(row.hidden) }));
}

const megabytes = (bytes) => (bytes ? `${(bytes / 1048576).toFixed(1)} MB` : '');

function prayersView() {
  if (!state.prayers) return '<p class="admin-empty">A carregar…</p>';
  const themes = state.prayerThemes || [];
  const prefs = listState('prayers');
  const visible = sortPrayers(state.prayers).filter((prayer) => (!prefs.theme || prayer.themeId === prefs.theme) && (!prefs.status || (prefs.status === 'hidden' ? prayer.hidden : !prayer.hidden)) && matchesRecord([prayer.title, prayer.description, prayer.theme?.name], [], prefs.query));
  const counted = (theme) => state.prayers.filter((prayer) => prayer.themeId === theme.id).length;
  return `<div class="admin-card">
    ${pageHeader('Orações', `${state.prayers.length} gravações · Áudios do Profeta Elias, organizados por tema.`, '<button class="button button-gold" type="button" data-action="new-prayer">+ Acrescentar oração</button>')}
    <div class="admin-toolbar">${listInput('prayers', 'Título, descrição ou tema')}${listSelect('prayers', 'theme', 'Tema', [['', 'Todos os temas'], ...themes.map((t) => [t.id, t.name])])}${listSelect('prayers', 'status', 'Estado', [['', 'Todas'], ['visible', 'Visíveis'], ['hidden', 'Escondidas']])}${resetFilters('prayers')}</div>
    ${pager('prayers', visible.length, true)}<ul class="admin-list admin-work-list">${pageRows('prayers', visible).map((prayer) => `<li>
      <div class="admin-row-wide">
        <span>
          <strong>${escapeHtml(prayer.title)}${prayer.hidden ? ' · escondida' : ''}</strong>
          <small>${escapeHtml([prayer.theme?.name || 'Sem tema', formatDuration(prayer.duration), megabytes(prayer.bytes)].filter(Boolean).join(' · '))}</small>
        </span>
        <span class="admin-row-actions">
          <a class="text-button" href="${escapeHtml(safeUrl(prayer.audioUrl) || '#')}" target="_blank" rel="noopener noreferrer">Ouvir</a>
          <button class="text-button" type="button" data-prayer-edit="${prayer.id}">Editar</button>
          <button class="text-button" type="button" data-prayer-hide="${prayer.id}">${prayer.hidden ? 'Repor' : 'Esconder'}</button>
          <details class="admin-more"><summary aria-label="Mais acções para ${escapeHtml(prayer.title)}">Mais ⋯</summary><button class="text-button admin-danger" type="button" data-prayer-delete="${prayer.id}">Eliminar oração</button></details>
        </span>
      </div>
    </li>`).join('') || '<li class="admin-empty">Ainda não há orações.</li>'}</ul>

    ${pager('prayers', visible.length)}<details class="admin-topics"><summary>Consultar temas (${themes.length})</summary>
    <p class="admin-hint">A ordem é a que a equipa deu, e é por ela que os temas aparecem na aplicação. Para acrescentar ou renomear um tema, fale com quem trata da base de dados.</p>
    <ul class="admin-list">${themes.map((theme) => `<li><div class="admin-row-wide">
      <span><strong>${escapeHtml(theme.name)}</strong><small>${counted(theme)} ${counted(theme) === 1 ? 'oração' : 'orações'}</small></span>
    </div></li>`).join('') || '<li class="admin-empty">Nenhum tema definido.</li>'}</ul>
  </details>
  </div>`;
}

function prayerEditor() {
  const draft = state.prayerDraft;
  const themes = state.prayerThemes || [];
  const isNew = !draft.id;
  return `<div class="admin-overlay"><form id="prayer-form" class="admin-card admin-dialog">
    <h2>${isNew ? 'Nova oração' : escapeHtml(draft.title || 'Oração')}</h2>
    <label>Título<input type="text" name="title" value="${escapeHtml(draft.title || '')}" required placeholder="Oração pelos enfermos" /></label>
    <label>Tema<select name="theme_id">
      <option value="">— sem tema —</option>
      ${themes.map((theme) => `<option value="${theme.id}" ${draft.themeId === theme.id ? 'selected' : ''}>${escapeHtml(theme.name)}</option>`).join('')}
    </select></label>
    <label>Em que caso se usa <small>(é por aqui que se procura)</small>
      <input type="text" name="description" value="${escapeHtml(draft.description || '')}" placeholder="Para quem está internado ou em coma" /></label>
    <label>Áudio
      <input type="file" name="audio" accept="${AUDIO_TYPES.join(',')}" ${isNew ? 'required' : ''} data-prayer-audio />
    </label>
    <p class="admin-hint">${draft.audioUrl && !draft.pendingName
      ? `Gravação atual: ${escapeHtml(formatDuration(draft.duration) || 'duração por saber')}${draft.bytes ? ` · ${megabytes(draft.bytes)}` : ''}. Escolha um ficheiro só se quiser substituí-la.`
      : draft.pendingName
        ? `Escolhido: ${escapeHtml(draft.pendingName)}${draft.duration ? ` · ${escapeHtml(formatDuration(draft.duration))}` : ''}`
        : 'MP3, M4A, AAC, OGG ou WAV, até 25 MB. Voz em 64 kbps mono chega e sobra: meio megabyte por minuto.'}</p>
    <div class="admin-dialog-actions">
      <button class="text-button" type="button" data-action="close-prayer">Cancelar</button>
      <button class="button button-gold" type="submit" ${state.prayerUploading ? 'disabled' : ''}>${state.prayerUploading ? 'A enviar o áudio…' : 'Guardar'}</button>
    </div>
  </form></div>`;
}

function feedView() {
  if (!state.posts) return '<p class="admin-empty">A carregar…</p>';
  const authorOf = (id) => authorName(state.postAuthors?.get(id)) || 'Sem nome';
  const scopeOf = (post) => (post.church_id ? churchLabel(post.church_id) : 'Toda a ISTN');
  const communityOf = (post) => (state.communities || []).find((community) => community.id === post.community_id)?.name || '';
  const comments = (state.postComments || []).filter((comment) => state.posts.some((post) => post.id === comment.post_id));

  const key = state.feedTab;
  const prefs = listState(key);
  const sources = key === 'publications' ? state.posts : key === 'comments' ? comments : state.publishers || [];
  const rows = sources.filter((row) => {
    const churchId = row.home_church_id || row.church_id || state.posts.find((p) => p.id === row.post_id)?.church_id;
    return (!prefs.status || (prefs.status === 'hidden' ? row.hidden : prefs.status === 'highlighted' ? row.highlighted && !row.hidden : !row.hidden))
      && (!prefs.church || (prefs.church === 'global' ? !churchId : churchId === prefs.church))
      && matchesRecord([row.title, row.body, row.display_name, authorOf(row.author_id), churchLabel(churchId)], [], prefs.query);
  });
  return `<div class="admin-card">
    ${pageHeader('Anúncios', 'Publicações, comentários e direitos de publicação.')}
    <nav class="admin-subnav" aria-label="Gestão de anúncios">${[['publications', 'Publicações'], ['comments', 'Comentários'], ...(isCentral() ? [['publishers', 'Quem pode publicar']] : [])].map(([id, title]) => `<button type="button" data-feed-tab="${id}" aria-current="${key === id ? 'page' : 'false'}" class="${key === id ? 'selected' : ''}">${title}</button>`).join('')}</nav>
    <p class="admin-hint">${key === 'publishers' ? 'Atribua o âmbito de publicação a cada servo verificado.' : 'Esconder retira o conteúdo da aplicação e permite repô-lo mais tarde.'}</p>
    <div class="admin-toolbar">${listInput(key, key === 'publishers' ? 'Nome ou igreja' : 'Título, texto ou autor')}
    ${key === 'publishers' ? '' : listSelect(key, 'status', 'Estado', [['', 'Todos'], ['visible', 'Visíveis'], ['hidden', 'Escondidos'], ...(key === 'publications' ? [['highlighted', 'Em destaque']] : [])])}
    ${listSelect(key, 'church', 'Âmbito', [['', 'Todos'], ['global', 'Toda a ISTN'], ...(state.churches || []).map((c) => [c.id, churchLabel(c.id)])])}${resetFilters(key)}</div>
    ${pager(key, rows.length, true)}<ul class="admin-list admin-work-list">${pageRows(key, rows).map((row) => `<li><div class="admin-row-wide"><div class="admin-record-summary">
      <strong>${escapeHtml(key === 'publications' ? row.title || row.body.slice(0, 90) : key === 'comments' ? authorOf(row.author_id) : row.display_name || 'Sem nome')}</strong>
      <small>${escapeHtml(key === 'publications' ? [authorOf(row.author_id), scopeOf(row), communityOf(row), formatPostDate(row.published_at)].filter(Boolean).join(' · ') : key === 'comments' ? `${row.body.slice(0, 140)} · ${formatPostDate(row.created_at)}` : churchLabel(row.home_church_id))}</small>
      ${key === 'comments' ? `<small>Em: ${escapeHtml(state.posts.find((p) => p.id === row.post_id)?.title || 'Anúncio')}</small>` : ''}
      <div class="admin-record-badges">${row.hidden ? '<span class="status-badge needs_review">Escondido</span>' : ''}${row.highlighted ? '<span class="status-badge verified">Em destaque</span>' : ''}</div>
      </div><div class="admin-row-actions">
      ${key === 'publications' ? `<button class="button button-outline" type="button" data-post-highlight="${row.id}">${row.highlighted ? 'Retirar destaque' : 'Destacar'}</button><button class="button button-outline" type="button" data-post-hide="${row.id}">${row.hidden ? 'Repor' : 'Esconder'}</button><details class="admin-more"><summary aria-label="Mais acções para ${escapeHtml(row.title || 'anúncio')}">Mais ⋯</summary><button class="text-button admin-danger" type="button" data-post-delete="${row.id}">Eliminar anúncio</button></details>` : key === 'comments' ? `<button class="button button-outline" type="button" data-comment-hide="${row.id}">${row.hidden ? 'Repor' : 'Esconder'}</button>` : `<label class="admin-inline"><span class="sr-only">Direito de publicar de ${escapeHtml(row.display_name || '')}</span><select data-publish-scope="${row.id}">${PUBLISH_SCOPES.map((scope) => `<option value="${scope.id}" ${(row.publish_scope || 'nenhum') === scope.id ? 'selected' : ''}>${scope.label}</option>`).join('')}</select></label>`}
      </div></div></li>`).join('') || `<li>${emptyResults(key)}</li>`}</ul>${pager(key, rows.length)}
  </div>`;
}

function visibleServos() {
  const prefs = listState('servos');
  const mine = isCentral() ? state.servos : state.servos.filter((servo) => servo.church_id === state.profile?.church_id);
  return sortRecords(mine.filter((servo) => {
    const church = state.churches?.find((c) => c.id === servo.church_id);
    return (!prefs.country || church?.country_code === prefs.country)
      && (!prefs.church || servo.church_id === prefs.church)
      && (!prefs.role || servo.role === prefs.role)
      && (!prefs.status || (prefs.status === 'active' ? servo.active !== false : servo.active === false))
      && matchesRecord([servantName(servo), roleLabel(servo.role), churchLabel(servo.church_id), church?.country, servo.phone], [servo.phone], prefs.query);
  }), (servo) => prefs.sort === 'church' ? `${churchLabel(servo.church_id)} ${servo.full_name}` : servo.full_name);
}
function servosView() {
  if (!state.servos) return '<p class="admin-empty">A carregar…</p>';
  const mine = isCentral() ? state.servos : state.servos.filter((servo) => servo.church_id === state.profile?.church_id);
  const visible = visibleServos();
  const churches = (state.churches || []).filter((c) => mine.some((servo) => servo.church_id === c.id));
  const roles = [...new Set(mine.map((servo) => servo.role))].map((role) => [role, roleLabel(role)]);
  return `<div class="admin-card">
    ${pageHeader('Servos', `${mine.length} registos · ${mine.filter((servo) => servo.is_minister).length} ministros`, '<button class="button button-gold" type="button" data-action="new-servo">+ Adicionar servo</button>')}
    <div class="admin-toolbar">${listInput('servos', 'Nome, igreja ou telefone')}${countriesFilter('servos', churches)}
    ${listSelect('servos', 'church', 'Igreja', [['', 'Todas as igrejas'], ...churches.map((c) => [c.id, churchLabel(c.id)])])}
    ${listSelect('servos', 'role', 'Função', [['', 'Todas as funções'], ...roles])}
    ${listSelect('servos', 'status', 'Estado', [['', 'Todos'], ['active', 'Em funções'], ['inactive', 'Inactivos']])}
    ${listSelect('servos', 'sort', 'Ordenar', [['name', 'Nome'], ['church', 'Igreja']])}${resetFilters('servos')}</div>
    ${pager('servos', visible.length, true)}<div class="directory-table-wrap" role="region" aria-label="Tabela de servos, deslocável na horizontal" tabindex="0"><table class="directory-table"><caption class="sr-only">Servos registados</caption><thead><tr><th scope="col">Nome</th><th scope="col">Função</th><th scope="col">Igreja</th><th scope="col">Contacto</th><th scope="col">Estado</th><th scope="col">Acção</th></tr></thead><tbody>
    ${pageRows('servos', visible).map((servo) => `<tr><td><strong class="servo-line">${escapeHtml(servantName(servo))}${badgeTier(servo.role) === 'neutro' ? quietCheck() : verifiedSeal(servo.role)}</strong></td><td>${escapeHtml(roleLabel(servo.role))}${servo.is_minister ? '<small>Ministro</small>' : ''}</td><td>${escapeHtml(churchLabel(servo.church_id))}<small>${escapeHtml(countryName(state.churches?.find((c) => c.id === servo.church_id)?.country_code || ''))}</small></td><td>${escapeHtml(servo.phone || 'Sem telefone')}<small>${servo.phone ? servo.phone_public ? 'Público, por escolha do servo' : 'Privado' : ''}</small></td><td><span class="status-badge ${servo.active === false ? 'needs_review' : 'verified'}">${servo.active === false ? 'Inactivo' : 'Em funções'}</span></td><td><button class="button button-outline" data-servo="${servo.id}" aria-label="Editar ${escapeHtml(servantName(servo))}">Editar</button></td></tr>`).join('') || '<tr><td colspan="6">' + emptyResults('servos') + '</td></tr>'}
    </tbody></table></div>${pager('servos', visible.length)}
  </div>`;
}

// A new servant has no id yet, so there is nowhere to file the photograph:
// save first, reopen, then upload.
function photoField(url, folder, id) {
  // The storage policy lets only the central team file servants' and churches'
  // photographs; a local editor would pick a file only to see the upload fail.
  if (!isCentral()) return '';
  if (!id) return '<p class="admin-hint">Guarde primeiro para poder acrescentar uma fotografia.</p>';
  return `<div class="photo-field">
    ${safeUrl(url) ? `<img class="photo-preview" src="${escapeHtml(safeUrl(url))}" alt="" />` : '<span class="photo-preview empty">◌</span>'}
    <div>
      <label class="photo-pick">${state.uploading ? 'A carregar…' : 'Escolher fotografia'}<input type="file" accept="image/jpeg,image/png,image/webp" data-upload="${folder}" data-upload-id="${id}" ${state.uploading ? 'disabled' : ''} /></label>
      <small>Reduzida automaticamente antes de ser enviada.</small>
    </div>
  </div>`;
}

// The country a place is in, so a contact opens on the code it most likely
// has: the church's own, and the church's country when there is no place yet.
const countryOf = (churchId) => (state.churches || []).find((church) => church.id === churchId)?.country_code || DEFAULT_COUNTRY;

function servoEditor() {
  const servo = state.servo;
  const isNew = !servo.id;
  const gender = servo.gender || 'masculino';
  const igrejas = isCentral() ? (state.churches || []) : (state.churches || []).filter((c) => c.id === state.profile?.church_id);
  return `<div class="admin-overlay"><form id="servo-form" class="admin-card admin-dialog">
    <h2>${isNew ? 'Novo servo' : escapeHtml(servantName(servo))}</h2>
    <label>Nome<input type="text" name="full_name" value="${escapeHtml(servo.full_name || '')}" required placeholder="Sem a abreviatura da função" /></label>
    <div class="admin-row">
      <label>Género<select name="gender" id="servo-gender">
        <option value="masculino" ${gender === 'masculino' ? 'selected' : ''}>Masculino</option>
        <option value="feminino" ${gender === 'feminino' ? 'selected' : ''}>Feminino</option>
      </select></label>
      <label>Função<select name="role" id="servo-role">
        ${rolesForGender(gender).map((role) => `<option value="${role.id}" ${servo.role === role.id ? 'selected' : ''}>${role.label}</option>`).join('')}
      </select></label>
    </div>
    <p class="admin-hint" id="servo-minister-hint"></p>
    <p class="admin-hint">Só o próprio servo, na sua conta verificada, decide se o número aparece no diretório. Se mudar o número aqui, ele volta a ficar privado até o servo escolher de novo.</p>
    <div class="admin-row">
      <label>Contacto <small>(${servo.phone_public ? 'visível no diretório, por escolha do servo' : 'privado'})</small>${phoneControl({ value: servo.phone || '', country: countryOf(servo.church_id) })}</label>
      <label>Igreja onde serve<select name="church_id">
        <option value="">— sem igreja —</option>
        ${igrejas.map((church) => `<option value="${church.id}" ${servo.church_id === church.id ? 'selected' : ''}>${escapeHtml(church.name || church.locality || church.country || church.record_id)}</option>`).join('')}
      </select></label>
    </div>
    ${photoField(servo.photo_url, 'servos', servo.id)}
    <label class="admin-check"><input type="checkbox" name="active" ${servo.active === false ? '' : 'checked'} /> Em funções</label>
    <div class="admin-dialog-actions">
      ${isNew ? '' : '<button class="button button-outline admin-danger" type="button" data-action="delete-servo">Eliminar</button>'}
      <button class="button button-outline" type="button" data-action="cancel-servo">Cancelar</button>
      <button class="button button-gold" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'A guardar…' : 'Guardar'}</button>
      ${!isNew && visibleServos().some((c, i, rows) => c.id === servo.id && i < rows.length - 1) ? '<button class="button button-outline" type="submit" name="save-next">Guardar e seguinte →</button>' : ''}
    </div>
  </form></div>`;
}

function visibleChurches(mine = isCentral() ? state.churches : state.churches.filter((c) => c.id === state.profile?.church_id)) {
  const prefs = listState('churches');
  const rows = mine.filter((church) => {
    const people = [{ name: church.leader_name, phone: church.leader_phone }, ...(church.other_leaders || [])];
    return (!prefs.country || church.country_code === prefs.country)
      && (!prefs.status || (prefs.status === 'verified' ? church.verification_status === 'verified' : church.verification_status !== 'verified'))
      && matchesRecord([church.name, church.locality, church.region, church.country, church.country_code, ...people.flatMap((p) => [p.name, p.phone])], people.map((p) => p.phone), prefs.query);
  });
  return sortRecords(rows, (c) => prefs.sort === 'country' ? `${countryName(c.country_code)} ${c.name || c.locality || ''}` : c.name || c.locality || c.country || '');
}

function churchesView() {
  if (!state.churches) return '<p class="admin-empty">A carregar…</p>';
  const mine = isCentral() ? state.churches : state.churches.filter((church) => church.id === state.profile?.church_id);
  const visible = visibleChurches(mine);
  const pending = mine.filter((church) => church.verification_status !== 'verified').length;
  return `<div class="admin-card">
    ${pageHeader('Directório', `${mine.length} locais · ${pending} por confirmar. Confirme com a igreja antes de verificar os dados.`, isCentral() ? '<button class="button button-gold" type="button" data-action="new-church">+ Nova igreja</button>' : '')}
    <div class="admin-toolbar">${listInput('churches', 'Nome, localidade, responsável ou telefone')}${countriesFilter('churches', mine)}
    ${listSelect('churches', 'status', 'Estado', [['', 'Todos os estados'], ['pending', 'Por confirmar'], ['verified', 'Verificados']])}
    ${listSelect('churches', 'sort', 'Ordenar', [['name', 'Nome / localidade'], ['country', 'País']])}${resetFilters('churches')}</div>
    ${pager('churches', visible.length, true)}<div class="directory-table-wrap" role="region" aria-label="Tabela de igrejas, deslocável na horizontal" tabindex="0"><table class="directory-table"><caption class="sr-only">Igrejas e contactos</caption><thead><tr><th scope="col">Igreja / localidade</th><th scope="col">Responsáveis e contactos</th><th scope="col">Estado</th><th scope="col">Acção</th></tr></thead><tbody>
    ${pageRows('churches', visible).map((church) => `<tr><td><strong>${escapeHtml(church.name || church.locality || church.country || 'Sem localidade')}</strong><small>${escapeHtml([SEAT_LABELS[church.seat], church.region, church.country || countryName(church.country_code)].filter(Boolean).join(' · '))}</small></td>
    <td>${[{ name: church.leader_name, phone: church.leader_phone }, ...(church.other_leaders || [])].map((p) => `<div>${escapeHtml(p.name || 'Sem responsável')}<small>${escapeHtml(p.phone || 'Sem telefone')}</small></div>`).join('')}</td>
    <td><span class="status-badge ${church.verification_status}">${church.verification_status === 'verified' ? 'Verificado' : 'A confirmar'}</span></td>
    <td><button class="button button-outline" data-edit="${church.id}" aria-label="Editar ${escapeHtml(church.name || church.locality || church.country || 'igreja')}">Editar</button></td></tr>`).join('') || '<tr><td colspan="4" class="admin-empty">Nenhum registo corresponde. Ajuste a pesquisa ou os filtros.</td></tr>'}
    </tbody></table></div>${pager('churches', visible.length)}
  </div>`;
}

function churchEditor() {
  const church = state.editing;
  const services = state.services || [];
  const isNew = Boolean(church.isNew);
  if (!isNew && state.services === null) return `<div class="admin-overlay"><form class="admin-card admin-dialog"><h2>${escapeHtml(church.name || church.locality || 'Igreja')}</h2><p class="admin-hint">A carregar os dados da igreja. Se a ligação falhar, feche e volte a abrir o registo.</p><div class="admin-dialog-actions"><button class="button button-outline" type="button" data-action="cancel">Fechar</button></div></form></div>`;
  return `<div class="admin-overlay"><form id="church-form" class="admin-card admin-dialog">
    <h2>${isNew ? 'Nova igreja' : escapeHtml(church.name || church.locality || church.country || 'Local')}</h2>
    ${isNew
      ? `<p class="admin-hint">O lugar nasce por confirmar. A fotografia e a sede acrescentam-se depois de gravar.</p>
         <label>Como se reúne<select name="modality">
           <option value="physical" ${church.modality === 'online' ? '' : 'selected'}>Presencial — tem lugar de culto</option>
           <option value="online" ${church.modality === 'online' ? 'selected' : ''}>Igreja online — reúne-se pela internet</option>
         </select></label>`
      : `<p class="admin-hint">Origem: ${escapeHtml(church.source || church.note || 'registo operacional')}</p>`}
    <label>Nome da igreja<input type="text" name="name" maxlength="160" value="${escapeHtml(church.name || '')}" placeholder="Ex.: ISTN-SJ Kifica" /></label>
    <p class="admin-hint">Este nome aparece na aplicação. Se ficar vazio, será usada a localidade.</p>
    <label>Tipo de lugar<select name="place_type">
      <option value="" ${!church.place_type ? 'selected' : ''}>— por confirmar —</option>
      <option value="igreja" ${church.place_type === 'igreja' ? 'selected' : ''}>Igreja</option>
      <option value="casa_de_oracao" ${church.place_type === 'casa_de_oracao' ? 'selected' : ''}>Casa de oração</option>
    </select></label>
    <label data-when-church="igreja">Passou a igreja em<input type="date" name="became_church_on" value="${escapeHtml(church.became_church_on || '')}" /></label>
    ${countryField(church)}
    <div class="admin-row">
      <label>Localidade<input type="text" name="locality" value="${escapeHtml(church.locality || '')}" /></label>
      <label>Região<input type="text" name="region" value="${escapeHtml(church.region || '')}" /></label>
    </div>
    <label>Endereço<input type="text" name="address" value="${escapeHtml(church.address || '')}" placeholder="Para quem se desloca pela primeira vez" /></label>
    ${isNew ? '' : seatField(church)}
    <div class="admin-row">
      <label>Responsável<input type="text" name="leader_name" value="${escapeHtml(church.leader_name || '')}" /></label>
      <label>Telefone${phoneControl({ name: 'leader_phone', value: church.leader_phone || '', country: church.country_code || DEFAULT_COUNTRY })}</label>
    </div>
    ${phoneSharedWith(church)}
    <div id="leader-rows">${(Array.isArray(church.other_leaders) ? church.other_leaders : []).map((leader) => leaderRow(leader, church.country_code || DEFAULT_COUNTRY)).join('')}</div>
    <button class="text-button" type="button" data-action="add-leader">+ Acrescentar outro responsável</button>
    <label>Grupo de WhatsApp<input type="url" name="whatsapp_group_url" value="${escapeHtml(church.whatsapp_group_url || '')}" placeholder="https://chat.whatsapp.com/..." /></label>
    ${isNew ? '' : photoField(church.photo_url, 'igrejas', church.id)}
    <label>Nota<input type="text" name="note" value="${escapeHtml(church.note || '')}" /></label>

    <h3>Horários de culto</h3>
    <p class="admin-hint">Um lugar pode ter culto em mais do que um dia. Deixe a hora vazia se ainda não for conhecida.</p>
    <table class="admin-schedule"><tbody id="service-rows">
      ${services.map((service, index) => serviceRow(service, index)).join('') || serviceRow({}, 0, { placeholder: true })}
    </tbody></table>
    <button class="text-button" type="button" data-action="add-service">+ Acrescentar horário</button>

    <label class="admin-check"><input type="checkbox" name="verified" ${church.verification_status === 'verified' ? 'checked' : ''} /> Confirmei estes dados com a igreja</label>
    <div class="admin-dialog-actions">
      <button class="button button-outline" type="button" data-action="cancel">Cancelar</button>
      <button class="button button-gold" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'A guardar…' : 'Guardar'}</button>
      ${!isNew && visibleChurches().some((c, i, rows) => c.id === church.id && i < rows.length - 1) ? `<button class="button button-outline" type="submit" name="save-next" ${state.busy ? 'disabled' : ''}>Guardar e seguinte →</button>` : ''}
    </div>
  </form></div>`;
}

// The country is chosen from the list every part of the app shares, never
// typed: written by hand, the same country arrives as "Brasil", "brasil" and
// "Brazil", and the directory shows three groups where there is one.
function countryField(church) {
  const option = (country) => `<option value="${country.code}" ${church.country_code === country.code ? 'selected' : ''}>${escapeHtml(country.name)}</option>`;
  const all = countryList();
  const written = church.country && church.country !== countryName(church.country_code);
  return `<label>País<select name="country_code" required>
      ${church.country_code ? '' : '<option value="">— por escolher —</option>'}
      <optgroup label="Onde a ISTN-SJ está presente">${all.filter((country) => ISTN_COUNTRIES.includes(country.code)).map(option).join('')}</optgroup>
      <optgroup label="Todos os países">${all.map(option).join('')}</optgroup>
    </select></label>
    ${written ? `<p class="admin-hint">A lista de origem escreveu «${escapeHtml(church.country)}»; a aplicação mostra «${escapeHtml(countryName(church.country_code) || '')}», o nome da lista. Quem procurar pelo nome antigo continua a encontrar este lugar.</p>` : ''}`;
}

// The seat speaks for the whole ISTN, so only the central team changes it; the
// field says which place holds it now, since giving it here takes it from there.
function seatField(church) {
  const country = church.country || church.country_code;
  if (!isCentral()) {
    return church.seat ? `<p class="admin-hint">Este lugar é ${escapeHtml(SEAT_LABELS[church.seat].toLowerCase())}. Só a equipa central muda as sedes.</p>` : '';
  }
  const holder = (seat) => (state.churches || []).find((item) => item.id !== church.id && item.seat === seat
    && (seat === 'mundial' || (item.country || item.country_code) === country));
  const now = (seat) => (holder(seat) ? ` — hoje: ${escapeHtml(holder(seat).name || holder(seat).locality || holder(seat).country)}` : '');
  return `<label>Sede<select name="seat">
      <option value="" ${!church.seat ? 'selected' : ''}>Não é sede</option>
      <option value="nacional" ${church.seat === 'nacional' ? 'selected' : ''}>Sede nacional${country ? ` de ${escapeHtml(country)}` : ''}${now('nacional')}</option>
      <option value="mundial" ${church.seat === 'mundial' ? 'selected' : ''}>Sede mundial${now('mundial')}</option>
    </select></label>
    <p class="admin-hint">Dar a sede a este lugar tira-a ao lugar que a tem agora.</p>`;
}

// Someone else responsible for the place, as the announcements publish them:
// a name and a number, shown on the church's page with the main contact.
function leaderRow(leader = {}, country = DEFAULT_COUNTRY) {
  return `<div class="admin-row" data-leader-row>
    <label>Outro responsável<input type="text" data-leader-name value="${escapeHtml(leader.name || '')}" placeholder="Pr. Nome" /></label>
    <label>Telefone${phoneControl({ name: '', value: leader.phone || '', country })}</label>
    <button class="text-button admin-danger" type="button" data-remove-leader>remover</button>
  </div>`;
}

// The blank row shown when a place has no times yet is only a prompt: it is
// saved once someone touches it. A row that was loaded, or added with the
// button, is kept even without a time — "Domingo, hora por saber" is real
// information the migration deliberately preserved.
// The same number on other records is often one leader announced for several
// places, sometimes a copying mistake. Said here so it is checked, never merged.
function phoneSharedWith(church) {
  const digits = String(church.leader_phone || '').replace(/\D/g, '');
  if (digits.length < 8) return '';
  const others = sharedPhones((state.churches || []).map((row) => normalizeChurch(row))).get(digits)
    ?.filter((item) => item.dbId !== church.id) || [];
  if (!others.length) return '';
  return `<p class="admin-hint admin-warning">Este número também aparece em: ${others.map((item) => escapeHtml(item.name)).join(', ')}. Confirme se é a mesma pessoa.</p>`;
}

function serviceRow(service, index, { placeholder = false } = {}) {
  return `<tr data-service-row ${placeholder ? 'data-placeholder' : ''}>
    <td><select name="service-weekday-${index}">
      ${WEEKDAY_LABELS.map((label, weekday) => `<option value="${weekday}" ${Number(service.weekday) === weekday ? 'selected' : ''}>${label}</option>`).join('')}
    </select></td>
    <td><input type="time" name="service-time-${index}" value="${escapeHtml((service.start_time || '').slice(0, 5))}" /></td>
    <td><input type="text" name="service-label-${index}" value="${escapeHtml(service.label || '')}" placeholder="Culto dos servos" /></td>
    <td><button class="text-button admin-danger" type="button" data-remove-service>remover</button></td>
  </tr>`;
}

// ---------------------------------------------------------------- ligação --

let dialogOpen = false;
let editorKey = null;
let returnFocus = null;
function closeEditor() {
  if (state.busy || state.prayerUploading || state.uploading) return;
  if (state.dirty && !confirm('Tem alterações por guardar. Fechar sem guardar?')) return;
  state.editing = null; state.meeting = null; state.servo = null; state.prayerDraft = null; state.services = null; state.dirty = false; render();
}
window.addEventListener('beforeunload', (event) => { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });

function render() {
  if (!state.config) { root.innerHTML = '<p class="admin-empty">A carregar…</p>'; return; }
  if (!state.config.supabaseUrl) {
    root.innerHTML = '<p class="admin-empty">A ligação à base de dados não está configurada neste servidor. Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY.</p>';
    return;
  }
  if (!state.session) { renderInto(root, loginView()); bind(); return; }
  if (state.view === 'history' && !isCentral()) state.view = 'churches';
  const content = state.view === 'meetings' ? meetingsView()
    : state.view === 'servos' ? servosView()
    : state.view === 'claims' ? claimsView()
    : state.view === 'history' ? historyView()
    : state.view === 'posts' ? feedView()
    : state.view === 'prayers' ? prayersView()
    : churchesView();
  const record = state.editing || state.meeting || state.servo || state.prayerDraft;
  const nextEditorKey = record ? `${state.view}:${record.id || 'new'}` : null;
  const changedEditor = editorKey !== nextEditorKey;
  const opening = Boolean(record);
  if (opening && !dialogOpen) { returnFocus = document.activeElement?.closest('[data-edit], [data-servo], [data-meeting], [data-action], [data-prayer-edit]')?.outerHTML; state.dirty = false; }
  renderInto(root, shell(content) + (state.editing ? churchEditor() : '') + (state.meeting ? meetingEditor() : '') + (state.servo ? servoEditor() : '') + (state.prayerDraft ? prayerEditor() : ''));
  bind();
  const dialog = root.querySelector('.admin-dialog');
  document.body.classList.toggle('admin-editing', Boolean(dialog));
  if (dialog) root.querySelector('.admin-main')?.setAttribute('inert', '');
  else root.querySelector('.admin-main')?.removeAttribute('inert');
  for (const element of root.querySelectorAll('.admin-bar, .admin-tabs')) element.inert = Boolean(dialog);
  if (dialog) {
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.tabIndex = -1;
    const heading = dialog.querySelector('h2'); if (heading) { heading.id = 'admin-dialog-title'; dialog.setAttribute('aria-labelledby', heading.id); }
    if (!dialogOpen || changedEditor || !dialog.contains(document.activeElement)) { dialog.focus(); }
    dialog.addEventListener('input', () => { state.dirty = true; });
    dialog.addEventListener('change', () => { state.dirty = true; });
    dialog.querySelectorAll('[data-action="add-service"], [data-action="add-leader"], [data-remove-service], [data-remove-leader]').forEach((b) => b.addEventListener('click', () => { state.dirty = true; }));
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); closeEditor(); }
      if (event.key !== 'Tab') return;
      const fields = [...dialog.querySelectorAll('button, input, select, textarea, a[href]')].filter((e) => !e.disabled && e.getClientRects().length);
      if (!fields.length) return;
      if (event.shiftKey && (document.activeElement === fields[0] || document.activeElement === dialog)) { event.preventDefault(); fields.at(-1).focus(); }
      else if (!event.shiftKey && (document.activeElement === fields.at(-1) || document.activeElement === dialog)) { event.preventDefault(); fields[0].focus(); }
    });
  } else if (dialogOpen && returnFocus) {
    const holder = document.createElement('div'); holder.innerHTML = returnFocus;
    const former = holder.firstElementChild;
    const attribute = [...former.attributes].find((a) => a.name.startsWith('data-'));
    if (attribute) [...root.querySelectorAll(`[${attribute.name}]`)].find((e) => e.getAttribute(attribute.name) === attribute.value)?.focus({ preventScroll: true });
    state.dirty = false;
  }
  dialogOpen = Boolean(dialog); editorKey = nextEditorKey;
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

// Runs a save or a load with the submit buttons disabled. The page is redrawn
// only when the action succeeds: redrawing after a failure would rebuild the
// open form from the stored record and throw away everything just typed.
function setBusy(busy) {
  state.busy = busy;
  root.querySelectorAll('button[type="submit"], [data-claim-approve], [data-claim-reject], [data-post-hide], [data-post-highlight], [data-post-delete], [data-comment-hide], [data-prayer-hide], [data-prayer-delete], [data-action="refresh"]').forEach((button) => {
    button.disabled = busy;
    if (button.type === 'submit') {
      button.dataset.label ||= button.textContent;
      button.textContent = busy ? 'A guardar…' : button.dataset.label;
    }
  });
}

async function guard(action) {
  setBusy(true);
  try {
    await action();
    state.busy = false;
    render();
  } catch (error) {
    toast(error.message, 'erro');
  } finally {
    if (state.busy) setBusy(false);
  }
}

function bind() {
  document.querySelector('#login-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const { email, password } = formValues(event.target);
    guard(async () => {
      writeSession(await authRequest('password', { email, password }));
      await loadProfile();
      state.view = isCentral() ? 'meetings' : 'churches';
      if (isCentral()) await loadMeetings();
      await loadChurches();
      await loadServos();
      await loadClaims();
      toast('Sessão iniciada.');
    });
  });

  root.querySelectorAll('[data-list]').forEach((control) => control.addEventListener(control.dataset.field === 'query' ? 'input' : 'change', () => {
    const prefs = listState(control.dataset.list);
    prefs[control.dataset.field] = control.dataset.field === 'size' ? Number(control.value) : control.value;
    prefs.page = 1;
    render();
  }));
  root.querySelectorAll('[data-reset-list]').forEach((button) => button.addEventListener('click', () => {
    delete state.lists[button.dataset.resetList]; render();
  }));
  root.querySelectorAll('[data-page-list]').forEach((button) => button.addEventListener('click', () => {
    listState(button.dataset.pageList).page = Number(button.dataset.page); render();
    root.querySelector('#admin-content')?.focus({ preventScroll: true });
  }));
  root.querySelectorAll('[data-feed-tab]').forEach((button) => button.addEventListener('click', () => { state.feedTab = button.dataset.feedTab; render(); }));
  root.querySelector('[data-action="refresh"]')?.addEventListener('click', () => guard(async () => {
    if (state.view === 'posts') { await loadFeed(); if (isCentral()) await loadPublishers(); }
    else if (state.view === 'prayers') await loadPrayers();
    else if (state.view === 'meetings') await loadMeetings();
    else { await loadChurches(); await loadServos(); await loadClaims(); }
    toast('Dados actualizados.');
  }));
  root.querySelectorAll('[data-view]').forEach((element) => element.addEventListener('click', () => {
    state.view = element.dataset.view;
    render();
    if (state.view === 'history') guard(() => loadAudit());
    if (state.view === 'posts') guard(async () => { await loadFeed(); if (isCentral()) await loadPublishers(); });
    if (state.view === 'prayers') guard(() => loadPrayers());
  }));

  root.querySelectorAll('[data-post-hide]').forEach((button) => button.addEventListener('click', () => {
    const post = state.posts.find((item) => item.id === button.dataset.postHide);
    guard(async () => {
      await rest(`posts?id=eq.${post.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ hidden: !post.hidden }) });
      await loadFeed();
      toast(post.hidden ? 'Anúncio reposto.' : 'Anúncio escondido.');
    });
  }));

  root.querySelectorAll('[data-post-highlight]').forEach((button) => button.addEventListener('click', () => {
    const post = state.posts.find((item) => item.id === button.dataset.postHighlight);
    guard(async () => {
      await rest(`posts?id=eq.${post.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ highlighted: !post.highlighted }) });
      await loadFeed();
      toast(post.highlighted ? 'Destaque retirado.' : 'Anúncio destacado.');
    });
  }));

  root.querySelectorAll('[data-post-delete]').forEach((button) => button.addEventListener('click', () => {
    if (!confirm('Eliminar este anúncio? Esta ação não pode ser anulada. Esconder é reversível.')) return;
    guard(async () => {
      await rest(`posts?id=eq.${button.dataset.postDelete}`, { method: 'DELETE' });
      await loadFeed();
      toast('Anúncio eliminado.');
    });
  }));

  // ------------------------------------------------------------ orações --

  root.querySelector('[data-action="new-prayer"]')?.addEventListener('click', () => {
    state.prayerDraft = { title: '', description: '', themeId: '', audioUrl: '', duration: 0, bytes: 0 };
    render();
  });

  root.querySelectorAll('[data-prayer-edit]').forEach((button) => button.addEventListener('click', () => {
    const prayer = state.prayers.find((item) => item.id === button.dataset.prayerEdit);
    if (prayer) { state.prayerDraft = { ...prayer }; render(); }
  }));

  root.querySelector('[data-action="close-prayer"]')?.addEventListener('click', () => {
    closeEditor();
  });

  root.querySelectorAll('[data-prayer-hide]').forEach((button) => button.addEventListener('click', () => {
    const prayer = state.prayers.find((item) => item.id === button.dataset.prayerHide);
    guard(async () => {
      await rest(`prayers?id=eq.${prayer.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ hidden: !prayer.hidden }) });
      await loadPrayers();
      toast(prayer.hidden ? 'Oração reposta.' : 'Oração escondida.');
    });
  }));

  root.querySelectorAll('[data-prayer-delete]').forEach((button) => button.addEventListener('click', () => {
    if (!confirm('Eliminar esta oração? O áudio deixa de estar disponível para quem já tem o link. Esconder é reversível.')) return;
    guard(async () => {
      await rest(`prayers?id=eq.${button.dataset.prayerDelete}`, { method: 'DELETE' });
      await loadPrayers();
      toast('Oração eliminada.');
    });
  }));

  // The length is read from the recording itself: nobody should count minutes
  // by hand, and a number typed wrong would mislead whoever chooses what to send.
  root.querySelector('[data-prayer-audio]')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file || !state.prayerDraft) return;
    state.prayerDraft.pendingName = file.name;
    state.prayerDraft.duration = (await audioDuration(file)) || 0;
    const input = root.querySelector('#prayer-form [name="title"]');
    // Um título por preencher começa pelo nome do ficheiro, que é quase sempre o certo.
    if (input && !input.value.trim()) input.value = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
    state.prayerDraft.title = input?.value || state.prayerDraft.title;
    root.querySelector('#prayer-form .admin-hint').textContent = `Escolhido: ${file.name}${state.prayerDraft.duration ? ` · ${formatDuration(state.prayerDraft.duration)}` : ''}`;
  });

  root.querySelector('#prayer-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (state.prayerUploading) return;
    const form = event.target;
    const values = formValues(form);
    const file = form.querySelector('[data-prayer-audio]')?.files?.[0] || null;
    const draft = state.prayerDraft;
    if (!values.title.trim()) { toast('Dê um título à oração.', 'erro'); return; }
    if (!file && !draft.audioUrl) { toast('Escolha o ficheiro de áudio.', 'erro'); return; }
    state.prayerUploading = Boolean(file);
    if (state.prayerUploading) render();
    guard(async () => {
      try {
        let audio = { url: draft.audioUrl, bytes: draft.bytes };
        let duration = draft.duration;
        if (file) {
          audio = await uploadAudio(file, state.session);
          duration = (await audioDuration(file)) || duration;
        }
        const body = {
          title: values.title.trim(),
          description: values.description.trim() || null,
          theme_id: values.theme_id || null,
          audio_url: audio.url,
          duration_seconds: duration || null,
          file_bytes: audio.bytes || null
        };
        const saved = draft.id
          ? await rest(`prayers?id=eq.${draft.id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) })
          : await rest('prayers', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) });
        if (!saved?.length) throw new Error('Não tem permissão para guardar orações.');
        state.prayerDraft = null;
        await loadPrayers();
        toast('Oração guardada.');
      } finally {
        // Um envio falhado tem de devolver o botão: o áudio pode ser grande e
        // a pessoa vai querer tentar outra vez.
        state.prayerUploading = false;
      }
    });
  });

  root.querySelectorAll('[data-comment-hide]').forEach((button) => button.addEventListener('click', () => {
    const comment = state.postComments.find((item) => item.id === button.dataset.commentHide);
    guard(async () => {
      await rest(`post_comments?id=eq.${comment.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ hidden: !comment.hidden }) });
      await loadFeed();
      toast(comment.hidden ? 'Comentário reposto.' : 'Comentário escondido.');
    });
  }));

  root.querySelectorAll('[data-publish-scope]').forEach((select) => select.addEventListener('change', () => {
    const id = select.dataset.publishScope;
    guard(async () => {
      const saved = await rest(`app_users?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ publish_scope: select.value }) });
      if (saved?.[0]?.publish_scope !== select.value) throw new Error('Não foi possível alterar o direito de publicar.');
      await loadPublishers();
      toast('Direito de publicar atualizado.');
    });
  }));
  document.querySelector('#audit-table')?.addEventListener('change', (event) => {
    state.auditTable = event.target.value;
    state.audit = null;
    render();
    guard(() => loadAudit());
  });
  document.querySelector('[data-action="audit-more"]')?.addEventListener('click', () => guard(() => loadAudit({ more: true })));
  root.querySelectorAll('[data-action="signout"]').forEach((element) => element.addEventListener('click', () => {
    writeSession(null);
    for (const key of ['profile', 'meetings', 'churches', 'servos', 'claims', 'posts', 'postComments', 'postAuthors', 'publishers', 'communities', 'prayers', 'prayerThemes', 'audit']) state[key] = null;
    state.lists = {}; state.feedTab = 'publications'; state.auditNames = {};
    render();
  }));

  function syncRecurrenceFields() {
    const select = document.querySelector('#recurrence-select');
    if (!select) return;
    document.querySelectorAll('[data-when]').forEach((element) => {
      element.hidden = !element.dataset.when.split(' ').includes(select.value);
    });
  }
  document.querySelector('#recurrence-select')?.addEventListener('change', syncRecurrenceFields);
  syncRecurrenceFields();

  root.querySelectorAll('[data-action="new-meeting"]').forEach((element) => element.addEventListener('click', () => {
    state.meeting = { kind: 'especial', recurrence: 'weekly', weekdays: [], active: true };
    render();
  }));
  root.querySelectorAll('[data-meeting]').forEach((element) => element.addEventListener('click', () => {
    state.meeting = state.meetings.find((meeting) => meeting.id === element.dataset.meeting) || null;
    render();
  }));
  document.querySelector('[data-action="cancel-meeting"]')?.addEventListener('click', closeEditor);

  document.querySelector('[data-action="delete-meeting"]')?.addEventListener('click', () => {
    if (!confirm(`Eliminar "${state.meeting.title}"? Esta ação não pode ser anulada.`)) return;
    guard(async () => {
      await rest(`meetings?id=eq.${state.meeting.id}`, { method: 'DELETE' });
      state.meeting = null;
      await loadMeetings();
      toast('Reunião eliminada.');
    });
  });

  document.querySelector('#meeting-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.target;
    const values = Object.fromEntries(new FormData(form).entries());
    const weekdays = [...form.querySelectorAll('input[name="weekday"]:checked')].map((input) => Number(input.value));
    const recurrence = values.recurrence;
    const startTime = values.start_time || null;
    const timeNote = (values.time_note || '').trim() || null;
    if (!startTime && !timeNote) { toast('Indique uma hora de início ou explique quando começa.', 'erro'); return; }
    if (recurrence === 'weekly' && !weekdays.length) { toast('Escolha pelo menos um dia da semana.', 'erro'); return; }
    if (recurrence === 'monthly_last' && weekdays.length !== 1) { toast('Escolha exatamente um dia da semana.', 'erro'); return; }
    if ((recurrence === 'yearly' || recurrence === 'once') && !values.event_date) { toast('Escolha uma data.', 'erro'); return; }
    // Only a real https address: the app turns this into a link people tap.
    if (values.zoom_url && !safeUrl(values.zoom_url)) { toast('O link do Zoom tem de começar por https://.', 'erro'); return; }
    const body = {
      title: values.title.trim(), kind: values.kind,
      zoom_url: safeUrl(values.zoom_url) || null, zoom_meeting_id: values.zoom_meeting_id || null,
      zoom_passcode: values.zoom_passcode || null,
      start_time: startTime, time_note: timeNote,
      recurrence, weekdays: recurrence === 'yearly' || recurrence === 'once' ? [] : weekdays,
      event_date: recurrence === 'yearly' || recurrence === 'once' ? values.event_date : null,
      active: !!values.active
    };
    guard(async () => {
      const saved = state.meeting.id
        ? await rest(`meetings?id=eq.${state.meeting.id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) })
        : await rest('meetings', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) });
      if (!saved?.length) throw new Error('Não tem permissão para guardar esta reunião.');
      state.meeting = null;
      await loadMeetings();
      toast('Reunião guardada.');
    });
  });

  // ---- servos ----
  root.querySelectorAll('[data-action="new-servo"]').forEach((el) => el.addEventListener('click', () => {
    state.servo = { gender: 'masculino', role: 'obreiro', active: true }; render();
  }));
  root.querySelectorAll('[data-servo]').forEach((el) => el.addEventListener('click', () => {
    state.servo = state.servos.find((servo) => servo.id === el.dataset.servo) || null; render();
  }));
  document.querySelector('[data-action="cancel-servo"]')?.addEventListener('click', closeEditor);

  // As funções são separadas por género, e o aviso de ministro acompanha a escolha.
  const genderSelect = document.querySelector('#servo-gender');
  const roleSelect = document.querySelector('#servo-role');
  function syncRoles(resetRole) {
    if (!genderSelect || !roleSelect) return;
    const permitidas = rolesForGender(genderSelect.value);
    const anterior = roleSelect.value;
    roleSelect.innerHTML = permitidas.map((role) => `<option value="${role.id}">${role.label}</option>`).join('');
    if (!resetRole && permitidas.some((role) => role.id === anterior)) roleSelect.value = anterior;
    const hint = document.querySelector('#servo-minister-hint');
    if (hint) hint.textContent = isMinisterRole(roleSelect.value)
      ? 'Esta função é de ministro.' : 'Esta função não é de ministro.';
  }
  genderSelect?.addEventListener('change', () => syncRoles(true));
  roleSelect?.addEventListener('change', () => syncRoles(false));
  syncRoles(false);

  document.querySelector('[data-action="delete-servo"]')?.addEventListener('click', () => {
    if (!confirm(`Eliminar "${servantName(state.servo)}"? Esta ação não pode ser anulada.`)) return;
    guard(async () => {
      await rest(`servos?id=eq.${state.servo.id}`, { method: 'DELETE' });
      state.servo = null; await loadServos(); toast('Servo eliminado.');
    });
  });

  document.querySelector('#servo-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = formValues(event.target);
    const queue = visibleServos();
    const nextId = event.submitter?.name === 'save-next' ? queue[queue.findIndex((c) => c.id === state.servo.id) + 1]?.id : null;
    const body = {
      full_name: values.full_name.trim(), gender: values.gender, role: values.role,
      church_id: values.church_id || null,
      active: !!values.active
    };
    const phone = phoneFromValues(values) || null;
    guard(async () => {
      const saved = state.servo.id
        ? await rest(`servos?id=eq.${state.servo.id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) })
        : await rest('servos', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) });
      if (!saved?.length) throw new Error('Não tem permissão para guardar este servo.');
      if (phone !== (state.servo.phone || null)) await saveServoPhone(saved[0].id, phone);
      await loadServos(); state.servo = nextId ? state.servos.find((c) => c.id === nextId) || null : null; state.dirty = false; toast('Servo guardado.');
    });
  });

  document.querySelectorAll('[data-upload]').forEach((input) => input.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const folder = event.target.dataset.upload;
    const id = event.target.dataset.uploadId;
    // Only the photograph's own corner of the form changes: redrawing the form
    // here would discard whatever else was typed and not yet saved.
    const field = event.target.closest('.photo-field');
    const pick = field.querySelector('.photo-pick');
    const pickLabel = pick.firstChild;
    state.uploading = true;
    event.target.disabled = true;
    pickLabel.textContent = 'A carregar…';
    try {
      const url = await uploadPhoto(file, folder, id, state.session);
      const table = folder === 'servos' ? 'servos' : 'churches';
      await rest(`${table}?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ photo_url: url }) });
      const record = folder === 'servos' ? state.servo : state.editing;
      if (record) record.photo_url = url;
      const list = folder === 'servos' ? state.servos : state.churches;
      const stored = list?.find((item) => item.id === id);
      if (stored) stored.photo_url = url;
      field.querySelector('.photo-preview').outerHTML = `<img class="photo-preview" src="${escapeHtml(url)}" alt="" />`;
      toast('Fotografia atualizada.');
    } catch (error) {
      toast(error.message, 'erro');
    } finally {
      state.uploading = false;
      event.target.disabled = false;
      pickLabel.textContent = 'Escolher fotografia';
    }
  }));

  // ---- horários de culto ----
  document.querySelector('[data-action="add-service"]')?.addEventListener('click', () => {
    const corpo = document.querySelector('#service-rows');
    const indice = corpo.querySelectorAll('[data-service-row]').length;
    corpo.insertAdjacentHTML('beforeend', serviceRow({}, indice));
    bindServiceRemoval();
  });
  function bindServiceRemoval() {
    document.querySelectorAll('[data-remove-service]').forEach((el) => {
      el.onclick = () => {
        const corpo = document.querySelector('#service-rows');
        if (corpo.querySelectorAll('[data-service-row]').length > 1) el.closest('[data-service-row]').remove();
        else el.closest('[data-service-row]').querySelectorAll('input').forEach((i) => { i.value = ''; });
      };
    });
  }
  bindServiceRemoval();
  document.querySelector('[data-action="add-leader"]')?.addEventListener('click', () => {
    // A new row opens on the country the place is in, like the ones already there.
    const pais = document.querySelector('#church-form [name="country_code"]')?.value || state.editing?.country_code || DEFAULT_COUNTRY;
    document.querySelector('#leader-rows').insertAdjacentHTML('beforeend', leaderRow({}, pais));
    bindLeaderRemoval();
  });
  function bindLeaderRemoval() {
    document.querySelectorAll('[data-remove-leader]').forEach((element) => {
      element.onclick = () => element.closest('[data-leader-row]').remove();
    });
  }
  bindLeaderRemoval();
  document.querySelector('#service-rows')?.addEventListener('input', (event) => {
    delete event.target.closest('[data-service-row]')?.dataset.placeholder;
  });

  const placeType = document.querySelector('[name="place_type"]');
  function syncPlaceType() {
    const campo = document.querySelector('[data-when-church]');
    if (campo) campo.hidden = placeType?.value !== 'igreja';
  }
  placeType?.addEventListener('change', syncPlaceType);
  syncPlaceType();

  root.querySelectorAll('[data-claim-approve]').forEach((button) => button.addEventListener('click', () => {
    const user = button.dataset.claimApprove;
    const existing = root.querySelector(`[data-claim-servo="${user}"]`)?.value || null;
    const claim = state.claims.find((item) => item.id === user);
    const what = existing ? 'ligar esta conta ao servo escolhido' : `criar o servo ${claim?.display_name || ''} como ${roleLabel(claim?.claimed_role)}`;
    if (!confirm(`Aprovar e ${what}?`)) return;
    guard(async () => {
      await rest('rpc/approve_servo_claim', { method: 'POST', body: JSON.stringify({ p_user: user, p_servo: existing }) });
      await Promise.all([loadClaims(), loadServos()]);
      toast('Pedido aprovado. O selo já aparece no perfil.');
    });
  }));

  root.querySelectorAll('[data-claim-reject]').forEach((button) => button.addEventListener('click', () => {
    const claim = state.claims.find((item) => item.id === button.dataset.claimReject);
    if (!confirm(`Recusar o pedido de ${claim?.display_name || 'esta pessoa'}?`)) return;
    guard(async () => {
      await rest('rpc/reject_servo_claim', { method: 'POST', body: JSON.stringify({ p_user: button.dataset.claimReject }) });
      await loadClaims();
      toast('Pedido recusado.');
    });
  }));


  document.querySelector('[data-action="new-church"]')?.addEventListener('click', () => {
    state.editing = { isNew: true, modality: 'physical', other_leaders: [], verification_status: 'needs_review' };
    state.services = [];
    render();
  });

  root.querySelectorAll('[data-edit]').forEach((element) => element.addEventListener('click', () => {
    state.editing = state.churches.find((church) => church.id === element.dataset.edit) || null;
    state.services = null;
    render();
    if (state.editing) guard(async () => { await loadServices(state.editing.id); });
  }));

  document.querySelector('[data-action="cancel"]')?.addEventListener('click', closeEditor);

  document.querySelector('#church-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.target;
    const values = formValues(form);
    const church = state.editing;
    const queue = visibleChurches();
    const nextId = event.submitter?.name === 'save-next' ? queue[queue.findIndex((c) => c.id === church.id) + 1]?.id : null;
    if (state.services === null) { toast('Os horários não foram carregados. Feche e volte a abrir a igreja antes de guardar.', 'erro'); return; }
    if (values.whatsapp_group_url && !safeUrl(values.whatsapp_group_url)) { toast('O link do grupo tem de começar por https://.', 'erro'); return; }
    const servicos = [...form.querySelectorAll('[data-service-row]')]
      .filter((row) => !('placeholder' in row.dataset))
      .map((row) => ({
        weekday: Number(row.querySelector('select').value),
        start_time: row.querySelector('input[type="time"]').value || null,
        label: row.querySelector('input[type="text"]').value.trim() || null
      }));
    const repeated = servicos.find((servico, index) => servicos.findIndex((other) => other.weekday === servico.weekday && other.start_time === servico.start_time) !== index);
    if (repeated) { toast(`Há dois horários iguais: ${WEEKDAY_LABELS[repeated.weekday]}${repeated.start_time ? ` às ${repeated.start_time}` : ' sem hora'}.`, 'erro'); return; }
    const outros = [...form.querySelectorAll('[data-leader-row]')]
      .map((row) => ({ name: row.querySelector('[data-leader-name]').value.trim(), phone: phoneFromFields(row) }))
      .filter((leader) => leader.name || leader.phone);
    const seat = values.seat || null;
    const details = {
      name: values.name.trim() || null,
      place_type: values.place_type || null,
      became_church_on: values.place_type === 'igreja' && values.became_church_on ? values.became_church_on : null,
      locality: values.locality || null, region: values.region || null,
      address: values.address || null,
      leader_name: values.leader_name || null, leader_phone: phoneFromValues(values, 'leader_phone') || null,
      other_leaders: outros,
      whatsapp_group_url: safeUrl(values.whatsapp_group_url) || null,
      note: values.note || null,
      verification_status: values.verified ? 'verified' : 'needs_review'
    };

    if (church.isNew) {
      const modality = values.modality === 'online' ? 'online' : 'physical';
      const country = values.country_code || '';
      if (!country) { toast('Escolha o país.', 'erro'); return; }
      // The identifier becomes the church's address in the app, and never
      // changes afterwards: /igrejas/ao-kifica, /igrejas/online-noruega.
      const from = modality === 'online' ? countryName(country) : (values.locality || values.name);
      const recordId = modality === 'online' ? `online-${slugify(from)}` : `${country.toLowerCase()}-${slugify(from)}`;
      if (slugify(from).length < 2) {
        toast(modality === 'online' ? 'Escolha o país.' : 'Indique a localidade: é ela que dá o endereço da igreja na aplicação.', 'erro');
        return;
      }
      guard(async () => {
        const born = await rest('rpc/create_church', {
          method: 'POST',
          body: JSON.stringify({ p_record_id: recordId, p_modality: modality, p_country_code: country, p_details: details, p_services: servicos })
        });
        await loadChurches();
        // Straight back into the new church: the photograph and the seat are
        // the two things that could not be set before it existed.
        state.editing = state.churches.find((item) => item.id === born) || null;
        state.services = state.editing ? null : [];
        render();
        if (state.editing) await loadServices(state.editing.id);
        toast('Igreja criada. Falta a fotografia e, se for o caso, a sede.');
      });
      return;
    }

    guard(async () => {
      await rest('rpc/save_church', {
        method: 'POST',
        body: JSON.stringify({ p_church: church.id, p_services: servicos, p_country_code: values.country_code || null,
          p_details: details, p_change_seat: isCentral() && seat !== (church.seat || null), p_seat: seat
        })
      });
      state.dirty = false; state.editing = null; state.services = null;
      await loadChurches();
      if (nextId) {
        state.editing = state.churches.find((c) => c.id === nextId) || null;
        if (state.editing) { state.services = null; render(); await loadServices(nextId); }
      }
      state.dirty = false; toast('Registo guardado.');
    });
  });

}

async function start() {
  state.config = await fetch('/api/config').then((response) => response.json()).catch(() => ({ supabaseUrl: '', supabaseKey: '' }));
  const session = readSession();
  if (session?.access_token) {
    state.session = session;
    try {
      await loadProfile();
      if (isCentral()) await loadMeetings();
      await loadChurches();
      await loadServos();
      await loadClaims();
      if (!isCentral()) state.view = 'churches';
    } catch { writeSession(null); }
  }
  render();
}

start();
