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

const busy = (state, id) => Boolean(state.prayerBusy?.[id]);

function prayerActions(state, prayer, { full = false } = {}) {
  const id = escapeHtml(prayer.id);
  const sounding = state.prayerPlaying === prayer.id;
  const working = busy(state, prayer.id);
  return `<div class="prayer-actions">
    <button class="button button-outline" type="button" data-action="play-prayer" data-id="${id}" data-focus-key="play-prayer:${id}" aria-pressed="${sounding}">
      ${icon(sounding ? 'pause' : 'play', { size: 18 })}${sounding ? 'A tocar' : 'Ouvir'}
    </button>
    <button class="button button-gold" type="button" data-action="share-prayer" data-id="${id}" data-focus-key="share-prayer:${id}" ${working ? 'disabled' : ''}>
      ${icon('share', { size: 18 })}${working ? 'A preparar…' : 'Partilhar'}
    </button>
    <button class="button button-outline" type="button" data-action="download-prayer" data-id="${id}" data-focus-key="download-prayer:${id}" ${working ? 'disabled' : ''}>
      ${icon('download', { size: 18 })}Transferir
    </button>
    ${full && prefs.isSavedPrayer(prayer.id)
      ? `<button class="text-button" type="button" data-action="drop-prayer" data-id="${id}">Remover deste telemóvel</button>` : ''}
  </div>`;
}

function prayerCard(state, prayer) {
  const kept = prefs.isSavedPrayer(prayer.id);
  return `<article class="prayer-card ${state.prayerPlaying === prayer.id ? 'is-playing' : ''}">
    <a class="prayer-open" href="/oracoes/${escapeHtml(prayer.id)}">
      <h3>${escapeHtml(prayer.title)}</h3>
      <p class="prayer-meta">
        ${prayer.theme ? `<span class="prayer-theme">${escapeHtml(prayer.theme.name)}</span>` : ''}
        ${prayer.duration ? `<span>${icon('clock', { size: 14 })}${escapeHtml(formatDuration(prayer.duration))}</span>` : ''}
        ${kept ? `<span class="prayer-kept">${icon('check', { size: 14 })}No telemóvel</span>` : ''}
      </p>
      ${prayer.description ? `<p class="prayer-note">${escapeHtml(prayer.description)}</p>` : ''}
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
  return `<div class="chip-row" role="group" aria-label="Filtrar por tema">
    ${chip('', 'Todos', state.prayers.length)}
    ${themes.map((theme) => chip(theme.id, theme.name, state.prayers.filter((prayer) => prayer.themeId === theme.id).length)).join('')}
  </div>`;
}

function prayerResults(state) {
  const filters = state.prayerFilters || { query: '', theme: '' };
  const found = filterPrayers(state.prayers, filters);
  if (!found.length) {
    return emptyState({
      title: 'Nenhuma oração encontrada',
      text: filters.query ? `Nada corresponde a «${filters.query}». Tente outra palavra, ou veja todos os temas.` : 'Ainda não há orações neste tema.',
      action: '<button class="button button-dark" type="button" data-action="clear-prayers">Ver todas as orações</button>'
    });
  }
  // Nothing asked for: every theme in the order the team gave it, which is how
  // someone who does not yet know what is here finds out.
  if (!filters.query && !filters.theme) {
    return prayersByTheme(found, state.prayerThemes || []).map((group) => `<section class="content-section">
      ${sectionHeading('Tema', group.theme.name)}
      <div class="prayer-list">${group.prayers.map((prayer) => prayerCard(state, prayer)).join('')}</div>
    </section>`).join('');
  }
  return `<p class="prayer-count" role="status">${found.length === 1 ? '1 oração' : `${found.length} orações`}</p>
    <div class="prayer-list">${found.map((prayer) => prayerCard(state, prayer)).join('')}</div>`;
}

export function prayersPage(state) {
  let content;
  if (state.prayersError) content = errorState('Não foi possível carregar as orações.', 'retry-prayers');
  else if (!state.prayers) content = loadingState('A carregar as orações…');
  else if (!state.prayers.length) {
    content = emptyState({
      title: 'Ainda não há orações',
      text: canManagePrayers(state.profile)
        ? 'Acrescente a primeira no painel de administração.'
        : 'Assim que a equipa publicar as orações do Profeta, aparecem aqui.'
    });
  } else content = `${themeChips(state)}${prayerResults(state)}`;

  const body = `<section class="page-intro">
      <span class="eyebrow">ISTN-SJ</span>
      <h1>Orações do Profeta Elias.</h1>
      <p>Gravadas para o que cada pessoa está a viver. Encontre pelo tema, oiça, e envie a quem precisa.</p>
    </section>
    <label class="search-box"><span class="sr-only">Procurar uma oração</span>${icon('search', { size: 22 })}<input id="prayer-search" type="search" value="${escapeHtml(state.prayerFilters?.query || '')}" placeholder="O que a pessoa está a viver: doença, coma, finanças…" autocomplete="off" enterkeyhint="search" data-focus-key="prayer-search" /></label>
    ${content}`;
  return page('prayers', { title: 'Orações', back: 'home', body });
}

export function prayerPage(state, id) {
  const back = { title: 'Oração', back: 'prayers' };
  if (state.prayersError) return page('prayer', { ...back, body: errorState('Não foi possível carregar as orações.', 'retry-prayers') });
  if (!state.prayers) return page('prayer', { ...back, body: loadingState('A carregar…') });
  const prayer = state.prayers.find((item) => item.id === id);
  if (!prayer) {
    return page('prayer', { ...back, body: emptyState({ title: 'Oração não encontrada', text: 'Pode ter sido retirada pela equipa.', action: '<a class="button button-dark" href="/oracoes">Ver as orações</a>' }) });
  }
  const others = filterPrayers(state.prayers, { theme: prayer.themeId }).filter((item) => item.id !== prayer.id).slice(0, 4);
  const body = `<article class="prayer-full">
      ${prayer.theme ? `<span class="prayer-theme">${escapeHtml(prayer.theme.name)}</span>` : ''}
      <h1>${escapeHtml(prayer.title)}</h1>
      <p class="prayer-meta">
        <span>Profeta Elias · ISTN-SJ</span>
        ${prayer.duration ? `<span>${icon('clock', { size: 14 })}${escapeHtml(formatDuration(prayer.duration))}</span>` : ''}
        ${prefs.isSavedPrayer(prayer.id) ? `<span class="prayer-kept">${icon('check', { size: 14 })}No telemóvel</span>` : ''}
      </p>
      ${prayer.description ? `<p class="prayer-note">${escapeHtml(prayer.description)}</p>` : ''}
      ${prayerActions(state, prayer, { full: true })}
      <p class="hint">«Partilhar» envia o próprio áudio, para a pessoa o ouvir no WhatsApp sem precisar desta aplicação. Onde o telemóvel não deixar enviar o ficheiro, vai o link desta página.</p>
    </article>
    ${others.length ? `<section class="content-section">
      ${sectionHeading('No mesmo tema', prayer.theme?.name || 'Outras orações', '<a class="link-button" href="/oracoes">Ver todas</a>')}
      <div class="prayer-list">${others.map((item) => prayerCard(state, item)).join('')}</div>
    </section>` : ''}`;
  return page('prayer', { ...back, body });
}

// The address a shared prayer points at, and what the page tells whoever opens it.
export const prayerUrl = (prayer) => `${window.location.origin}/oracoes/${encodeURIComponent(prayer.id)}`;

export const prayerAudioUrl = (prayer) => safeUrl(prayer.audioUrl);
