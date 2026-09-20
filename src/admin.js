import { WEEKDAY_LABELS, recurrenceLabel } from './meetings.js';
import { uploadPhoto } from './upload.js';
import { badgeTier, isMinisterRole, quietCheck, roleLabel, rolesForGender, servantName, verifiedSeal } from './roles.js';
import { ISTN_COUNTRIES, countryList, countryName } from './countries.js';
import { escapeHtml, safeUrl } from './html.js';
import { slugify } from './text.js';
import { renderInto } from './dom.js';
import { PUBLISH_SCOPES, authorName, formatPostDate } from './posts.js';
import { SEAT_LABELS, normalizeChurch, sharedPhones } from './directory.js';

const root = document.querySelector('#admin');
const SESSION_KEY = 'elias-admin-session';

const state = {
  config: null, session: null, profile: null,
  view: 'meetings', meetings: null, churches: null, claims: null,
  query: '', filter: 'todas', editing: null, meeting: null, servo: null, uploading: false,
  servos: null, services: null, busy: false,
  audit: null, auditNames: {}, auditTable: '', auditHasMore: false,
  posts: null, postComments: null, postAuthors: null, publishers: null
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
  state.churches = await rest('churches?select=*&order=country_code.asc,region.asc,locality.asc');
}

// The requests waiting on the team. Row level security only shows the central
// team members who asked for something, never the rest of the congregation.
async function loadClaims() {
  state.claims = isCentral()
    ? await rest('app_users?select=id,display_name,photo_url,gender,phone,country_code,city,home_church_id,claimed_role,updated_at&servo_claim_status=eq.pendente&order=updated_at.asc')
    : [];
}

