// "Igrejas": the directory of places, and each place's page.
import { countriesIn, filterChurches, placeKindLabel, regionsIn, serviceLabel } from '../directory.js';
import { escapeHtml, externalLinkAttrs, safeUrl, whatsAppUrl } from '../html.js';
import { icon } from '../icons.js';
import { prefs } from '../prefs.js';
import { emptyState, errorState, externalHint, loadingState, page, statusBadge } from './shared.js';

// The announcement files say where each record came from, in English.
const SOURCE_LABELS = { 'user-provided WhatsApp announcement': 'Anúncio operacional enviado pela equipa por WhatsApp.' };
const sourceText = (church) => SOURCE_LABELS[church.source] || church.source || church.note || 'Registo operacional a confirmar pela equipa local.';

const where = (church) => [church.region, church.country].filter(Boolean).join(', ');

function churchCard(church) {
  const mine = prefs.myChurch === church.id;
  return `<li><a class="church-card" href="/igrejas/${escapeHtml(church.id)}">
    <span class="church-card-top"><span class="kind">${escapeHtml(placeKindLabel(church))}</span>${mine ? `<span class="mine-tag">${icon('heart', { size: 12 })}A minha ISTN</span>` : ''}${statusBadge(church.verificationStatus)}</span>
    <h2>ISTN — ${escapeHtml(church.name)}</h2>
    <span class="card-line">${icon(church.modality === 'online' ? 'globe' : 'pin', { size: 16 })}${escapeHtml(where(church) || 'Localização a confirmar')}</span>
    ${church.services.length
      ? church.services.map((service) => `<span class="card-line">${icon('clock', { size: 16 })}${escapeHtml(serviceLabel(service))}</span>`).join('')
      : `<span class="card-line muted">${icon('clock', { size: 16 })}Horário a confirmar com o responsável</span>`}
    ${church.leaderName ? `<span class="card-line">${icon('user', { size: 16 })}${escapeHtml(church.leaderName)}</span>` : ''}
    <span class="card-arrow">${icon('chevron', { size: 18 })}</span>
  </a></li>`;
}

export function churchResults(state) {
  const all = state.directory.churches;
  const matching = filterChurches(all, state.churchFilters);
  const filtered = matching.length !== all.length;
  const summary = `<div class="results-summary">
    <p><strong>${matching.length}</strong> ${filtered ? `de ${all.length} registos` : matching.length === 1 ? 'registo' : 'registos'}</p>
    ${filtered ? '<button class="text-button" type="button" data-action="clear-church-filters">Limpar filtros</button>' : ''}
  </div>`;
  if (!matching.length) {
    return summary + emptyState({
      title: 'Nenhum registo encontrado',
      text: 'Procure pela cidade, bairro ou região, ou escolha outro país.',
      action: '<button class="button button-outline" type="button" data-action="clear-church-filters">Limpar filtros</button>'
    });
  }
  return `${summary}<ul class="church-list">${matching.map(churchCard).join('')}</ul>`;
}

