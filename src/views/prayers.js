import { ministryText } from '../i18n.js';
import { t, th } from '../i18n.js';
// "Orações": the prayers the Prophet recorded, by theme.
//
// The page is built around what a pastor does with them, which is not to sit
// and listen: he arrives with a word — "coma", "finanças" — finds the prayer
// and sends it to somebody. So the page opens on a search box rather than on a
// list, and every prayer carries the three things he needs: ouvir, to be sure
// it is the right one; partilhar, which puts the file itself into WhatsApp;
// and transferir, which leaves it on the phone.
//
// Reading needs no account, as everywhere else here: someone in distress at
// two in the morning should not meet a sign-in form.
import { escapeHtml, safeUrl } from '../html.js';
import { icon } from '../icons.js';
import { prefs } from '../prefs.js';
import { canManagePrayers, filterPrayers, formatDuration, prayersByTheme } from '../prayers.js';
import { emptyState, errorState, loadingState, page, sectionHeading } from './shared.js';
import { actionMenu } from './posts.js';

const busy = (state, id) => Boolean(state.prayerBusy?.[id]);

// Uma linha só, e não três botões de largura inteira: são estas as três coisas
// que se fazem a uma oração, e o cartão existe para se ver muitas de uma vez.
// «Partilhar» leva palavra e cor, por ser o que se vem cá fazer; transferir é
// um ícone, com o nome dito a quem o não vê.
function prayerActions(state, prayer, { full = false } = {}) {
  const id = escapeHtml(prayer.id);
  const sounding = state.prayerPlaying === prayer.id;
  const working = busy(state, prayer.id);
  return `<div class="prayer-actions">
    <button class="prayer-action" type="button" data-action="play-prayer" data-id="${id}" data-focus-key="play-prayer:${id}" aria-pressed="${sounding}">
      ${icon(sounding ? 'pause' : 'play', { size: 17 })}<span>${sounding ? t("A tocar") : t("Ouvir")}</span>
    </button>
    <button class="prayer-action is-primary" type="button" data-action="share-prayer" data-id="${id}" data-focus-key="share-prayer:${id}" ${working ? 'disabled' : ''}>
      ${icon('share', { size: 17 })}<span>${working ? t("A preparar…") : t("Partilhar")}</span>
    </button>
    <button class="prayer-action is-icon" type="button" data-action="download-prayer" data-id="${id}" data-focus-key="download-prayer:${id}" ${working ? 'disabled' : ''}
      aria-label="${th("Transferir o áudio")}" title="${th("Transferir o áudio")}">${icon('download', { size: 17 })}</button>
    ${full && prefs.isSavedPrayer(prayer.id)
      ? `<button class="prayer-action is-icon" type="button" data-action="drop-prayer" data-id="${id}" aria-label="${th("Remover deste telemóvel")}" title="${th("Remover deste telemóvel")}">${icon('eyeOff', { size: 17 })}</button>` : ''}
  </div>`;
}

function manageMenu(state, prayer) {
  if (!canManagePrayers(state.profile, state.admin)) return '';
  return actionMenu(prayer.id, t("Opções desta oração"), [
    `<button type="button" data-action="edit-prayer" data-id="${escapeHtml(prayer.id)}">${th("{1}Editar", { 1: icon('edit', { size: 16 }) })}</button>`,
    `<button type="button" data-action="hide-prayer" data-id="${escapeHtml(prayer.id)}">${icon('eyeOff', { size: 16 })}Esconder</button>`,
    `<button type="button" class="danger" data-action="delete-prayer" data-id="${escapeHtml(prayer.id)}">${icon('close', { size: 16 })}Eliminar</button>`
  ]);
}

function prayerCard(state, prayer) {
  return `<article class="prayer-card ${state.prayerPlaying === prayer.id ? 'is-playing' : ''}">
    ${manageMenu(state, prayer)}
    <a class="prayer-open" href="/oracoes/${escapeHtml(prayer.id)}">
      <h3>${escapeHtml(ministryText(prayer.title))}</h3>
      <p class="prayer-meta">
        ${prayer.theme ? `<span class="prayer-theme">${escapeHtml(prayer.theme.name)}</span>` : ''}
        ${prayer.duration ? `<span>${icon('clock', { size: 14 })}${escapeHtml(formatDuration(prayer.duration))}</span>` : ''}
        ${prefs.isSavedPrayer(prayer.id) ? `<span class="prayer-kept">${th("{0}No telemóvel", { 0: icon('check', { size: 14 }) })}</span>` : ''}
      </p>
      ${prayer.description ? `<p class="prayer-note">${escapeHtml(ministryText(prayer.description))}</p>` : ''}
    </a>
    ${prayerActions(state, prayer)}
  </article>`;
}

