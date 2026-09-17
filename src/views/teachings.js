// "Ensinos": the library of recorded messages, and each channel's page.
import { APP_CONFIG } from '../data.js';
import { escapeHtml, externalLinkAttrs } from '../html.js';
import { icon } from '../icons.js';
import { CATEGORIES, booksIn, countByCategory, filterTeachings, formatDate, thumbnailUrl, watchUrl, yearOf, yearsIn } from '../library.js';
import { prefs } from '../prefs.js';
import { emptyState, errorState, externalHint, loadingState, page, sectionHeading } from './shared.js';
import { videoRow } from './videos.js';

export const PAGE_SIZE = 24;

function teachingCard(teaching) {
  const thumbnail = thumbnailUrl(teaching.url);
  const saved = prefs.isFavorite(teaching.id);
  const title = escapeHtml(teaching.title);
  return `<article class="teaching-card">
    <a class="teaching-link" ${externalLinkAttrs(watchUrl(teaching))}>
      <span class="teaching-thumb">${thumbnail ? `<img src="${thumbnail}" alt="" loading="lazy" decoding="async" />` : ''}<span class="play-badge">${icon('play', { size: 14 })}</span></span>
      <span class="teaching-body">
        <small class="teaching-meta">${escapeHtml(teaching.service || 'YouTube')} · ${escapeHtml(formatDate(teaching.publishedAt))}</small>
        <strong class="teaching-title">${title}</strong>
        ${teaching.biblicalReference ? `<span class="teaching-ref">${escapeHtml(teaching.biblicalReference)}</span>` : ''}
        ${teaching.startsAt ? `<span class="teaching-range">${icon('clock', { size: 13 })}Começa aos ${escapeHtml(teaching.startsAt.slice(0, 5))} do vídeo</span>` : ''}
        <span class="teaching-cta">Ver no YouTube${icon('external', { size: 13 })}${externalHint}</span>
      </span>
    </a>
    <div class="teaching-actions">
      <button class="icon-toggle ${saved ? 'is-on' : ''}" type="button" data-action="favorite" data-id="${escapeHtml(teaching.id)}" data-focus-key="favorite:${escapeHtml(teaching.id)}" aria-pressed="${saved}" aria-label="Guardar «${title}»">${icon('heart', { size: 20 })}</button>
      <button class="icon-toggle" type="button" data-action="share" data-id="${escapeHtml(teaching.id)}" data-focus-key="share:${escapeHtml(teaching.id)}" aria-label="Partilhar «${title}»">${icon('share', { size: 20 })}</button>
    </div>
  </article>`;
}

// The part that changes as someone types: redrawn on its own, so the search
// field, the filters and the scroll position stay exactly where they were.
export function teachingResults(state) {
  const filters = state.teachingFilters;
  const matching = filterTeachings(state.teachings, filters, prefs.favorites);
  const limit = filters.page * PAGE_SIZE;
  const active = [
    filters.savedOnly && 'Guardadas',
    filters.category !== 'Todas' && filters.category,
    filters.year && `Ano ${filters.year}`,
    filters.book,
    filters.query.trim() && `“${filters.query.trim()}”`
  ].filter(Boolean);

  let lastYear = null;
  const cards = matching.slice(0, limit).map((teaching) => {
    const year = yearOf(teaching);
    const heading = year !== lastYear ? `<h2 class="year-heading">${escapeHtml(year || 'Sem data')}</h2>` : '';
    lastYear = year;
    return heading + teachingCard(teaching);
  }).join('');

  const summary = `<div class="results-summary">
    <p><strong>${matching.length}</strong> ${matching.length === 1 ? 'pregação' : 'pregações'}${active.length ? ` · ${escapeHtml(active.join(' · '))}` : ''}</p>
    ${active.length ? '<button class="text-button" type="button" data-action="clear-teaching-filters">Limpar filtros</button>' : ''}
  </div>`;

  if (!matching.length) {
    return summary + emptyState({
      title: filters.savedOnly && !prefs.favorites.size ? 'Ainda não guardou pregações' : 'Nenhuma pregação encontrada',
      text: filters.savedOnly && !prefs.favorites.size ? 'Toque no coração de uma pregação para a encontrar aqui mais tarde.' : 'Experimente outra palavra, uma referência como «João 3» ou retire os filtros.',
      action: active.length ? '<button class="button button-outline" type="button" data-action="clear-teaching-filters">Limpar filtros</button>' : ''
    });
  }
  return `${summary}<div class="teaching-grid">${cards}</div>
    ${matching.length > limit ? `<button class="button button-outline full-width show-more" type="button" data-action="show-more" data-focus-key="show-more">Mostrar mais (${matching.length - limit} restantes)</button>` : ''}`;
}