function filterFields(state) {
  const { country, region } = state.churchFilters;
  const regions = country ? regionsIn(state.directory.churches, country) : [];
  return `<div class="filter-bar">
    <label class="select-field"><span>País</span><select id="country-filter"><option value="">Todos</option>${countriesIn(state.directory.churches).map((name) => `<option ${country === name ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select></label>
    <label class="select-field"><span>Região</span><select id="region-filter" ${regions.length ? '' : 'disabled'}><option value="">${country ? 'Todas' : 'Escolha um país'}</option>${regions.map((name) => `<option ${region === name ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select></label>
  </div>`;
}

export function churchesPage(state) {
  let content;
  if (state.directoryError) content = errorState('Não foi possível carregar o diretório.', 'retry-directory');
  else if (!state.directory) content = loadingState('A carregar o diretório…');
  else {
    content = `${filterFields(state)}
      ${state.directory.source === 'arquivo' ? `<p class="notice">${icon('info', { size: 18 })}<span>A mostrar a lista publicada nos anúncios. As alterações mais recentes da equipa podem ainda não aparecer.</span></p>` : ''}
      <div id="church-results">${churchResults(state)}</div>`;
  }
  const body = `<section class="page-intro"><span class="eyebrow">ISTN global</span><h1>Encontre a sua igreja.</h1><p>Igrejas, casas de oração e comunidades online. Confirme o horário com o responsável antes de se deslocar.</p></section>
    <label class="search-box"><span class="sr-only">Pesquisar no diretório</span>${icon('search', { size: 22 })}<input id="church-search" type="search" value="${escapeHtml(state.churchFilters.query)}" placeholder="Cidade, bairro, região ou responsável" autocomplete="off" enterkeyhint="search" /></label>
    ${content}
    <aside class="note warning">${icon('alert', { size: 18 })}<p><strong>Dados em verificação.</strong> Os registos vêm de anúncios operacionais e só mostram «Verificado» depois de a equipa os confirmar com a igreja.</p></aside>`;
  return page('churches', { title: 'Igrejas', back: 'home', body });
}

function infoRow(iconName, label, value) {
  return `<div class="info-row">${icon(iconName, { size: 20 })}<p><small>${label}</small>${value}</p></div>`;
}

export function churchPage(state, id) {
  const back = { title: 'Igreja', back: 'churches' };
  if (state.directoryError) return page('church', { ...back, body: errorState('Não foi possível carregar o diretório.', 'retry-directory') });
  if (!state.directory) return page('church', { ...back, body: loadingState('A carregar…') });
  const church = state.directory.churches.find((item) => item.id === id);
  if (!church) {
    return page('church', { ...back, body: emptyState({ title: 'Registo não encontrado', text: 'Este registo pode ter sido removido ou o endereço está incompleto.', action: '<a class="button button-dark" href="/igrejas">Ver todas as igrejas</a>' }) });
  }

  const phone = church.leaderPhone;
  const whatsapp = whatsAppUrl(phone);
  const group = safeUrl(church.whatsappGroupUrl);
  const photo = safeUrl(church.photoUrl);
  const mine = prefs.myChurch === church.id;
  const mapUrl = church.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([church.address, church.locality, church.country].filter(Boolean).join(', '))}` : '';

  const body = `
    ${photo ? `<img class="church-photo" src="${escapeHtml(photo)}" alt="Fotografia de ISTN — ${escapeHtml(church.name)}" />` : ''}
    <section class="church-head">
      <span class="round-icon">${icon(church.modality === 'online' ? 'globe' : 'church', { size: 24 })}</span>
      <div><span class="kind">${escapeHtml(placeKindLabel(church))}</span><h1>ISTN — ${escapeHtml(church.name)}</h1><p>${escapeHtml(where(church))}</p></div>
    </section>
    <div class="church-badges">${statusBadge(church.verificationStatus)}</div>

    <section class="info-list" aria-label="Informações">
      ${infoRow('clock', church.modality === 'online' ? 'Reuniões' : 'Cultos', church.services.length
        ? church.services.map((service) => `<strong>${escapeHtml(serviceLabel(service))}</strong>`).join('') + '<span class="muted">Hora local do lugar</span>'
        : '<strong>Horário a confirmar</strong>')}
      ${church.address ? infoRow('pin', 'Morada', `<strong>${escapeHtml(church.address)}</strong><a class="text-button" ${externalLinkAttrs(mapUrl)}>${icon('navigation', { size: 16 })}Como chegar${externalHint}</a>`) : ''}
      ${infoRow('user', 'Responsável', `<strong>${escapeHtml(church.leaderName || 'A confirmar')}</strong>`)}
      ${infoRow('phone', 'Contacto', phone ? `<a class="strong-link" href="${escapeHtml(safeUrl(`tel:${phone.replace(/[^\d+]/g, '')}`, { schemes: ['tel:'] }))}">${escapeHtml(phone)}</a>` : '<strong>A confirmar</strong>')}
      ${church.servants.length ? infoRow('users', 'Servos', `<ul class="servant-list">${church.servants.map((servant) => `<li><strong>${escapeHtml(servant.name)}</strong><span>${escapeHtml(servant.roleLabel)}</span></li>`).join('')}</ul>`) : ''}
    </section>

    <div class="action-stack">
      ${whatsapp ? `<a class="button button-whatsapp full-width" ${externalLinkAttrs(whatsapp)}>${icon('message', { size: 18 })}Falar com o responsável no WhatsApp${externalHint}</a>` : ''}
      ${group ? `<a class="button button-outline full-width" ${externalLinkAttrs(group)}>${icon('users', { size: 18 })}Entrar no grupo da igreja${externalHint}</a>` : ''}
      <button class="button ${mine ? 'button-dark' : 'button-outline'} full-width" type="button" data-action="my-church" data-id="${escapeHtml(church.id)}" data-focus-key="my-church" aria-pressed="${mine}">${icon(mine ? 'check' : 'heart', { size: 18 })}${mine ? 'É a minha ISTN' : 'Esta é a minha ISTN'}</button>
    </div>

    <aside class="note warning">${icon('alert', { size: 18 })}<p><strong>Confirme antes de se deslocar.</strong> ${escapeHtml(sourceText(church))}</p></aside>`;
  return page('church', { ...back, mainClass: 'page-content church-page', body });
}