function themeChips(state) {
  const themes = state.prayerThemes || [];
  if (!themes.length || !state.prayers) return '';
  const chosen = state.prayerFilters?.theme || '';
  // Um tema sem gravações mostra-se, porque diz que existe, mas não se toca:
  // um botão que leva a uma página vazia não é um botão.
  const chip = (id, label, count) => `<button class="chip" type="button" data-action="prayer-theme" data-id="${escapeHtml(id)}" aria-pressed="${chosen === id}" ${count || !id ? '' : 'disabled'}>
    <strong>${escapeHtml(label)}</strong><small>${count}</small></button>`;
  return `<div class="chip-row" role="group" aria-label="${th("Filtrar por tema")}">
    ${chip('', t("Todos"), state.prayers.length)}
    ${themes.map((theme) => chip(theme.id, theme.name, state.prayers.filter((prayer) => prayer.themeId === theme.id).length)).join('')}
  </div>`;
}

function prayerResults(state) {
  const filters = state.prayerFilters || { query: '', theme: '' };
  const found = filterPrayers(state.prayers, filters);
  if (!found.length) {
    return emptyState({
      title: t('Nenhuma oração encontrada'),
      text: filters.query ? t("Nada corresponde a «{0}». Tente outra palavra, ou veja todos os temas.", { 0: filters.query }) : t("Ainda não há orações neste tema."),
      action: `<button class="button button-dark" type="button" data-action="clear-prayers">${th("Ver todas as orações")}</button>`
    });
  }
  // Nothing asked for: every theme in the order the team gave it, which is how
  // someone who does not yet know what is here finds out.
  if (!filters.query && !filters.theme) {
    return prayersByTheme(found, state.prayerThemes || []).map((group) => `<section class="content-section">
      ${sectionHeading(t("Tema"), group.theme.name)}
      <div class="prayer-list">${group.prayers.map((prayer) => prayerCard(state, prayer)).join('')}</div>
    </section>`).join('');
  }
  return `<p class="prayer-count" role="status">${found.length === 1 ? t("1 oração") : t("{0} orações", { 0: found.length })}</p>
    <div class="prayer-list">${found.map((prayer) => prayerCard(state, prayer)).join('')}</div>`;
}

export function prayersPage(state) {
  let content;
  if (state.prayersError) content = errorState(t("Não foi possível carregar as orações."), 'retry-prayers');
  else if (!state.prayers) content = loadingState(t("A carregar as orações…"));
  else if (!state.prayers.length) {
    content = emptyState({
      title: t('Ainda não há orações'),
      text: canManagePrayers(state.profile)
        ? t("Acrescente a primeira no painel de administração.")
        : t("Assim que a equipa publicar as orações do Profeta, aparecem aqui.")
    });
  } else content = `${themeChips(state)}${prayerResults(state)}`;
  const addable = canManagePrayers(state.profile, state.admin);

  const body = `<section class="page-intro">
      <span class="eyebrow">ISTN-SJ</span>
      <h1>${th("Orações do Profeta Elias.")}</h1>
      <p>${th("Gravadas para o que cada pessoa está a viver. Encontre pelo tema, oiça, e envie a quem precisa.")}</p>
    </section>
    <label class="search-box"><span class="sr-only">${th("Procurar uma oração")}</span>${icon('search', { size: 22 })}<input id="prayer-search" type="search" value="${escapeHtml(state.prayerFilters?.query || '')}" placeholder="${th("O que a pessoa está a viver: doença, coma, finanças…")}" autocomplete="off" enterkeyhint="search" data-focus-key="prayer-search" /></label>
    ${content}`;
  return page('prayers', {
    title: 'Orações',
    back: 'home',
    action: addable ? `<button class="icon-button" type="button" data-action="new-prayer" aria-label="${th("Acrescentar uma oração")}">${icon('plus', { size: 22 })}</button>` : '',
    body
  }) + prayerSheet(state);
}

