// The signed-in member's profile: a card at the top and a menu of sections
// below, each row opening a sheet that edits one thing. One field per sheet
// keeps every save small, and nobody has to scroll a long form to change a
// phone number.
import { badgeFor, loadProfile, saveProfile, signOut } from './account.js';
import { ISTN_COUNTRIES, countryList, countryName } from './countries.js';
import { DEFAULT_COUNTRY, phoneControl, phoneFromValues } from './phones.js';
import { claimableRoles, isMinisterRole, rankPrefixOf, roleLabel, verifiedSeal } from './roles.js';
import { uploadPhoto } from './upload.js';
import { safeUrl } from './html.js';
import { icon } from './icons.js';

const LANGUAGES = [
  ['pt', 'Português'], ['fr', 'Français'], ['en', 'English'], ['es', 'Español']
];

const svg = (name, size = 20) => icon(name, { size });

// Null when the account has no name yet — someone who signed in with Google,
// where the app does not borrow the name Google holds.
const initials = (name) => String(name ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '·';

function churchLabel(church, withContext = false) {
  if (!church) return '';
  const place = church.name || church.locality || church.country || 'Sem nome';
  const kind = church.place_type === 'casa_de_oracao' ? ' (casa de oração)' : '';
  if (!withContext) return `${place}${kind}`;
  const context = [church.region, countryName(church.country_code) || church.country].filter(Boolean).join(', ');
  return context ? `${place}${kind} — ${context}` : `${place}${kind}`;
}

// The fields a profile is measured against. Language and reminders have
// defaults, so they are never "missing".
const COMPLETENESS = ['display_name', 'photo_url', 'gender', 'phone', 'country_code', 'city', 'home_church_id'];

export function profileView({ state, escapeHtml, header, navigation, extraSection = '' }) {
  const profile = state.profile;
  const badge = badgeFor(profile);
  const churches = state.churchOptions || [];
  const home = churches.find((church) => church.id === profile.home_church_id);
  const filled = COMPLETENESS.filter((field) => profile[field]).length;
  const claim = profile.servo_claim_status || 'nenhum';
  // The person's own name, so editing it shows at once. The servant record the
  // team verified keeps its own name, shown in the directory.
  const displayName = profile.display_name || 'Sem nome';
  const directoryName = badge?.name && badge.name !== profile.display_name ? badge.name : '';

  const identity = badge
    ? (badge.tier === 'neutro'
      ? `<p class="profile-card-role">Servo verificado · ${escapeHtml(badge.label)}</p>`
      : `<p class="profile-card-role strong">${escapeHtml(badge.label)}</p>`)
    : `<p class="profile-card-role">Membro da ISTN-SJ</p>`;

  const empty = (text = 'Por preencher') => `<span class="menu-value empty">${text}</span>`;
  const value = (text) => text ? `<span class="menu-value">${escapeHtml(text)}</span>` : empty();

  const serviceValue = {
    aprovado: `<span class="menu-value verified">${badge ? verifiedSeal(badge.role) : ''}${escapeHtml(badge?.label || roleLabel(profile.claimed_role))}</span>`,
    pendente: `<span class="status-pill pending">A aguardar · ${escapeHtml(roleLabel(profile.claimed_role))}</span>`,
    recusado: '<span class="status-pill refused">Não aprovado</span>',
    nenhum: empty('Não indicada')
  }[claim];

  const row = (key, icon, label, valueHtml, tone) => `<li>
    <button class="menu-row" data-profile-edit="${key}">
      <span class="menu-icon tone-${tone}">${svg(icon)}</span>
      <span class="menu-label">${label}</span>
      ${valueHtml}
      <span class="menu-chevron">${svg('chevron', 16)}</span>
    </button>
  </li>`;

  return `${header({ title: 'Perfil', back: 'home' })}<main id="conteudo" class="page-content profile-page" tabindex="-1">
    <section class="profile-card">
      <label class="profile-avatar ${state.uploading ? 'is-busy' : ''}" aria-label="Alterar fotografia">
        ${safeUrl(profile.photo_url) ? `<img src="${escapeHtml(safeUrl(profile.photo_url))}" alt="" />` : `<span class="profile-initials">${escapeHtml(initials(profile.display_name))}</span>`}
        <span class="profile-avatar-action">${state.uploading ? '<i class="loader"></i>' : svg('camera', 16)}</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" data-profile-photo ${state.uploading ? 'disabled' : ''} />
      </label>
      <h1 class="verified-name">${escapeHtml(displayName)}${badge ? verifiedSeal(badge.role, { title: `Conta verificada · ${badge.label}` }) : ''}</h1>
      ${identity}
      ${directoryName ? `<p class="profile-card-meta">No diretório: ${escapeHtml(directoryName)}</p>` : ''}
      ${!profile.display_name ? '<p class="profile-card-missing">Falta o seu nome. Toque em «Nome» para o indicar.</p>' : ''}
      ${home || profile.country_code ? `<p class="profile-card-meta">${escapeHtml([home && churchLabel(home), countryName(profile.country_code)].filter(Boolean).join(' · '))}</p>` : ''}
      ${filled < COMPLETENESS.length ? `<div class="profile-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${COMPLETENESS.length}" aria-valuenow="${filled}">
        <span>Perfil ${filled} de ${COMPLETENESS.length}</span>
        <i style="--done:${Math.round((filled / COMPLETENESS.length) * 100)}%"></i>
      </div>` : ''}
    </section>

    <section class="menu-group">
      <h2 class="menu-heading">Dados pessoais</h2>
      <ul class="menu-list">
        ${row('display_name', 'user', 'Nome', value(profile.display_name), 'green')}
        ${row('gender', 'gender', 'Género', value({ masculino: 'Masculino', feminino: 'Feminino' }[profile.gender]), 'green')}
        ${row('phone', 'phone', 'Telefone', value(profile.phone), 'green')}
        ${phoneVisibilityRow({ state })}
        ${row('country_code', 'globe', 'País', value(countryName(profile.country_code)), 'green')}
        ${row('city', 'pin', 'Cidade', value(profile.city), 'green')}
      </ul>
      <p class="menu-footnote">${contactFootnote(profile, claim)}</p>
    </section>

    <section class="menu-group">
      <h2 class="menu-heading">A minha ISTN</h2>
      <ul class="menu-list">
        ${row('home_church_id', 'church', 'Igreja', value(home ? churchLabel(home) : ''), 'gold')}
      </ul>
    </section>

    <section class="menu-group">
      <h2 class="menu-heading">Serviço na ISTN</h2>
      <ul class="menu-list">
        ${row('service', 'badge', 'Função', serviceValue, 'blue')}
      </ul>
    </section>

    <section class="menu-group">
      <h2 class="menu-heading">Preferências</h2>
      <ul class="menu-list">
        ${row('language', 'language', 'Idioma', value(LANGUAGES.find(([code]) => code === (profile.language || 'pt'))?.[1]), 'sand')}
        <li>
          <div class="menu-row is-static">
            <span class="menu-icon tone-sand">${svg('bell')}</span>
            <span class="menu-label">Lembretes das reuniões</span>
            <button class="switch" role="switch" aria-checked="${profile.meeting_reminders !== false}" aria-label="Lembretes das reuniões" data-profile-toggle="meeting_reminders"><i></i></button>
          </div>
        </li>
      </ul>
    </section>

    ${extraSection}

    <section class="menu-group">
      <h2 class="menu-heading">Conta</h2>
      <ul class="menu-list">
        <li><div class="menu-row is-static">
          <span class="menu-icon tone-grey">${svg('mail')}</span>
          <span class="menu-label">Email</span>
          <span class="menu-value">${escapeHtml(state.session?.user?.email || '—')}</span>
        </div></li>
        <li><button class="menu-row danger" data-profile-signout>
          <span class="menu-icon tone-red">${svg('logout')}</span>
          <span class="menu-label">Terminar sessão</span>
        </button></li>
      </ul>
    </section>
  </main>${state.profileSheet ? sheetView({ state, escapeHtml }) : ''}${navigation()}`;
}

// Said plainly, and only what is true: today the app shows a contact in one
// place — the church's page in the directory, and only of those who serve
// there. For everyone else the switch records the answer for the day it
// matters, and promises nothing in the meantime.
function contactFootnote(profile, claim) {
  if (!profile.phone_public) {
    return 'O seu contacto está oculto: só a equipa ISTN-SJ o vê. A escolha é sua, e pode mudá-la quando quiser.';
  }
  return claim === 'aprovado' && profile.servo_id
    ? 'O seu número aparece junto do seu nome na página da sua igreja.'
    : 'Autorizou a ISTN-SJ a mostrar o seu número. Por agora a aplicação só mostra o contacto de quem serve na igreja: até lá, o seu continua a ser visto apenas pela equipa.';
}

// Whether the person's number may be shown to anyone else. Every account
// decides for itself, and the answer is no until it says otherwise — for a
// verified servant the directory follows the same switch (migração de
// 21/09/2026), so there is one choice and not two.
function phoneVisibilityRow({ state }) {
  const { phone, phone_public: on } = state.profile;
  return `<li><div class="menu-row is-static">
    <span class="menu-icon tone-blue">${svg('eye')}</span>
    <span class="menu-label">Mostrar o meu contacto</span>
    ${phone
      ? `<button class="switch" role="switch" aria-checked="${Boolean(on)}" aria-label="Mostrar o meu contacto a outras pessoas" data-profile-toggle="phone_public"><i></i></button>`
      : '<span class="menu-value empty">Indique primeiro o telefone</span>'}
  </div></li>`;
}

// ------------------------------------------------------------ as folhas ----

function sheetView({ state, escapeHtml }) {
  const profile = state.profile;
  const key = state.profileSheet;
  const locked = ['pendente', 'aprovado'].includes(profile.servo_claim_status);
  const radios = (name, options, current) => `<div class="choice-grid">${options.map(([id, label, hint]) => `
    <label class="choice"><input type="radio" name="${name}" value="${id}" ${current === id ? 'checked' : ''} />
      <span><strong>${escapeHtml(label)}</strong>${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</span>
    </label>`).join('')}</div>`;

  let title = '';
  let body = '';
  let submit = 'Guardar';

  switch (key) {
    case 'display_name':
      title = 'Nome';
      body = `<label class="sheet-field">Como quer ser chamado<input type="text" name="display_name" value="${escapeHtml(profile.display_name || '')}" autocomplete="name" maxlength="80" required /></label>
        <p class="sheet-hint">Escreva só o nome, sem a função: a aplicação acrescenta «Bp.», «Pr.» ou «Dona» conforme a função aprovada.</p>
        ${badgeFor(profile) ? '<p class="sheet-hint">No diretório continua a aparecer o nome registado pela equipa.</p>' : ''}`;
      break;
    case 'gender':
      title = 'Género';
      body = locked
        ? '<p class="sheet-hint">Não pode ser alterado enquanto houver um pedido de função em análise ou aprovado.</p>'
        : `<p class="sheet-hint">Determina as funções que pode pedir na ISTN.</p>${radios('gender', [['masculino', 'Masculino'], ['feminino', 'Feminino']], profile.gender)}`;
      if (locked) submit = '';
      break;
    case 'phone':
      title = 'Telefone';
      body = `<label class="sheet-field">Número de telefone${phoneControl({ value: profile.phone || '', country: profile.country_code || DEFAULT_COUNTRY })}</label>
        <p class="sheet-hint">Escolha o indicativo do seu país na lista e escreva só o resto do número.</p>`;
      break;
    case 'country_code': {
      title = 'País';
      const all = countryList();
      const option = (country) => `<option value="${country.code}" ${profile.country_code === country.code ? 'selected' : ''}>${escapeHtml(country.name)}</option>`;
      body = `<label class="sheet-field">Onde vive<select name="country_code">
        <option value="">— Não indicar —</option>
        <optgroup label="Onde a ISTN-SJ está presente">${all.filter((country) => ISTN_COUNTRIES.includes(country.code)).map(option).join('')}</optgroup>
        <optgroup label="Todos os países">${all.map(option).join('')}</optgroup>
      </select></label>`;
      break;
    }
    case 'city':
      title = 'Cidade';
      body = `<label class="sheet-field">Cidade ou localidade<input type="text" name="city" value="${escapeHtml(profile.city || '')}" autocomplete="address-level2" maxlength="80" /></label>`;
      break;
    case 'home_church_id':
      title = 'A minha ISTN';
      body = churchSelect({ state, escapeHtml, name: 'home_church_id', current: profile.home_church_id, label: 'A igreja que frequenta' });
      break;
    case 'language':
      title = 'Idioma';
      body = `<p class="sheet-hint">A aplicação está em português. Esta preferência é usada nas comunicações da ISTN-SJ.</p>${radios('language', LANGUAGES.map(([code, label]) => [code, label]), profile.language || 'pt')}`;
      break;
    case 'service':
      ({ title, body, submit } = serviceSheet({ state, escapeHtml, radios }));
      break;
    default:
      return '';
  }

  return `<div class="sheet-backdrop" data-sheet-close>
    <form class="sheet" id="profile-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" data-sheet="${key}">
      <span class="sheet-grip" aria-hidden="true"></span>
      <h2 id="sheet-title">${title}</h2>
      ${body}
      <div class="sheet-actions">
        ${submit ? `<button class="button button-gold full-width" type="submit" ${state.profileSaving ? 'disabled' : ''}>${state.profileSaving ? 'A guardar…' : submit}</button>` : ''}
        <button class="text-button" type="button" data-sheet-close>${submit ? 'Cancelar' : 'Fechar'}</button>
      </div>
    </form>
  </div>`;
}

function churchSelect({ state, escapeHtml, name, current, label, required = false }) {
  const churches = state.churchOptions || [];
  if (!churches.length) return '<p class="sheet-hint">A carregar as igrejas…</p>';
  const byCountry = new Map();
  churches.forEach((church) => {
    const group = countryName(church.country_code) || church.country || 'Online';
    if (!byCountry.has(group)) byCountry.set(group, []);
    byCountry.get(group).push(church);
  });
  const groups = [...byCountry.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt'));
  return `<label class="sheet-field">${label}<select name="${name}" ${required ? 'required' : ''}>
    <option value="">— Ainda não escolhi —</option>
    ${groups.map(([group, items]) => `<optgroup label="${escapeHtml(group)}">${items.map((church) => `<option value="${church.id}" ${current === church.id ? 'selected' : ''}>${escapeHtml(churchLabel(church))}${church.region ? ` — ${escapeHtml(church.region)}` : ''}</option>`).join('')}</optgroup>`).join('')}
  </select></label>`;
}

function serviceSheet({ state, escapeHtml, radios }) {
  const profile = state.profile;
  const claim = profile.servo_claim_status || 'nenhum';
  const badge = badgeFor(profile);

  if (claim === 'aprovado') {
    return {
      title: 'Função',
      submit: '',
      body: `<div class="service-summary">
        <p class="verified-name">${escapeHtml(badge?.name || profile.display_name || '')}${badge ? verifiedSeal(badge.role) : ''}</p>
        <p>Verificado como <strong>${escapeHtml(badge?.label || roleLabel(profile.claimed_role))}</strong>${badge?.church ? ` em ${escapeHtml(badge.church)}` : ''}.</p>
      </div>
      <p class="sheet-hint">Para alterar a função, fale com a equipa ISTN-SJ — é ela que a confirma.</p>`
    };
  }

  if (claim === 'pendente') {
    const church = (state.churchOptions || []).find((item) => item.id === profile.home_church_id);
    return {
      title: 'Pedido em análise',
      submit: '',
      body: `<div class="service-summary">
        <p><strong>${escapeHtml(roleLabel(profile.claimed_role))}</strong>${church ? ` em ${escapeHtml(church.name || church.locality || church.country || '')}` : ''}</p>
        <p>A equipa ISTN-SJ vai confirmar antes de atribuir o selo. Enquanto o pedido estiver em análise, a função e o género não podem ser alterados.</p>
      </div>
      <button class="button button-outline full-width" type="button" data-service-withdraw>Retirar o pedido</button>`
    };
  }

  const gender = state.sheetGender ?? profile.gender ?? '';
  const roles = gender ? claimableRoles(gender) : [];
  return {
    title: 'Indicar função',
    submit: 'Enviar para aprovação',
    body: `${claim === 'recusado' ? '<p class="sheet-notice">O pedido anterior não foi aprovado. Pode corrigir e voltar a enviar.</p>' : ''}
      <p class="sheet-hint">A função fica visível no seu perfil só depois de a equipa ISTN-SJ a confirmar. Ninguém se verifica a si próprio.</p>
      <p class="sheet-label">Género</p>
      ${radios('gender', [['masculino', 'Masculino'], ['feminino', 'Feminino']], gender)}
      <p class="sheet-label">Função</p>
      ${gender
        ? `<div class="choice-grid roles">${roles.map((role) => `
            <label class="choice"><input type="radio" name="claimed_role" value="${role.id}" ${profile.claimed_role === role.id ? 'checked' : ''} required />
              <span><strong>${escapeHtml(role.label)}</strong>${isMinisterRole(role.id) ? '<small>Ministro</small>' : ''}</span>
            </label>`).join('')}</div>`
        : '<p class="sheet-hint">Escolha primeiro o género.</p>'}
      ${churchSelect({ state, escapeHtml, name: 'home_church_id', current: state.sheetChurch ?? profile.home_church_id, label: 'Igreja onde serve', required: true })}`
  };
}

// ------------------------------------------------------------ interação ----

export function bindProfile({ state, render, showToast }) {
  const close = () => { state.profileSheet = null; state.sheetGender = null; state.sheetChurch = null; render(); };
  const refocus = () => document.querySelector('#profile-sheet input:not([type=radio]), #profile-sheet select, #profile-sheet input[type=radio]:checked, #profile-sheet input[type=radio]')?.focus();

  document.querySelectorAll('[data-profile-edit]').forEach((element) => element.addEventListener('click', () => {
    state.profileSheet = element.dataset.profileEdit;
    state.sheetGender = null;
    state.sheetChurch = null;
    render();
    refocus();
  }));

  document.querySelectorAll('[data-sheet-close]').forEach((element) => element.addEventListener('click', (event) => {
    if (event.target === element) close();
  }));

  const sheet = document.querySelector('#profile-sheet');
  if (sheet) {
    sheet.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
    // In the service sheet the role list depends on gender; redraw just that.
    if (sheet.dataset.sheet === 'service') {
      sheet.querySelectorAll('input[name="gender"]').forEach((input) => input.addEventListener('change', () => {
        state.sheetGender = input.value;
        state.sheetChurch = sheet.querySelector('select[name="home_church_id"]')?.value ?? state.sheetChurch;
        render();
        document.querySelector('#profile-sheet input[name="claimed_role"]')?.focus();
      }));
    }
  }

  const save = async (changes, message) => {
    state.profileSaving = true; render();
    try {
      await saveProfile(changes);
      // Read the row back: a PATCH answers without the linked servant, and the
      // card would lose the seal until the next reload.
      state.profile = await loadProfile(state.session) || state.profile;
      state.profileSheet = null; state.sheetGender = null; state.sheetChurch = null;
      showToast(message);
    } catch (error) {
      showToast(error.message);
    } finally {
      state.profileSaving = false; render();
    }
  };

  sheet?.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(sheet).entries());
    const key = sheet.dataset.sheet;
    const text = (field) => (values[field] || '').trim() || null;

    if (key === 'service') {
      if (!values.gender || !values.claimed_role || !values.home_church_id) {
        showToast('Indique o género, a função e a igreja.');
        return;
      }
      save({
        gender: values.gender, claimed_role: values.claimed_role,
        home_church_id: values.home_church_id, servo_claim_status: 'pendente'
      }, 'Pedido enviado. A equipa ISTN-SJ vai confirmar.');
      return;
    }

    if (key === 'gender') {
      if (!values.gender) { close(); return; }
      const changes = { gender: values.gender };
      // A role asked for earlier may not exist for the new gender; the database
      // would refuse the pair, so drop the stale role with it.
      const stillValid = claimableRoles(values.gender).some((role) => role.id === state.profile.claimed_role);
      if (state.profile.claimed_role && !stillValid) changes.claimed_role = null;
      save(changes, 'Género guardado.');
      return;
    }

    const changes = {
      display_name: { display_name: text('display_name') },
      phone: { phone: phoneFromValues(values) || null },
      country_code: { country_code: values.country_code || null },
      city: { city: text('city') },
      home_church_id: { home_church_id: values.home_church_id || null },
      language: { language: values.language || 'pt' }
    }[key];
    if (key === 'display_name') {
      if (!changes.display_name) { showToast('O nome não pode ficar vazio.'); return; }
      const rank = rankPrefixOf(changes.display_name);
      if (rank) { showToast(`Escreva o nome sem «${rank}»: a função é acrescentada pela aplicação.`); return; }
    }
    if (changes) save(changes, 'Guardado.');
  });

  document.querySelector('[data-service-withdraw]')?.addEventListener('click', () => {
    save({ servo_claim_status: 'nenhum' }, 'Pedido retirado.');
  });

  const TOGGLE_SAID = {
    phone_public: [
      'O seu contacto passa a estar visível.',
      'O seu contacto ficou oculto.'
    ]
  };

  document.querySelectorAll('[data-profile-toggle]').forEach((toggle) => toggle.addEventListener('click', () => {
    const field = toggle.dataset.profileToggle;
    const next = toggle.getAttribute('aria-checked') !== 'true';
    toggle.setAttribute('aria-checked', String(next));
    saveProfile({ [field]: next })
      .then((profile) => {
        state.profile = profile || state.profile;
        const said = TOGGLE_SAID[field];
        if (said) { showToast(next ? said[0] : said[1]); render(); }
      })
      .catch((error) => { toggle.setAttribute('aria-checked', String(!next)); showToast(error.message); });
  }));

  document.querySelector('[data-profile-photo]')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    state.uploading = true; render();
    try {
      const url = await uploadPhoto(file, 'membros', state.session.user.id, state.session);
      state.profile = await saveProfile({ photo_url: url }) || state.profile;
      showToast('Fotografia atualizada.');
    } catch (error) { showToast(error.message); }
    finally { state.uploading = false; render(); }
  });

  document.querySelector('[data-profile-signout]')?.addEventListener('click', () => {
    signOut();
    state.session = null; state.profile = null; state.profileSheet = null;
    render();
    showToast('Sessão terminada.');
  });
}
