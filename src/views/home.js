import { t, th } from '../i18n.js';
// The home page: what is happening next, the announcements the church is
// reading right now, the reader's own church, the newest videos, and a way into
// everything else.
import { APP_CONFIG } from '../data.js';
import { SEAT_LABELS, churchTitle, findChurch, placeKindLabel } from '../directory.js';
import { escapeHtml } from '../html.js';
import { icon } from '../icons.js';
import { prefs } from '../prefs.js';
import { seatSeal, serviceChips } from './churches.js';
import { liveCard, liveChip } from './live.js';
import { composerButton, composerSheet, postCard, reactionSheet } from './posts.js';
import { sortPosts, visiblePosts } from '../posts.js';
import { loadingState, page, sectionHeading } from './shared.js';
import { sourceCard } from './teachings.js';
import { latestVideosSection } from './videos.js';

function myChurchCard(state) {
  if (!prefs.myChurch || !state.directory) return '';
  const church = findChurch(state.directory.churches, prefs.myChurch);
  if (!church) return '';
  return `<a class="my-church home-card" href="/igrejas/${escapeHtml(church.id)}">
      <span class="round-icon">${church.seat ? seatSeal(church.seat, { size: 28 }) : icon(church.modality === 'online' ? 'globe' : 'church', { size: 22 })}</span>
      <span><small>${escapeHtml(t(church.seat ? SEAT_LABELS[church.seat] : placeKindLabel(church)))}${church.region ? ` · ${escapeHtml(church.region)}` : ''}</small>
        ${church.services.length ? serviceChips(church) : `<strong>${th("Horário a confirmar")}</strong>`}
        ${church.leaderName ? `<span>${escapeHtml(church.leaderName)}</span>` : ''}</span>
      ${icon('chevron', { size: 20 })}
  </a>`;
}

function savedLink() {
  const count = prefs.favorites.size;
  if (!count) return '';
  return `<a class="saved-link" href="/ensinos?guardadas=1">${icon('heart', { size: 18 })}<span>${count === 1 ? t("1 pregação guardada") : t("{0} pregações guardadas", { 0: count })}</span>${icon('chevron', { size: 18 })}</a>`;
}

// A newcomer gets the welcome; someone who already lives in the app gets the
// news. The portrait and the greeting stay either way — it was asked for, and
// it is the church's face — but for a returning member they are a strip above
// the feed instead of a wall in front of it. The picture is the same file the
// server already preloads, so nothing extra is downloaded for either of them.
const newcomer = (state) => !prefs.myChurch && !state.profile;

function welcomeStrip(state) {
  return `<section class="hero-strip">
    <img src="/design/assets/photos/elias-destaque.png" width="433" height="576" alt="${th("Profeta Elias")}" fetchpriority="high" />
    <div>
      <p>${th("Bem-vindo à")} <span class="brand-mark">ISTN-SJ</span></p>
      ${liveChip(state)}
    </div>
  </section>`;
}

function welcome(state) {
  return `<section class="hero" aria-labelledby="hero-title">
    <div class="hero-copy">
      <span class="eyebrow">${th("Igreja Salvação de Todas as Nações · Sol da Justiça")}</span>
      <h1 id="hero-title">${th("Bem-vindo à")} <span class="brand-mark">ISTN-SJ</span></h1>
      <p>${th("Pregações do Profeta Elias, reuniões no Zoom e as igrejas ISTN-SJ perto de si.")}</p>
      ${liveChip(state)}
    </div>
    <div class="hero-art">
      <span class="hero-sun" aria-hidden="true"></span>
      <img src="/design/assets/photos/elias-destaque.png" width="433" height="576" alt="${th("Profeta Elias a pregar")}" fetchpriority="high" />
      <span class="hero-signature">${th("Profeta")} <strong>${th("Elias")}</strong></span>
    </div>
    <div class="hero-actions">
      <a class="button button-gold" href="/ensinos">${th("Explorar ensinos{1}", { 1: icon('arrowRight', { size: 18 }) })}</a>
      <a class="button button-glass" href="/igrejas">${th("{2}Encontrar uma igreja", { 2: icon('church', { size: 18 }) })}</a>
    </div>
  </section>`;
}

