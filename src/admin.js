const root = document.querySelector('#admin');
const SESSION_KEY = 'elias-admin-session';

const state = {
  config: null, session: null, profile: null,
  view: 'live', live: null, churches: null,
  query: '', filter: 'todas', editing: null, busy: false
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

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
  if (!response.ok) throw new Error(`A base de dados respondeu ${response.status}.`);
  return response.status === 204 ? null : response.json();
}

// ------------------------------------------------------------------ dados --

async function loadProfile() {
  const rows = await rest(`admin_profiles?select=id,full_name,role,church_id&id=eq.${state.session.user.id}`);
  state.profile = rows[0] || { role: 'local', church_id: null, full_name: state.session.user.email };
}

async function loadLive() {
  const rows = await rest('live_config?select=*&limit=1');
  state.live = rows[0] || null;
}

async function loadChurches() {
  state.churches = await rest('churches?select=*&order=country_code.asc,region.asc,locality.asc');
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
  const tabs = [['live', 'Reuniões'], ['churches', 'Diretório']]
    .filter(([id]) => id !== 'live' || isCentral())
    .map(([id, label]) => `<button class="admin-tab ${state.view === id ? 'selected' : ''}" data-view="${id}">${label}</button>`).join('');
  return `<header class="admin-bar">
      <div><strong>ELIAS · Administração</strong><small>${escapeHtml(state.profile?.full_name || state.session.user.email)} · ${role}</small></div>
      <div class="admin-bar-actions"><a class="text-button" href="/">Ver aplicação</a><button class="button button-outline" data-action="signout">Sair</button></div>
    </header>
    <nav class="admin-tabs">${tabs}</nav>
    <main class="admin-main">${content}</main>`;
}

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function liveView() {
  if (!isCentral()) return '<p class="admin-empty">Só a equipa central pode alterar a programação das reuniões.</p>';
  if (!state.live) return '<p class="admin-empty">A carregar…</p>';
  const live = state.live;
  const schedule = Array.isArray(live.schedule) ? live.schedule : [];
  const rows = WEEKDAYS.map((label, weekday) => {
    const slot = schedule.find((item) => item.weekday === weekday) || { weekday, label };
    return `<tr>
      <th>${label}</th>
      <td><input type="time" name="time-${weekday}" value="${escapeHtml(slot.time || '')}" /></td>
      <td><input type="text" name="note-${weekday}" value="${escapeHtml(slot.note || '')}" placeholder="Sem hora fixa: descreva quando" /></td>
    </tr>`;
  }).join('');
  return `<form id="live-form" class="admin-card">
    <h2>Reunião no Zoom</h2>
    <p class="admin-hint">Estes valores são o que a congregação vê. O horário é sempre hora de Luanda.</p>
    <label>Título<input type="text" name="title" value="${escapeHtml(live.title || '')}" required /></label>
    <label>Subtítulo<input type="text" name="subtitle" value="${escapeHtml(live.subtitle || '')}" /></label>
    <div class="admin-row">
      <label>Link do Zoom<input type="url" name="zoom_url" value="${escapeHtml(live.zoom_url || '')}" /></label>
      <label>ID da reunião<input type="text" name="zoom_meeting_id" value="${escapeHtml(live.zoom_meeting_id || '')}" /></label>
      <label>Senha<input type="text" name="zoom_passcode" value="${escapeHtml(live.zoom_passcode || '')}" /></label>
    </div>
    <label>Canal do YouTube<input type="url" name="youtube_url" value="${escapeHtml(live.youtube_url || '')}" /></label>
    <label>Nota para a congregação<input type="text" name="note" value="${escapeHtml(live.note || '')}" /></label>
    <label class="admin-narrow">Duração (minutos)<input type="number" name="duration_minutes" min="15" max="600" value="${live.duration_minutes || 120}" /></label>
    <h3>Horário semanal</h3>
    <p class="admin-hint">Deixe a hora vazia num dia sem hora fixa e explique na nota — é assim que a terça-feira aparece hoje.</p>
    <table class="admin-schedule"><tbody>${rows}</tbody></table>
    <button class="button button-gold" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'A guardar…' : 'Guardar alterações'}</button>
  </form>`;
}