export function prayerPage(state, id) {
  const back = { title: 'Oração', back: 'prayers' };
  if (state.prayersError) return page('prayer', { ...back, body: errorState(t("Não foi possível carregar as orações."), 'retry-prayers') });
  if (!state.prayers) return page('prayer', { ...back, body: loadingState(t("A carregar…")) });
  const prayer = state.prayers.find((item) => item.id === id);
  if (!prayer) {
    return page('prayer', { ...back, body: emptyState({ title: t('Oração não encontrada'), text: t("Pode ter sido retirada pela equipa."), action: `<a class="button button-dark" href="/oracoes">${th("Ver as orações")}</a>` }) });
  }
  const others = filterPrayers(state.prayers, { theme: prayer.themeId }).filter((item) => item.id !== prayer.id).slice(0, 4);
  const body = `<article class="prayer-full">
      ${prayer.theme ? `<span class="prayer-theme">${escapeHtml(prayer.theme.name)}</span>` : ''}
      <h1>${escapeHtml(ministryText(prayer.title))}</h1>
      <p class="prayer-meta">
        <span>${th("Profeta Elias · ISTN-SJ")}</span>
        ${prayer.duration ? `<span>${icon('clock', { size: 14 })}${escapeHtml(formatDuration(prayer.duration))}</span>` : ''}
        ${prefs.isSavedPrayer(prayer.id) ? `<span class="prayer-kept">${th("{0}No telemóvel", { 0: icon('check', { size: 14 }) })}</span>` : ''}
      </p>
      ${prayer.description ? `<p class="prayer-note">${escapeHtml(ministryText(prayer.description))}</p>` : ''}
      ${prayerActions(state, prayer, { full: true })}
      <p class="hint">${th("«Partilhar» envia o próprio áudio, para a pessoa o ouvir no WhatsApp sem precisar desta aplicação. Onde o telemóvel não deixar enviar o ficheiro, vai o link desta página.")}</p>
    </article>
    ${others.length ? `<section class="content-section">
      ${sectionHeading(t("No mesmo tema"), prayer.theme?.name || t("Outras orações"), '<a class="link-button" href="/oracoes">Ver todas</a>')}
      <div class="prayer-list">${others.map((item) => prayerCard(state, item)).join('')}</div>
    </section>` : ''}`;
  return page('prayer', { ...back, body }) + prayerSheet(state);
}

// Acrescentar ou corrigir uma oração sem abrir o painel: quem grava está com o
// telemóvel na mão, e o ficheiro está nele.
export function prayerSheet(state) {
  const draft = state.prayerDraft;
  if (!draft) return '';
  const themes = state.prayerThemes || [];
  const working = state.prayerSaving || state.prayerUploading;
  return `<div class="sheet-backdrop" data-prayer-close>
    <form class="sheet prayer-composer" id="prayer-sheet" role="dialog" aria-modal="true" aria-labelledby="prayer-sheet-title">
      <span class="sheet-grip" aria-hidden="true"></span>
      <div class="composer-heading">
        <div><span class="eyebrow">${th("ORAÇÃO DO PROFETA ELIAS")}</span><h2 id="prayer-sheet-title">${draft.id ? t("Editar oração") : t("Nova oração")}</h2></div>
        <button class="icon-button" type="button" data-prayer-close aria-label="${th("Fechar")}" ${working ? 'disabled' : ''}>${icon('close')}</button>
      </div>
      <label class="sheet-field">${th("Título")}<input type="text" name="title" value="${escapeHtml(draft.title || '')}" required maxlength="120" placeholder="${th("Oração pelos enfermos")}" data-focus-key="prayer-title" /></label>
      <label class="sheet-field">${th("Tema")}<select name="theme_id">
        <option value="">${th("— sem tema —")}</option>
        ${themes.map((theme) => `<option value="${escapeHtml(theme.id)}" ${draft.themeId === theme.id ? 'selected' : ''}>${escapeHtml(theme.name)}</option>`).join('')}
      </select></label>
      <label class="sheet-field">${th("Em que caso se usa")} <small>${th("(é por aqui que se procura)")}</small>
        <input type="text" name="description" value="${escapeHtml(draft.description || '')}" maxlength="180" placeholder="${th("Para quem está internado ou em coma")}" /></label>
      <label class="prayer-file-pick">
        ${icon('play', { size: 26 })}
        <strong>${state.prayerUploading ? t("A enviar a gravação…") : draft.fileName ? escapeHtml(draft.fileName) : draft.audioUrl ? t("Substituir a gravação") : t("Escolher a gravação")}</strong>
        <span>${draft.duration ? escapeHtml(formatDuration(draft.duration)) : t("MP3, M4A, AAC, OGG ou WAV · até 25 MB")}</span>
        <input type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/ogg,audio/wav" data-prayer-file ${working ? 'disabled' : ''} />
      </label>
      <div class="sheet-actions">
        <button class="button button-gold full-width" type="submit" ${working ? 'disabled' : ''}>${state.prayerSaving ? t("A guardar…") : t("Guardar")}</button>
        <button class="text-button" type="button" data-prayer-close ${working ? 'disabled' : ''}>${th("Cancelar")}</button>
      </div>
    </form>
  </div>`;
}

// The address a shared prayer points at, and what the page tells whoever opens it.
export const prayerUrl = (prayer) => `${window.location.origin}/oracoes/${encodeURIComponent(prayer.id)}`;

export const prayerAudioUrl = (prayer) => safeUrl(prayer.audioUrl);