// The home page is the feed. What used to sit under it — the reader's church,
// the prayers, the newest videos — now travels inside it, as cards between the
// announcements: still found, and no longer in front of the news.
const HOME_FEED = 8;

function feed(state) {
  if (state.postsError) return '';
  if (!state.posts) return loadingState(t("A carregar os anúncios…"));
  const mine = sortPosts(visiblePosts(state.posts, { churchDbId: state.myChurchDbId }));
  const between = { 1: myChurchCard(state), 3: prayersCard(), 5: latestVideosSection(state) };
  const items = [];
  mine.slice(0, HOME_FEED).forEach((post, index) => {
    items.push(postCard(state, post));
    if (between[index]) items.push(between[index]);
  });
  // Nothing published yet: the cards still have to appear, or the home page
  // would be empty but for a greeting.
  if (!mine.length) items.push(...Object.values(between).filter(Boolean));
  return `<div class="home-feed">${items.filter(Boolean).join('')}</div>
    ${mine.length > HOME_FEED ? `<a class="button button-outline full-width" href="/anuncios">${th("Ver todos os anúncios{0}", { 0: icon('arrowRight', { size: 18 }) })}</a>` : ''}`;
}

function prayersCard() {
  return `<a class="home-card" href="/oracoes">
    <span class="round-icon">${icon('pray', { size: 22 })}</span>
    <span><small>${th("ORAÇÕES DO PROFETA ELIAS")}</small>
      <strong>${th("Uma oração para o que se está a viver.")}</strong>
      <span>${th("Doença, libertação, finanças. Oiça, e envie a quem precisa.")}</span></span>
    ${icon('chevron', { size: 20 })}
  </a>`;
}

export function homePage(state) {
  const body = `
    ${newcomer(state) ? welcome(state) : welcomeStrip(state)}
    <section class="content-section">${liveCard(state)}</section>
    ${composerButton(state)}
    ${feed(state)}
    <section class="content-section">
      ${sectionHeading(t("Biblioteca"), t("Canais do YouTube"), `<a class="link-button" href="/ensinos">${th("Todas as pregações")}</a>`)}
      ${savedLink()}
      <div class="source-grid">${APP_CONFIG.sources.map(sourceCard).join('')}</div>
    </section>
    ${state.profile || !state.accountsAvailable ? '' : `<section class="join-invite">
      <span class="round-icon">${icon('user', { size: 22 })}</span>
      <div><span class="eyebrow">${th("Conta opcional")}</span><h2>${th("Leve as suas preferências consigo.")}</h2><p>${th("Com conta, a sua igreja e as pregações guardadas acompanham-no em qualquer telemóvel. E se serve na ISTN, pode pedir o selo de verificação.")}</p></div>
      <a class="button button-gold" href="/perfil">${th("Entrar ou registar-se")}</a>
    </section>`}
    ${prefs.myChurch ? '' : `<section class="find-istn">
      <img class="find-istn-photo" src="/design/assets/photos/congregacao-istn-640.webp" srcset="/design/assets/photos/congregacao-istn-640.webp 640w, /design/assets/photos/congregacao-istn-1280.webp 1280w" sizes="(min-width: 760px) 700px, 100vw" alt="${th("Membros da ISTN-SJ reunidos com o Profeta Elias")}" loading="lazy" decoding="async" />
      <div><span class="eyebrow">${th("ISTN-SJ Mundial")}</span><h2>${th("A sua igreja pode estar mais perto.")}</h2><p>${th("Procure por país, região, cidade ou dia de culto.")}</p></div>
      <a class="button button-dark" href="/igrejas">${th("{0}Encontrar a minha igreja", { 0: icon('search', { size: 18 }) })}</a>
    </section>`}`;
  return page('home', { mainClass: 'home', body, action: `<a class="icon-button" href="/ensinos" aria-label="${th("Pesquisar ensinos")}">${icon('search', { size: 22 })}</a>` })
    + composerSheet(state) + reactionSheet(state);
}