function churchesView() {
  if (!state.churches) return '<p class="admin-empty">A carregar…</p>';
  const mine = isCentral() ? state.churches : state.churches.filter((church) => church.id === state.profile?.church_id);
  const query = state.query.trim().toLowerCase();
  const visible = mine.filter((church) => {
    const matchesFilter = state.filter === 'todas'
      || (state.filter === 'porVerificar' && church.verification_status !== 'verified')
      || (state.filter === 'verificadas' && church.verification_status === 'verified');
    const haystack = [church.locality, church.region, church.country, church.country_code, church.leader_name].filter(Boolean).join(' ').toLowerCase();
    return matchesFilter && (!query || haystack.includes(query));
  });
  if (!mine.length) return '<p class="admin-empty">Ainda não tem nenhuma congregação atribuída. Peça à equipa central.</p>';
  const pending = mine.filter((church) => church.verification_status !== 'verified').length;
  return `<div class="admin-card">
    <h2>Diretório</h2>
    <p class="admin-hint">${mine.length} ${mine.length === 1 ? 'registo' : 'registos'} · <strong>${pending}</strong> por verificar. Confirme com a congregação antes de marcar como verificado.</p>
    <label class="search-box"><span>⌕</span><input id="church-search" value="${escapeHtml(state.query)}" placeholder="Procurar por localidade, região ou responsável" autocomplete="off" /></label>
    <div class="admin-filters">${[['todas', 'Todas'], ['porVerificar', 'Por verificar'], ['verificadas', 'Verificadas']]
      .map(([id, label]) => `<button class="filter ${state.filter === id ? 'selected' : ''}" data-filter="${id}">${label}</button>`).join('')}</div>
    <ul class="admin-list">${visible.map((church) => `<li>
      <button data-edit="${church.id}">
        <span><strong>${escapeHtml(church.locality || church.country || 'Sem localidade')}</strong><small>${escapeHtml([church.region, church.country_code || church.country].filter(Boolean).join(' · ') || church.modality)}</small></span>
        <span class="status-badge ${church.verification_status}">${church.verification_status === 'verified' ? 'Verificado' : 'A confirmar'}</span>
      </button>
    </li>`).join('') || '<li class="admin-empty">Nenhum registo corresponde.</li>'}</ul>
  </div>`;
}

function churchEditor() {
  const church = state.editing;
  return `<div class="admin-overlay"><form id="church-form" class="admin-card admin-dialog">
    <h2>${escapeHtml(church.locality || church.country || 'Congregação')}</h2>
    <p class="admin-hint">Origem: ${escapeHtml(church.source || church.note || 'registo operacional')}</p>
    <div class="admin-row">
      <label>Localidade<input type="text" name="locality" value="${escapeHtml(church.locality || '')}" /></label>
      <label>Região<input type="text" name="region" value="${escapeHtml(church.region || '')}" /></label>
    </div>
    <div class="admin-row">
      <label>Dia<input type="text" name="service_day" value="${escapeHtml(church.service_day || '')}" placeholder="Domingo" /></label>
      <label>Hora local<input type="text" name="service_time_local" value="${escapeHtml(church.service_time_local || '')}" placeholder="09:00" /></label>
    </div>
    <div class="admin-row">
      <label>Responsável<input type="text" name="leader_name" value="${escapeHtml(church.leader_name || '')}" /></label>
      <label>Telefone<input type="text" name="leader_phone" value="${escapeHtml(church.leader_phone || '')}" /></label>
    </div>
    <label>Nota<input type="text" name="note" value="${escapeHtml(church.note || '')}" /></label>
    <label class="admin-check"><input type="checkbox" name="verified" ${church.verification_status === 'verified' ? 'checked' : ''} /> Confirmei estes dados com a congregação</label>
    <div class="admin-dialog-actions">
      <button class="button button-outline" type="button" data-action="cancel">Cancelar</button>
      <button class="button button-gold" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'A guardar…' : 'Guardar'}</button>
    </div>
  </form></div>`;
}