// Phone numbers live apart from servos since migration 007, readable only by
// the team. Joined here so the editor works with one record per servant.
async function loadServos() {
  const [servos, contacts] = await Promise.all([
    rest('servos?select=*&order=role.asc,full_name.asc'),
    rest('servo_contacts?select=servo_id,phone,phone_public').catch(() => [])
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
  const [posts, comments, authors] = await Promise.all([
    rest('posts?select=id,title,body,church_id,highlighted,highlight_until,hidden,published_at,author_id&order=published_at.desc&limit=100'),
    rest('post_comments?select=id,post_id,author_id,body,hidden,created_at&order=created_at.desc&limit=100'),
    rest('post_authors?select=id,display_name,photo_url,servo_role,verified').catch(() => [])
  ]);
  state.posts = posts;
  state.postComments = comments;
  state.postAuthors = new Map((authors || []).map((author) => [author.id, author]));
}

async function loadPublishers() {
  state.publishers = isCentral()
    ? await rest('app_users?select=id,display_name,publish_scope,home_church_id,servo_id&servo_claim_status=eq.aprovado&order=display_name.asc')
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

function shell(content) {
  const role = isCentral() ? 'Equipa central' : 'Editor local';
  const pending = state.claims?.length || 0;
  const tabs = [['meetings', 'Reuniões'], ['churches', 'Diretório'], ['servos', 'Servos'], ['posts', 'Anúncios'], ['claims', 'Pedidos'], ['history', 'Histórico']]
    .filter(([id]) => !['meetings', 'claims', 'history'].includes(id) || isCentral())
    .map(([id, label]) => `<button class="admin-tab ${state.view === id ? 'selected' : ''}" data-view="${id}">${label}${id === 'claims' && pending ? `<span class="tab-count">${pending}</span>` : ''}</button>`).join('');
  return `<header class="admin-bar">
      <div><strong>ISTN-SJ · Administração</strong><small>${escapeHtml(state.profile?.full_name || state.session.user.email)} · ${role}</small></div>
      <div class="admin-bar-actions"><a class="text-button" href="/">Ver aplicação</a><button class="button button-outline" data-action="signout">Sair</button></div>
    </header>
    <nav class="admin-tabs">${tabs}</nav>
    <main class="admin-main">${content}</main>`;
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
    <h2>Reuniões no Zoom</h2>
    <p class="admin-hint">Os horários são sempre hora de Luanda. Uma reunião sem hora fixa precisa de uma explicação no lugar dela.</p>
    <button class="button button-gold" data-action="new-meeting">Adicionar reunião</button>
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
      <button class="button button-gold" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'A guardar…' : isNew ? 'Criar igreja' : 'Guardar'}</button>
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
    <h2>Pedidos de verificação</h2>
    <p class="admin-hint">Confirme com a igreja antes de aprovar. Aprovar atribui o selo e mostra a função no perfil da pessoa; recusar deixa-a voltar a pedir.</p>
    ${state.claims.length ? `<div class="claim-list">${state.claims.map(card).join('')}</div>` : '<p class="admin-empty">Não há pedidos à espera.</p>'}
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

function feedView() {
  if (!state.posts) return '<p class="admin-empty">A carregar…</p>';
  const authorOf = (id) => authorName(state.postAuthors?.get(id)) || 'Sem nome';
  const scopeOf = (post) => (post.church_id ? churchLabel(post.church_id) : 'Toda a ISTN');
  const comments = (state.postComments || []).filter((comment) => state.posts.some((post) => post.id === comment.post_id));

  return `<div class="admin-card">
    <h2>Anúncios</h2>
    <p class="admin-hint">Publicados na aplicação. Esconder retira um anúncio da aplicação sem o apagar — e pode ser revertido.</p>
    <ul class="admin-list">${state.posts.map((post) => `<li>
      <div class="admin-row-wide">
        <span>
          <strong>${escapeHtml(post.title || post.body.slice(0, 60))}${post.hidden ? ' · escondido' : ''}</strong>
          <small>${escapeHtml(authorOf(post.author_id))} · ${escapeHtml(scopeOf(post))} · ${escapeHtml(formatPostDate(post.published_at))}</small>
        </span>
        <span class="admin-row-actions">
          ${post.highlighted ? '<span class="status-badge verified">Em destaque</span>' : ''}
          <button class="text-button" type="button" data-post-highlight="${post.id}">${post.highlighted ? 'Retirar destaque' : 'Destacar'}</button>
          <button class="text-button" type="button" data-post-hide="${post.id}">${post.hidden ? 'Repor' : 'Esconder'}</button>
          <button class="text-button admin-danger" type="button" data-post-delete="${post.id}">Eliminar</button>
        </span>
      </div>
    </li>`).join('') || '<li class="admin-empty">Ainda não há anúncios.</li>'}</ul>

    <h3>Comentários</h3>
    <p class="admin-hint">Só servos verificados podem comentar. Esconder um comentário deixa-o invisível na aplicação.</p>
    <ul class="admin-list">${comments.map((comment) => `<li>
      <div class="admin-row-wide">
        <span>
          <strong>${escapeHtml(authorOf(comment.author_id))}${comment.hidden ? ' · escondido' : ''}</strong>
          <small>${escapeHtml(comment.body.slice(0, 90))} · ${escapeHtml(formatPostDate(comment.created_at))}</small>
        </span>
        <span class="admin-row-actions">
          <button class="text-button" type="button" data-comment-hide="${comment.id}">${comment.hidden ? 'Repor' : 'Esconder'}</button>
        </span>
      </div>
    </li>`).join('') || '<li class="admin-empty">Ainda não há comentários.</li>'}</ul>

    ${isCentral() ? `<h3>Quem pode publicar</h3>
    <p class="admin-hint">A equipa central e o Apóstolo publicam sempre; um editor local publica na sua igreja. Aqui dá-se o direito a servos verificados.</p>
    <ul class="admin-list">${(state.publishers || []).map((person) => `<li>
      <div class="admin-row-wide">
        <span><strong>${escapeHtml(person.display_name || 'Sem nome')}</strong><small>${escapeHtml(churchLabel(person.home_church_id))}</small></span>
        <label class="admin-inline"><span class="sr-only">Direito de publicar de ${escapeHtml(person.display_name || '')}</span>
          <select data-publish-scope="${person.id}">
            ${PUBLISH_SCOPES.map((scope) => `<option value="${scope.id}" ${(person.publish_scope || 'nenhum') === scope.id ? 'selected' : ''}>${scope.label}</option>`).join('')}
          </select>
        </label>
      </div>
    </li>`).join('') || '<li class="admin-empty">Ainda não há servos verificados com conta.</li>'}</ul>` : ''}
  </div>`;
}

function servosView() {
  if (!state.servos) return '<p class="admin-empty">A carregar…</p>';
  const mine = isCentral() ? state.servos : state.servos.filter((servo) => servo.church_id === state.profile?.church_id);
  const ministros = mine.filter((servo) => servo.is_minister).length;
  return `<div class="admin-card">
    <h2>Servos</h2>
    <p class="admin-hint">${mine.length} ${mine.length === 1 ? 'registo' : 'registos'} · <strong>${ministros}</strong> ministros. Ministro é de discípulo para cima — a aplicação calcula, não se escolhe.</p>
    <button class="button button-gold" data-action="new-servo">Adicionar servo</button>
    <ul class="admin-list">${mine.map((servo) => `<li>
      <button data-servo="${servo.id}">
        <span><strong class="servo-line">${escapeHtml(servantName(servo))}${badgeTier(servo.role) === 'neutro' ? quietCheck() : verifiedSeal(servo.role)}${servo.active === false ? ' · inativo' : ''}</strong><small>${escapeHtml(roleLabel(servo.role))} · ${escapeHtml(churchLabel(servo.church_id))}</small></span>
        ${servo.is_minister ? '<span class="status-badge verified">Ministro</span>' : ''}
      </button>
    </li>`).join('') || '<li class="admin-empty">Nenhum servo registado.</li>'}</ul>
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
      <label>Contacto <small>(${servo.phone_public ? 'visível no diretório, por escolha do servo' : 'privado'})</small><input type="tel" name="phone" value="${escapeHtml(servo.phone || '')}" /></label>
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
    </div>
  </form></div>`;
}

function churchesView() {
  if (!state.churches) return '<p class="admin-empty">A carregar…</p>';
  const mine = isCentral() ? state.churches : state.churches.filter((church) => church.id === state.profile?.church_id);
  const query = state.query.trim().toLowerCase();
  const visible = mine.filter((church) => {
    const matchesFilter = state.filter === 'todas'
      || (state.filter === 'porVerificar' && church.verification_status !== 'verified')
      || (state.filter === 'verificadas' && church.verification_status === 'verified');
    const haystack = [church.name, church.locality, church.region, church.country, church.country_code, church.leader_name].filter(Boolean).join(' ').toLowerCase();
    return matchesFilter && (!query || haystack.includes(query));
  });
  if (!mine.length) return '<p class="admin-empty">Ainda não tem nenhuma igreja atribuída. Peça à equipa central.</p>';
  const pending = mine.filter((church) => church.verification_status !== 'verified').length;
  return `<div class="admin-card">
    <h2>Diretório</h2>
    <p class="admin-hint">${mine.length} ${mine.length === 1 ? 'registo' : 'registos'} · <strong>${pending}</strong> por verificar. Confirme com a igreja antes de marcar como verificado.</p>
    ${isCentral() ? '<button class="button button-gold" type="button" data-action="new-church">+ Nova igreja</button>' : ''}
    <label class="search-box"><span>⌕</span><input id="church-search" value="${escapeHtml(state.query)}" placeholder="Procurar por nome, localidade, região ou responsável" autocomplete="off" /></label>
    <div class="admin-filters">${[['todas', 'Todas'], ['porVerificar', 'Por verificar'], ['verificadas', 'Verificadas']]
      .map(([id, label]) => `<button class="filter ${state.filter === id ? 'selected' : ''}" data-filter="${id}">${label}</button>`).join('')}</div>
    <ul class="admin-list">${visible.map((church) => `<li>
      <button data-edit="${church.id}">
        <span><strong>${escapeHtml(church.name || church.locality || church.country || 'Sem localidade')}</strong><small>${escapeHtml([SEAT_LABELS[church.seat], church.region, church.country || countryName(church.country_code)].filter(Boolean).join(' · ') || church.modality)}</small></span>
        <span class="status-badge ${church.verification_status}">${church.verification_status === 'verified' ? 'Verificado' : 'A confirmar'}</span>
      </button>
    </li>`).join('') || '<li class="admin-empty">Nenhum registo corresponde.</li>'}</ul>
  </div>`;
}

function churchEditor() {
  const church = state.editing;
  const services = state.services || [];
  const isNew = Boolean(church.isNew);
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
      <label>Telefone<input type="text" name="leader_phone" value="${escapeHtml(church.leader_phone || '')}" /></label>
    </div>
    ${phoneSharedWith(church)}
    <div id="leader-rows">${(Array.isArray(church.other_leaders) ? church.other_leaders : []).map(leaderRow).join('')}</div>
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
function leaderRow(leader = {}) {
  return `<div class="admin-row" data-leader-row>
    <label>Outro responsável<input type="text" data-leader-name value="${escapeHtml(leader.name || '')}" placeholder="Pr. Nome" /></label>
    <label>Telefone<input type="text" data-leader-phone value="${escapeHtml(leader.phone || '')}" /></label>
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
    : churchesView();
  renderInto(root, shell(content) + (state.editing ? churchEditor() : '') + (state.meeting ? meetingEditor() : '') + (state.servo ? servoEditor() : ''));
  bind();
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

// Runs a save or a load with the submit buttons disabled. The page is redrawn
// only when the action succeeds: redrawing after a failure would rebuild the
// open form from the stored record and throw away everything just typed.
function setBusy(busy) {
  state.busy = busy;
  root.querySelectorAll('button[type="submit"], [data-claim-approve], [data-claim-reject]').forEach((button) => {
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

  root.querySelectorAll('[data-view]').forEach((element) => element.addEventListener('click', () => {
    state.view = element.dataset.view;
    render();
    if (state.view === 'history') guard(() => loadAudit());
    if (state.view === 'posts') guard(async () => { await loadFeed(); if (isCentral()) await loadPublishers(); });
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
  root.querySelectorAll('[data-filter]').forEach((element) => element.addEventListener('click', () => { state.filter = element.dataset.filter; render(); }));
  root.querySelectorAll('[data-action="signout"]').forEach((element) => element.addEventListener('click', () => {
    writeSession(null); state.profile = null; state.meetings = null; state.churches = null; state.servos = null; state.claims = null; render();
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
  document.querySelector('[data-action="cancel-meeting"]')?.addEventListener('click', () => { state.meeting = null; render(); });

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
  document.querySelector('[data-action="cancel-servo"]')?.addEventListener('click', () => { state.servo = null; render(); });

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
    const body = {
      full_name: values.full_name.trim(), gender: values.gender, role: values.role,
      church_id: values.church_id || null,
      active: !!values.active
    };
    const phone = (values.phone || '').trim() || null;
    guard(async () => {
      const saved = state.servo.id
        ? await rest(`servos?id=eq.${state.servo.id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) })
        : await rest('servos', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) });
      if (!saved?.length) throw new Error('Não tem permissão para guardar este servo.');
      if (phone !== (state.servo.phone || null)) await saveServoPhone(saved[0].id, phone);
      state.servo = null; await loadServos(); toast('Servo guardado.');
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
    document.querySelector('#leader-rows').insertAdjacentHTML('beforeend', leaderRow());
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

  const search = document.querySelector('#church-search');
  if (search) search.addEventListener('input', (event) => { state.query = event.target.value; render(); });

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

  document.querySelector('[data-action="cancel"]')?.addEventListener('click', () => { state.editing = null; render(); });

  document.querySelector('#church-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.target;
    const values = formValues(form);
    const church = state.editing;
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
      .map((row) => ({ name: row.querySelector('[data-leader-name]').value.trim(), phone: row.querySelector('[data-leader-phone]').value.trim() }))
      .filter((leader) => leader.name || leader.phone);
    const seat = values.seat || null;
    const details = {
      name: values.name.trim() || null,
      place_type: values.place_type || null,
      became_church_on: values.place_type === 'igreja' && values.became_church_on ? values.became_church_on : null,
      locality: values.locality || null, region: values.region || null,
      address: values.address || null,
      leader_name: values.leader_name || null, leader_phone: values.leader_phone || null,
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
      state.editing = null; state.services = null;
      await loadChurches();
      toast('Registo guardado.');
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
