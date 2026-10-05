import { t, th } from '../i18n.js';
// "Igrejas": the directory of places, and each place's page.
//
// The page opens with the Profeta Elias and his word about the nations, then
// the world — where the ISTN-SJ is — and the world seat, before the list. As
// soon as someone searches or filters, the map and the seat step aside and the
// results sit right under the search box, where the keyboard leaves them.
import {
  SEAT_LABELS, SHORT_DAYS, churchTimeZone, churchTitle, countriesIn, countryFlag, filterChurches, findChurch, groupDirectory,
  nextService, placeKindLabel, regionsIn, serviceDaysIn, serviceLabel, weekdayIn
} from '../directory.js';
import { escapeHtml, externalLinkAttrs, safeUrl, whatsAppUrl } from '../html.js';
import { icon } from '../icons.js';
import { WEEKDAY_LABELS } from '../meetings.js';
import { prefs } from '../prefs.js';
import { SEAL_PATH } from '../roles.js';
import { emptyState, errorState, externalHint, loadingState, page, statusBadge } from './shared.js';
import { worldMap } from './world-map.js';

// Where a record came from, said to the reader in their language.
const SOURCE_LABELS = {
  'user-provided WhatsApp announcement': 'Anúncio operacional enviado pela equipa por WhatsApp.',
  'Lista geral de cultos da equipa (setembro de 2026)': 'Dados da lista geral de cultos da equipa ISTN-SJ (setembro de 2026).'
};
const sourceText = (church) => SOURCE_LABELS[church.source] || t("Registo operacional a confirmar pela equipa local.");