// ---------------------------------------------------------------- ligação --

function render() {
  if (!state.config) { root.innerHTML = '<p class="admin-empty">A carregar…</p>'; return; }
  if (!state.config.supabaseUrl) {
    root.innerHTML = '<p class="admin-empty">A ligação à base de dados não está configurada neste servidor. Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY.</p>';
    return;
  }
  if (!state.session) { root.innerHTML = loginView(); bind(); return; }
  const content = state.view === 'live' ? liveView() : churchesView();
  root.innerHTML = shell(content) + (state.editing ? churchEditor() : '');
  bind();
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function guard(action) {
  state.busy = true; render();
  try { await action(); }
  catch (error) { toast(error.message, 'erro'); }
  finally { state.busy = false; render(); }
}

function bind() {
  document.querySelector('#login-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const { email, password } = formValues(event.target);
    guard(async () => {
      writeSession(await authRequest('password', { email, password }));
      await loadProfile();
      state.view = isCentral() ? 'live' : 'churches';
      await (isCentral() ? loadLive() : Promise.resolve());
      await loadChurches();
      toast('Sessão iniciada.');
    });
  });

  root.querySelectorAll('[data-view]').forEach((element) => element.addEventListener('click', () => { state.view = element.dataset.view; render(); }));
  root.querySelectorAll('[data-filter]').forEach((element) => element.addEventListener('click', () => { state.filter = element.dataset.filter; render(); }));
  root.querySelectorAll('[data-action="signout"]').forEach((element) => element.addEventListener('click', () => {
    writeSession(null); state.profile = null; state.live = null; state.churches = null; render();
  }));

  const search = document.querySelector('#church-search');
  if (search) search.addEventListener('input', (event) => {
    state.query = event.target.value; render();
    const again = document.querySelector('#church-search');
    if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
  });

  root.querySelectorAll('[data-edit]').forEach((element) => element.addEventListener('click', () => {
    state.editing = state.churches.find((church) => church.id === element.dataset.edit) || null;
    render();
  }));

  document.querySelector('[data-action="cancel"]')?.addEventListener('click', () => { state.editing = null; render(); });

  document.querySelector('#live-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = formValues(event.target);
    const schedule = WEEKDAYS.map((label, weekday) => {
      const time = values[`time-${weekday}`] ? values[`time-${weekday}`].slice(0, 5) : null;
      const note = (values[`note-${weekday}`] || '').trim();
      return { weekday, label, time, ...(note ? { note } : {}) };
    });
    guard(async () => {
      await rest(`live_config?id=eq.${state.live.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          title: values.title, subtitle: values.subtitle || null,
          zoom_url: values.zoom_url || null, zoom_meeting_id: values.zoom_meeting_id || null,
          zoom_passcode: values.zoom_passcode || null, youtube_url: values.youtube_url || null,
          note: values.note || null, duration_minutes: Number(values.duration_minutes) || 120,
          schedule
        })
      });
      await loadLive();
      toast('Programação atualizada.');
    });
  });

  document.querySelector('#church-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = formValues(event.target);
    const church = state.editing;
    guard(async () => {
      const updated = await rest(`churches?id=eq.${church.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          locality: values.locality || null, region: values.region || null,
          service_day: values.service_day || null, service_time_local: values.service_time_local || null,
          leader_name: values.leader_name || null, leader_phone: values.leader_phone || null,
          note: values.note || null,
          verification_status: values.verified ? 'verified' : 'needs_review',
          verified_at: values.verified ? new Date().toISOString() : null,
          verified_by: values.verified ? state.session.user.id : null
        })
      });
      if (!updated?.length) throw new Error('Não tem permissão para alterar este registo.');
      state.editing = null;
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
      if (isCentral()) await loadLive();
      await loadChurches();
      if (!isCentral()) state.view = 'churches';
    } catch { writeSession(null); }
  }
  render();
}

start();
