import { ministryText } from '../i18n.js';
import { t, th } from '../i18n.js';
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
  const title = escapeHtml(ministryText(teaching.title));
  return `<article class="teaching-card">
    <a class="teaching-link" ${externalLinkAttrs(watchUrl(teaching))}>
      <span class="teaching-thumb">${thumbnail ? `<img src="${thumbnail}" alt="" loading="lazy" decoding="async" />` : ''}<span class="play-badge">${icon('play', { size: 14 })}</span></span>
      <span class="teaching-body">
        <small class="teaching-meta">${escapeHtml(teaching.service || 'YouTube')} · ${escapeHtml(formatDate(teaching.publishedAt))}</small>
        <strong class="teaching-title">${title}</strong>
        ${teaching.biblicalReference ? `<span class="teaching-ref">${escapeHtml(teaching.biblicalReference)}</span>` : ''}
        ${teaching.startsAt ? `<span class="teaching-range">${th("{0}Começa aos {1} do vídeo", { 0: icon('clock', { size: 13 }), 1: escapeHtml(teaching.startsAt.slice(0, 5)) })}</span>` : ''}
        <span class="teaching-cta">${th("Ver no YouTube{8}{9}", { 8: icon('external', { size: 13 }), 9: externalHint() })}</span>
      </span>
    </a>
    <div class="teaching-actions">
      <button class="icon-toggle ${saved ? 'is-on' : ''}" type="button" data-action="favorite" data-id="${escapeHtml(teaching.id)}" data-focus-key="favorite:${escapeHtml(teaching.id)}" aria-pressed="${saved}" aria-label="${th("Guardar «{14}»", { 14: title })}">${icon('heart', { size: 20 })}</button>
      <button class="icon-toggle" type="button" data-action="share" data-id="${escapeHtml(teaching.id)}" data-focus-key="share:${escapeHtml(teaching.id)}" aria-label="${th("Partilhar «{18}»", { 18: title })}">${icon('share', { size: 20 })}</button>
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
    filters.savedOnly && t("Guardadas"),
    filters.category !== 'Todas' && t(filters.category),
    filters.year && t("Ano {0}", { 0: filters.year }),
    filters.book && t(filters.book),
    filters.query.trim() && `“${filters.query.trim()}”`
  ].filter(Boolean);

  let lastYear = null;
  const cards = matching.slice(0, limit).map((teaching) => {
    const year = yearOf(teaching);
    const heading = year !== lastYear ? `<h2 class="year-heading">${escapeHtml(year || t("Sem data"))}</h2>` : '';
    lastYear = year;
    return heading + teachingCard(teaching);
  }).join('');

  const summary = `<div class="results-summary">
    <p><strong>${matching.length}</strong> ${matching.length === 1 ? t("pregação") : t("pregações")}${active.length ? ` · ${escapeHtml(active.join(' · '))}` : ''}</p>
    ${active.length ? `<button class="text-button" type="button" data-action="clear-teaching-filters">${th("Limpar filtros")}</button>` : ''}
  </div>`;

  if (!matching.length) {
    return summary + emptyState({
      title: filters.savedOnly && !prefs.favorites.size ? t("Ainda não guardou pregações") : t("Nenhuma pregação encontrada"),
      text: filters.savedOnly && !prefs.favorites.size ? t("Toque no coração de uma pregação para a encontrar aqui mais tarde.") : t("Experimente outra palavra, uma referência como «João 3» ou retire os filtros."),
      action: active.length ? `<button class="button button-outline" type="button" data-action="clear-teaching-filters">${th("Limpar filtros")}</button>` : ''
    });
  }
  return `${summary}<div class="teaching-grid">${cards}</div>
    ${matching.length > limit ? `<button class="button button-outline full-width show-more" type="button" data-action="show-more" data-focus-key="show-more">${th("Mostrar mais ({0} restantes)", { 0: matching.length - limit })}</button>` : ''}`;
}

export function teachingsPage(state) {
  const filters = state.teachingFilters;
  let content;
  if (state.teachingsError) content = errorState(t("Não foi possível carregar o acervo de pregações."), 'retry-teachings');
  else if (!state.teachings) content = loadingState(t("A carregar o acervo de pregações…"));
  else {
    const counts = countByCategory(state.teachings);
    const savedCount = prefs.favorites.size;
    const chips = [
      ...CATEGORIES.map((category) => `<button class="chip" type="button" data-action="category" data-value="${escapeHtml(category)}" data-focus-key="category:${escapeHtml(category)}" aria-pressed="${!filters.savedOnly && filters.category === category}"><strong>${escapeHtml(t(category))}</strong><small>${counts[category]}</small></button>`),
      `<button class="chip chip-saved" type="button" data-action="saved-only" data-focus-key="saved-only" aria-pressed="${filters.savedOnly}">${icon('heart', { size: 16 })}<strong>${th("Guardadas")}</strong><small>${savedCount}</small></button>`
    ].join('');
    content = `
      <div class="chip-row" role="group" aria-label="${th("Tipo de encontro")}">${chips}</div>
      <div class="filter-bar">
        <label class="select-field"><span>${th("Ano")}</span><select id="year-filter"><option value="">${th("Todos")}</option>${yearsIn(state.teachings).map((year) => `<option ${filters.year === year ? 'selected' : ''}>${year}</option>`).join('')}</select></label>
        <label class="select-field"><span>${th("Livro")}</span><select id="book-filter"><option value="">${th("Todos")}</option>${booksIn(state.teachings).map((book) => `<option value="${escapeHtml(book.name)}" ${filters.book === book.name ? 'selected' : ''}>${escapeHtml(t(book.name))} (${book.count})</option>`).join('')}</select></label>
        <div class="segmented" role="group" aria-label="${th("Ordenar")}">
          <button type="button" data-action="sort" data-value="recent" data-focus-key="sort:recent" aria-pressed="${filters.sort !== 'oldest'}">${th("Mais recentes")}</button>
          <button type="button" data-action="sort" data-value="oldest" data-focus-key="sort:oldest" aria-pressed="${filters.sort === 'oldest'}">${th("Mais antigas")}</button>
        </div>
      </div>
      <div id="teaching-results">${teachingResults(state)}</div>`;
  }

  const body = `<section class="page-intro teaching-intro"><img src="/design/assets/photos/elias-ensinos.jpeg" alt="${th("Profeta Elias com o microfone")}" width="1706" height="2560" /><div><span class="eyebrow">${th("Ensinos · Profeta Elias")}</span><h1>${th("Todas as pregações de Elias num só lugar.")}</h1><p>${th("{0} organizadas por tipo de encontro, ano e livro bíblico. Os vídeos abrem no YouTube.", { 0: state.teachings ? t("{0} pregações", { 0: state.teachings.length }) : t("Pregações") })}</p></div></section>
    <p class="coming-soon">${icon('sun', { size: 16 })}<span><strong>${th("Em breve:")}</strong> ${th("novos links e informações de pregações serão adicionados.")}</span></p>
    <label class="search-box"><span class="sr-only">${th("Pesquisar pregações")}</span>${icon('search', { size: 22 })}<input id="teaching-search" type="search" value="${escapeHtml(filters.query)}" placeholder="${th("Tema, título ou referência bíblica")}" autocomplete="off" enterkeyhint="search" /></label>
    ${content}
    <aside class="note">${icon('info', { size: 18 })}<p>${th("As referências bíblicas aparecem como foram registadas pela equipa. Algumas pregações ainda não têm referência.")}</p></aside>`;
  return page('teachings', { title: t("Ensinos"), back: 'home', body });
}

export function sourceCard(source) {
  return `<a class="source-card" href="/fontes/${escapeHtml(source.id)}">
    <img src="${escapeHtml(source.image)}" alt="" loading="lazy" decoding="async" />
    <span class="source-body"><span class="platform">${escapeHtml(source.platform)}</span><strong>${escapeHtml(t(source.title))}</strong><small>${escapeHtml(t(source.description))}</small></span>
  </a>`;
}

export function sourcePage(state, id) {
  const source = APP_CONFIG.sources.find((item) => item.id === id);
  if (!source) {
    return page('source', { title: t("Canal"), back: 'teachings', body: emptyState({ title: t("Canal não encontrado"), text: t("O endereço pode estar incompleto."), action: `<a class="button button-dark" href="/ensinos">${th("Ver os ensinos")}</a>` }) });
  }
  const body = `<img class="detail-image" src="${escapeHtml(source.image)}" alt="" />
    <section class="detail-copy">
      <span class="platform">${escapeHtml(source.platform)}</span>
      <h1>${escapeHtml(t(source.title))}</h1>
      <p>${escapeHtml(t(source.description))}</p>
      <a class="button button-dark full-width" ${externalLinkAttrs(source.url)}>${th("{5}Abrir no {6}{7}", { 5: icon('external', { size: 18 }), 6: escapeHtml(source.platform), 7: externalHint() })}</a>
    </section>
    <section class="content-section">
      ${sectionHeading(t("Mais recentes"), t("Últimos vídeos deste canal"))}
      ${videoRow(state, source)}
    </section>
    <section class="content-section">
      ${sectionHeading(t("Continue a explorar"), t("Outros canais"))}
      <div class="source-grid">${APP_CONFIG.sources.filter((item) => item.id !== source.id).map(sourceCard).join('')}</div>
    </section>`;
  return page('source', { title: t("Canal"), back: 'teachings', mainClass: 'detail-page', body });
}