const where = (church) => [church.region, t(church.country)].filter(Boolean).join(', ');
const telHref = (phone) => escapeHtml(safeUrl(`tel:${String(phone).replace(/[^\d+]/g, '')}`, { schemes: ['tel:'] }));
const mapsUrl = (church) => (church.address
  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([church.address, church.locality, church.country].filter(Boolean).join(', '))}`
  : '');

export const PROPHECY = 'Esta igreja chegará em todas as nações. O Senhor me disse aonde quer que estiver um Homem, um animal ou uma árvore aí haverá o domínio do Senhor através desta Igreja.';

// ------------------------------------------------------------------ selos --

// The seat's seal: the same scalloped disc as the verified servant's, gold with
// the globe for the world seat, deep blue with a star for a country's.
export function seatSeal(seat, { size = 18 } = {}) {
  if (!SEAT_LABELS[seat]) return '';
  const glyph = seat === 'mundial'
    ? '<circle cx="12" cy="12" r="5.2" fill="none" stroke-width="1.5" /><path d="M6.8 12h10.4M12 6.8c1.6 1.5 2.3 3.2 2.3 5.2s-.7 3.7-2.3 5.2c-1.6-1.5-2.3-3.2-2.3-5.2s.7-3.7 2.3-5.2z" fill="none" stroke-width="1.3" />'
    : '<path d="M12 6.4l1.65 3.4 3.75.5-2.73 2.6.68 3.7L12 14.8l-3.35 1.8.68-3.7L6.6 10.3l3.75-.5z" stroke="none" />';
  return `<svg class="seat-seal seat-${seat}" viewBox="0 0 24 24" width="${size}" height="${size}" role="img" aria-label="${th(SEAT_LABELS[seat])}"><title>${th(SEAT_LABELS[seat])}</title>`
    + `<path class="seal-disc" d="${SEAL_PATH}" />${glyph}</svg>`;
}

const seatPill = (seat) => (SEAT_LABELS[seat]
  ? `<span class="seat-pill seat-${seat}">${seatSeal(seat, { size: 16 })}<span>${th(SEAT_LABELS[seat])}</span></span>`
  : '');

// -------------------------------------------------------------- horários --

// The week at a glance: one chip per service, Monday first, today's marked.
export function serviceChips(church, now = new Date()) {
  if (!church.services.length) return '';
  const today = weekdayIn(churchTimeZone(church), now);
  return `<span class="service-chips">${church.services.map((service) => {
    const isToday = service.weekday === today;
    return `<span class="service-chip ${isToday ? 'is-today' : ''}" title="${escapeHtml(serviceLabel(service))}">
      <b>${isToday ? t("Hoje") : t(SHORT_DAYS[service.weekday])}</b>${service.time ? `<span>${escapeHtml(service.time)}</span>` : `<i>${th("hora a confirmar")}</i>`}${service.label ? `<i>${escapeHtml(service.label)}</i>` : ''}
    </span>`;
  }).join('')}</span>`;
}

// ------------------------------------------------------------------ lista --

function churchCard(church, now) {
  const mine = prefs.myChurch === church.id;
  const online = church.modality === 'online';
  return `<li><a class="church-card ${church.seat ? `is-seat seat-${church.seat}` : ''}" href="/igrejas/${escapeHtml(church.id)}">
    <span class="church-card-top">${church.seat ? seatPill(church.seat) : `<span class="kind">${escapeHtml(t(placeKindLabel(church)))}</span>`}${mine ? `<span class="mine-tag">${th("{0}A minha ISTN", { 0: icon('heart', { size: 12 }) })}</span>` : ''}${church.verificationStatus === 'verified' ? statusBadge('verified') : ''}</span>
    <h3>${escapeHtml(churchTitle(church))}</h3>
    ${online
      ? `<span class="card-line">${th("{0}Culto online — fale com o responsável para participar", { 0: icon('globe', { size: 16 }) })}</span>`
      : `<span class="card-line">${icon('pin', { size: 16 })}<span>${escapeHtml(church.region || t(church.country))}${church.address ? `<small class="card-address">${escapeHtml(church.address)}</small>` : ''}</span></span>`}
    ${church.services.length ? serviceChips(church, now) : `<span class="card-line muted">${icon('clock', { size: 16 })}${online ? t("Dia e hora a confirmar com o responsável") : t("Horário a confirmar com o responsável")}</span>`}
    ${church.leaderName ? `<span class="card-line">${icon('user', { size: 16 })}${escapeHtml([church.leaderName, ...church.otherLeaders.map((leader) => leader.name)].filter(Boolean).join(' · '))}</span>` : ''}
    <span class="card-arrow">${icon('chevron', { size: 18 })}</span>
  </a></li>`;
}

// The world seat, in front of everything: where the ISTN-SJ began, and where
// anyone can go.
function worldSeatCard(church, now) {
  const map = mapsUrl(church);
  return `<section class="world-seat" aria-labelledby="world-seat-title">
    <span class="world-seat-rays" aria-hidden="true"></span>
    ${seatPill('mundial')}
    <h2 id="world-seat-title">${escapeHtml(churchTitle(church))}</h2>
    <p class="world-seat-where">${escapeHtml(where(church))} <span aria-hidden="true">${countryFlag(church.countryCode)}</span></p>
    ${church.address ? `<p class="world-seat-address">${icon('pin', { size: 16 })}<span>${escapeHtml(church.address)}</span></p>` : ''}
    ${serviceChips(church, now)}
    <div class="world-seat-actions">
      <a class="button button-dark" href="/igrejas/${escapeHtml(church.id)}">${th("Ver a sede mundial{7}", { 7: icon('arrowRight', { size: 18 }) })}</a>
      ${map ? `<a class="text-button" ${externalLinkAttrs(map)}>${th("{1}Como chegar{2}", { 1: icon('navigation', { size: 16 }), 2: externalHint() })}</a>` : ''}
    </div>
  </section>`;
}

const hasFilters = ({ query, country, region, day }) => Boolean(query.trim() || country || region || day !== '');

export function churchResults(state, now = new Date()) {
  const all = state.directory.churches;
  const filters = state.churchFilters;
  const matching = filterChurches(all, filters);
  const filtered = hasFilters(filters);
  const countries = new Set(matching.map((church) => church.country)).size;
  const worldSeat = all.find((church) => church.seat === 'mundial');

  const summary = `<div class="results-summary">
    <p>${filtered
      ? th("{0} de {1}", { 0: `<strong>${matching.length}</strong>`, 1: all.length })
      : th("{0} igrejas, casas de oração e igrejas online em {1} países", { 0: `<strong>${all.length}</strong>`, 1: countries })}</p>
    ${filtered ? `<button class="text-button" type="button" data-action="clear-church-filters">${th("Limpar filtros")}</button>` : ''}
  </div>`;
  if (!matching.length) {
    return summary + emptyState({
      title: t("Nenhuma igreja encontrada"),
      text: filters.day !== '' ? t("Nenhum lugar tem culto nesse dia com estes filtros. Experimente outro dia ou retire os filtros.") : t("Procure pela cidade, bairro ou região, ou escolha outro país."),
      action: `<button class="button button-outline" type="button" data-action="clear-church-filters">${th("Limpar filtros")}</button>`
    });
  }
  return `${filtered ? '' : worldMap(all)}
    ${!filtered && worldSeat ? worldSeatCard(worldSeat, now) : ''}
    ${summary}
    ${groupDirectory(matching).map((group) => `<section class="country-group ${group.online ? 'is-online' : ''}" aria-labelledby="grupo-${escapeHtml(group.key.replace(/\W+/g, '-'))}">
      <h2 class="country-heading" id="grupo-${escapeHtml(group.key.replace(/\W+/g, '-'))}">${group.flag ? `<span class="country-flag" aria-hidden="true">${group.flag}</span>` : icon('globe', { size: 20 })}${escapeHtml(t(group.title))}<small>${group.churches.length}</small></h2>
      ${group.online ? `<p class="group-hint">${th("Cultos online, sobretudo pelo WhatsApp, onde ainda não há um lugar presencial.")}</p>` : ''}
      <ul class="church-list">${group.churches.map((church) => churchCard(church, now)).join('')}</ul>
    </section>`).join('')}`;
}

function filterFields(state) {
  const { country, region, day } = state.churchFilters;
  const churches = state.directory.churches;
  const regions = country ? regionsIn(churches, country) : [];
  const today = new Date().getDay();
  return `<div class="filter-bar">
    <label class="select-field"><span>${th("País")}</span><select id="country-filter"><option value="">${th("Todos")}</option>${countriesIn(churches).map((name) => `<option value="${escapeHtml(name)}" ${country === name ? 'selected' : ''}>${escapeHtml(t(name))}</option>`).join('')}</select></label>
    <label class="select-field"><span>${th("Região")}</span><select id="region-filter" ${regions.length ? '' : 'disabled'}><option value="">${country ? t("Todas") : t("Escolha um país")}</option>${regions.map((name) => `<option ${region === name ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select></label>
  </div>
  <div class="chip-row day-chips" role="group" aria-label="${th("Dia de culto")}">
    <button class="chip" type="button" data-action="church-day" data-day="" aria-pressed="${day === ''}" data-focus-key="day:">${icon('calendar', { size: 16 })}<strong>${th("Todos os dias")}</strong></button>
    ${serviceDaysIn(churches).map((weekday) => `<button class="chip" type="button" data-action="church-day" data-day="${weekday}" aria-pressed="${String(day) === String(weekday)}" data-focus-key="day:${weekday}" aria-label="${t(WEEKDAY_LABELS[weekday])}${weekday === today ? t(" (hoje)") : ''}">
      <strong>${t(SHORT_DAYS[weekday])}</strong>${weekday === today ? `<small>${th("hoje")}</small>` : ''}
    </button>`).join('')}
  </div>`;
}

function prophecyHero() {
  return `<section class="prophecy" aria-label="${th("Palavra do Profeta Elias")}">
    <div class="prophecy-art">
      <span class="prophecy-sun" aria-hidden="true"></span>
      <img src="/design/assets/photos/elias-ensinos.jpeg" width="1706" height="2560" alt="${th("Profeta Elias a pregar")}" loading="lazy" />
    </div>
    <figure class="prophecy-copy">
      <blockquote><p>${escapeHtml(t(PROPHECY))}</p></blockquote>
      <figcaption>${th("Profeta Elias")}</figcaption>
    </figure>
  </section>`;
}

export function churchesPage(state) {
  let content;
  if (state.directoryError) content = errorState(t("Não foi possível carregar o diretório."), 'retry-directory');
  else if (!state.directory) content = loadingState(t("A carregar as igrejas…"));
  else {
    content = `${filterFields(state)}
      ${state.directory.source === 'arquivo' ? `<p class="notice">${icon('info', { size: 18 })}<span>${th("A mostrar a lista geral de cultos da equipa. As alterações mais recentes do painel podem ainda não aparecer.")}</span></p>` : ''}
      <div id="church-results">${churchResults(state)}</div>`;
  }
  const body = `${prophecyHero()}
    <section class="page-intro"><span class="eyebrow">${th("{1}ISTN-SJ Mundial", { 1: icon('globe', { size: 14 }) })}</span><h1>${th("Encontre a sua igreja local")}</h1><p>${th("Igrejas, casas de oração e igrejas online. Confirme o horário e endereço com o responsável antes de se deslocar.")}</p></section>
    <label class="search-box"><span class="sr-only">${th("Pesquisar igrejas")}</span>${icon('search', { size: 22 })}<input id="church-search" type="search" value="${escapeHtml(state.churchFilters.query)}" placeholder="${th("Cidade, bairro, país ou responsável")}" autocomplete="off" enterkeyhint="search" /></label>
    ${content}
    <aside class="note warning">${icon('alert', { size: 18 })}<p><strong>${th("Dados em verificação.")}</strong> ${th("A lista vem da equipa ISTN-SJ; cada igreja mostra «Verificado» depois de a equipa a confirmar com o responsável.")}</p></aside>`;
  return page('churches', { title: t("Igrejas"), back: 'home', mainClass: 'page-content churches-page', body });
}

// ---------------------------------------------------------------- página --

function infoRow(iconName, label, value) {
  return `<div class="info-row">${icon(iconName, { size: 20 })}<div><small>${label}</small>${value}</div></div>`;
}

function servicesTable(church, now) {
  if (!church.services.length) {
    return `<strong>${church.modality === 'online' ? t("Dia e hora a confirmar") : t("Horário a confirmar")}</strong><span class="muted">${th("Pergunte ao responsável.")}</span>`;
  }
  const today = weekdayIn(churchTimeZone(church), now);
  return `<table class="service-table"><tbody>${church.services.map((service) => `<tr class="${service.weekday === today ? 'is-today' : ''}">
    <th scope="row">${t(WEEKDAY_LABELS[service.weekday])}${service.weekday === today ? `<b>${th("Hoje")}</b>` : ''}</th>
    <td>${service.time ? `<strong>${escapeHtml(service.time)}</strong>` : `<span class="muted">${th("Hora a confirmar")}</span>`}${service.label ? `<small>${escapeHtml(service.label)}</small>` : ''}</td>
  </tr>`).join('')}</tbody></table>
  <span class="muted">${th("Hora local do lugar.")}</span>`;
}

function nextServiceBanner(church, now) {
  const next = nextService(church, now);
  if (!next || church.modality === 'online') return '';
  const day = next.inDays === 0 ? t("Hoje") : next.inDays === 1 ? t("Amanhã") : t(WEEKDAY_LABELS[next.weekday]);
  return `<p class="next-service">${icon('clock', { size: 18 })}<span>${th("Próximo culto")}<strong>${escapeHtml(day)}${next.time ? t(" às {0}", { 0: escapeHtml(next.time) }) : t(", hora a confirmar")}</strong></span></p>`;
}

function leaderRows(church) {
  const leaders = [{ name: church.leaderName, phone: church.leaderPhone }, ...church.otherLeaders].filter((leader) => leader.name || leader.phone);
  if (!leaders.length) return infoRow('user', t("Responsável"), `<strong>${th("A confirmar")}</strong>`);
  return infoRow('user', leaders.length > 1 ? t("Responsáveis") : t("Responsável"), `<ul class="leader-list">${leaders.map((leader) => `<li>
    <strong>${escapeHtml(leader.name || t("Responsável"))}</strong>
    ${leader.phone ? `<span class="leader-contacts"><a class="strong-link" href="${telHref(leader.phone)}">${icon('phone', { size: 16 })}${escapeHtml(leader.phone)}</a>${whatsAppUrl(leader.phone) ? `<a class="text-button" ${externalLinkAttrs(whatsAppUrl(leader.phone))}>${icon('message', { size: 16 })}WhatsApp${externalHint()}</a>` : ''}</span>` : `<span class="muted">${th("Contacto a confirmar")}</span>`}
  </li>`).join('')}</ul>`);
}

export function churchPage(state, id, now = new Date()) {
  const back = { title: t("Igreja"), back: 'churches' };
  if (state.directoryError) return page('church', { ...back, body: errorState(t("Não foi possível carregar o diretório."), 'retry-directory') });
  if (!state.directory) return page('church', { ...back, body: loadingState(t("A carregar…")) });
  const church = findChurch(state.directory.churches, id);
  if (!church) {
    return page('church', { ...back, body: emptyState({ title: t("Igreja não encontrada"), text: t("Este endereço pode estar incompleto, ou a igreja deixou de estar na lista."), action: `<a class="button button-dark" href="/igrejas">${th("Ver todas as igrejas")}</a>` }) });
  }

  const whatsapp = whatsAppUrl(church.leaderPhone);
  const group = safeUrl(church.whatsappGroupUrl);
  const photo = safeUrl(church.photoUrl);
  const mine = prefs.myChurch === church.id;
  const map = mapsUrl(church);
  const online = church.modality === 'online';

  const body = `
    ${photo ? `<img class="church-photo" src="${escapeHtml(photo)}" alt="${th("Fotografia de {1}", { 1: escapeHtml(churchTitle(church)) })}" />` : ''}
    <section class="church-head ${church.seat ? `is-seat seat-${church.seat}` : ''}">
      <span class="round-icon">${church.seat ? seatSeal(church.seat, { size: 30 }) : icon(online ? 'globe' : 'church', { size: 24 })}</span>
      <div><span class="kind">${escapeHtml(t(placeKindLabel(church)))}</span><h1>${escapeHtml(churchTitle(church))}</h1><p>${escapeHtml(where(church))} <span aria-hidden="true">${countryFlag(church.countryCode)}</span></p></div>
    </section>
    <div class="church-badges">${seatPill(church.seat)}${statusBadge(church.verificationStatus)}</div>
    ${nextServiceBanner(church, now)}

    <section class="info-list" aria-label="${th("Informações")}">
      ${infoRow('clock', online ? t("Cultos online") : t("Dias de culto"), servicesTable(church, now))}
      ${online ? '' : infoRow('pin', t("Endereço"), church.address
        ? `<strong>${escapeHtml(church.address)}</strong>${map ? `<a class="text-button" ${externalLinkAttrs(map)}>${th("{1}Como chegar{2}", { 1: icon('navigation', { size: 16 }), 2: externalHint() })}</a>` : ''}`
        : `<strong>${th("Endereço a confirmar com o responsável")}</strong><span class="muted">${escapeHtml(where(church))}</span>`)}
      ${leaderRows(church)}
      ${church.servants.length ? infoRow('users', 'Servos', `<ul class="servant-list">${church.servants.map((servant) => `<li><strong>${escapeHtml(servant.name)}</strong><span>${escapeHtml(servant.roleLabel)}</span>${servant.phone ? `<a class="strong-link" href="${telHref(servant.phone)}">${escapeHtml(servant.phone)}</a>` : ''}</li>`).join('')}</ul>`) : ''}
    </section>

    <div class="action-stack">
      ${whatsapp ? `<a class="button button-whatsapp full-width" ${externalLinkAttrs(whatsapp)}>${th("{1}Falar com o responsável no WhatsApp{2}", { 1: icon('message', { size: 18 }), 2: externalHint() })}</a>` : ''}
      ${group ? `<a class="button button-outline full-width" ${externalLinkAttrs(group)}>${th("{1}Entrar no grupo da igreja{2}", { 1: icon('users', { size: 18 }), 2: externalHint() })}</a>` : ''}
      <button class="button button-outline full-width" type="button" data-action="share-church" data-id="${escapeHtml(church.id)}" data-focus-key="share-church">${th("{17}Partilhar esta igreja", { 17: icon('share', { size: 18 }) })}</button>
      <button class="button ${mine ? 'button-dark' : 'button-outline'} full-width" type="button" data-action="my-church" data-id="${escapeHtml(church.id)}" data-focus-key="my-church" aria-pressed="${mine}">${icon(mine ? 'check' : 'heart', { size: 18 })}${mine ? t("É a minha ISTN") : t("Esta é a minha ISTN")}</button>
    </div>

    <aside class="note warning">${icon('alert', { size: 18 })}<p><strong>${th("Confirme antes de se deslocar.")}</strong> ${escapeHtml(sourceText(church))}</p></aside>`;
  return page('church', { ...back, mainClass: 'page-content church-page', body });
}

// What "Partilhar esta igreja" sends: enough to find it without opening the link.
export function churchShareText(church) {
  return [
    `${churchTitle(church)}${church.seat ? ` (${SEAT_LABELS[church.seat]})` : ''}`,
    where(church),
    church.services.length ? church.services.map(serviceLabel).join(' · ') : '',
    church.address ? t("Endereço: {0}", { 0: church.address }) : '',
    church.leaderName ? t("Responsável: {0}{1}", { 0: church.leaderName, 1: church.leaderPhone ? ` (${church.leaderPhone})` : '' }) : ''
  ].filter(Boolean).join('\n');
}
