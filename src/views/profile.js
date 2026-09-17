// "Perfil": what this device remembers, for everyone, and the optional account.
//
// The team decided using the app needs no account, and that without one the
// preferences live on the device. So the page starts with those — the reader's
// church, saved teachings, reminders — and offers the account after, as a way
// to carry them to another phone, not as a gate.
import { escapeHtml } from '../html.js';
import { icon } from '../icons.js';
import { prefs } from '../prefs.js';
import { bindProfile, profileView } from '../profile.js';
import { header, navigation, page } from './shared.js';

const listOfNames = (providers) => providers.map((provider) => provider.name)
  .reduce((text, name, index, all) => (index === 0 ? name : `${text}${index === all.length - 1 ? ' ou ' : ', '}${name}`), '');

function menuLink(href, iconName, tone, label, value, attrs = '') {
  return `<li><a class="menu-row" href="${escapeHtml(href)}" ${attrs}>
    <span class="menu-icon tone-${tone}">${icon(iconName)}</span>
    <span class="menu-label">${label}</span>
    ${value}
    <span class="menu-chevron">${icon('chevron', { size: 16 })}</span>
  </a></li>`;
}

export function deviceSection(state) {
  const church = prefs.myChurch && state.directory?.churches.find((item) => item.id === prefs.myChurch);
  const saved = prefs.favorites.size;
  const value = (text, empty = false) => `<span class="menu-value ${empty ? 'empty' : ''}">${escapeHtml(text)}</span>`;
  return `<section class="menu-group">
    <h2 class="menu-heading">Neste dispositivo</h2>
    <ul class="menu-list">
      ${menuLink(church ? `/igrejas/${church.id}` : '/igrejas', 'church', 'gold', 'A minha ISTN', church ? value(church.name) : value('Escolher', true))}
      ${menuLink('/ensinos?guardadas=1', 'heart', 'green', 'Pregações guardadas', value(saved ? String(saved) : 'Nenhuma', !saved))}
      ${menuLink(`webcal://${window.location.host}/calendario.ics`, 'bell', 'sand', 'Lembretes das reuniões', value('Calendário'), 'data-external')}
    </ul>
    <p class="menu-footnote">${state.profile ? 'A igreja escolhida aqui também fica guardada na sua conta.' : 'Guardado só neste telemóvel. Com uma conta, acompanha-o noutros dispositivos.'}</p>
  </section>`;
}

function accountForm(state) {
  if (!state.accountsAvailable) {
    return `<p class="notice">${icon('info', { size: 18 })}<span>As contas ainda não estão disponíveis. Tudo o resto funciona sem conta.</span></p>`;
  }
  const register = state.authMode === 'registar';
  return `<form id="account-form" class="account-card">
      <h2>${register ? 'Criar conta' : 'Entrar'}</h2>
      ${state.providers?.length ? `<p class="account-note">Com email e palavra-passe, ou por ${escapeHtml(listOfNames(state.providers))} — a conta é a mesma em qualquer dos casos.</p>` : ''}
      <label>Email<input type="email" name="email" autocomplete="username" required inputmode="email" /></label>
      <label>Palavra-passe<input type="password" name="password" autocomplete="${register ? 'new-password' : 'current-password'}" required minlength="6" /></label>
      <button class="button button-gold full-width" type="submit" ${state.authBusy ? 'disabled' : ''}>${state.authBusy ? 'Um momento…' : register ? 'Criar conta' : 'Entrar'}</button>
    </form>
    ${state.providers?.length ? `<div class="account-providers">${state.providers.map((provider) => `<button class="button button-outline full-width" type="button" data-action="provider" data-provider="${escapeHtml(provider.id)}">${escapeHtml(provider.label)}</button>`).join('')}</div>` : ''}
    <button class="text-button account-switch" type="button" data-action="switch-auth">${register ? 'Já tenho conta — entrar' : 'Ainda não tenho conta — registar'}</button>`;
}

export function profilePage(state) {
  if (state.profile) {
    return profileView({
      state,
      escapeHtml,
      header: (options) => header(options),
      navigation: () => navigation('profile'),
      extraSection: deviceSection(state)
    });
  }
  const body = `<section class="profile-hero"><span class="round-icon">${icon('user', { size: 26 })}</span><h1>O seu espaço.</h1><p>Não precisa de conta para usar a aplicação. As suas escolhas ficam guardadas neste dispositivo.</p></section>
    ${deviceSection(state)}
    <section class="menu-group">
      <h2 class="menu-heading">Conta (opcional)</h2>
      ${accountForm(state)}
    </section>`;
  return page('profile', { title: 'Perfil', back: 'home', body });
}

export { bindProfile };