export function teachingsPage(state) {
  const filters = state.teachingFilters;
  let content;
  if (state.teachingsError) content = errorState('Não foi possível carregar o acervo de pregações.', 'retry-teachings');
  else if (!state.teachings) content = loadingState('A carregar o acervo de pregações…');
  else {
    const counts = countByCategory(state.teachings);
    const savedCount = prefs.favorites.size;
    const chips = [
      ...CATEGORIES.map((category) => `<button class="chip" type="button" data-action="category" data-value="${escapeHtml(category)}" data-focus-key="category:${escapeHtml(category)}" aria-pressed="${!filters.savedOnly && filters.category === category}"><strong>${escapeHtml(category)}</strong><small>${counts[category]}</small></button>`),
      `<button class="chip chip-saved" type="button" data-action="saved-only" data-focus-key="saved-only" aria-pressed="${filters.savedOnly}">${icon('heart', { size: 16 })}<strong>Guardadas</strong><small>${savedCount}</small></button>`
    ].join('');
    content = `
      <div class="chip-row" role="group" aria-label="Tipo de encontro">${chips}</div>
      <div class="filter-bar">
        <label class="select-field"><span>Ano</span><select id="year-filter"><option value="">Todos</option>${yearsIn(state.teachings).map((year) => `<option ${filters.year === year ? 'selected' : ''}>${year}</option>`).join('')}</select></label>
        <label class="select-field"><span>Livro</span><select id="book-filter"><option value="">Todos</option>${booksIn(state.teachings).map((book) => `<option value="${escapeHtml(book.name)}" ${filters.book === book.name ? 'selected' : ''}>${escapeHtml(book.name)} (${book.count})</option>`).join('')}</select></label>
        <div class="segmented" role="group" aria-label="Ordenar">
          <button type="button" data-action="sort" data-value="recent" data-focus-key="sort:recent" aria-pressed="${filters.sort !== 'oldest'}">Mais recentes</button>
          <button type="button" data-action="sort" data-value="oldest" data-focus-key="sort:oldest" aria-pressed="${filters.sort === 'oldest'}">Mais antigas</button>
        </div>
      </div>
      <div id="teaching-results">${teachingResults(state)}</div>`;
  }

  const body = `<section class="page-intro"><span class="eyebrow">Acervo</span><h1>Todas as pregações num só lugar.</h1><p>${state.teachings ? `${state.teachings.length} pregações` : 'Pregações'} organizadas por tipo de encontro, ano e livro bíblico. Os vídeos abrem no YouTube.</p></section>
    <label class="search-box"><span class="sr-only">Pesquisar pregações</span>${icon('search', { size: 22 })}<input id="teaching-search" type="search" value="${escapeHtml(filters.query)}" placeholder="Tema, título ou referência bíblica" autocomplete="off" enterkeyhint="search" /></label>
    ${content}
    <aside class="note">${icon('info', { size: 18 })}<p>As referências bíblicas aparecem como foram registadas pela equipa. Algumas pregações ainda não têm referência.</p></aside>`;
  return page('teachings', { title: 'Ensinos', back: 'home', body });
}

export function sourceCard(source) {
  return `<a class="source-card" href="/fontes/${escapeHtml(source.id)}">
    <img src="${escapeHtml(source.image)}" alt="" loading="lazy" decoding="async" />
    <span class="source-body"><span class="platform">${escapeHtml(source.platform)}</span><strong>${escapeHtml(source.title)}</strong><small>${escapeHtml(source.description)}</small></span>
  </a>`;
}

export function sourcePage(state, id) {
  const source = APP_CONFIG.sources.find((item) => item.id === id);
  if (!source) {
    return page('source', { title: 'Canal', back: 'teachings', body: emptyState({ title: 'Canal não encontrado', text: 'O endereço pode estar incompleto.', action: '<a class="button button-dark" href="/ensinos">Ver os ensinos</a>' }) });
  }
  const body = `<img class="detail-image" src="${escapeHtml(source.image)}" alt="" />
    <section class="detail-copy">
      <span class="platform">${escapeHtml(source.platform)}</span>
      <h1>${escapeHtml(source.title)}</h1>
      <p>${escapeHtml(source.description)}</p>
      <a class="button button-dark full-width" ${externalLinkAttrs(source.url)}>${icon('external', { size: 18 })}Abrir no ${escapeHtml(source.platform)}${externalHint}</a>
    </section>
    <section class="content-section">
      ${sectionHeading('Mais recentes', 'Últimos vídeos deste canal')}
      ${videoRow(state, source)}
    </section>
    <section class="content-section">
      ${sectionHeading('Continue a explorar', 'Outros canais')}
      <div class="source-grid">${APP_CONFIG.sources.filter((item) => item.id !== source.id).map(sourceCard).join('')}</div>
    </section>`;
  return page('source', { title: 'Canal', back: 'teachings', mainClass: 'detail-page', body });
}
