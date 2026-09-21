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
      <span><small>${escapeHtml(church.seat ? SEAT_LABELS[church.seat] : placeKindLabel(church))}${church.region ? ` · ${escapeHtml(church.region)}` : ''}</small>
        ${church.services.length ? serviceChips(church) : '<strong>Horário a confirmar</strong>'}
        ${church.leaderName ? `<span>${escapeHtml(church.leaderName)}</span>` : ''}</span>
      ${icon('chevron', { size: 20 })}
  </a>`;
}

function savedLink() {
  const count = prefs.favorites.size;
  if (!count) return '';
  return `<a class="saved-link" href="/ensinos?guardadas=1">${icon('heart', { size: 18 })}<span>${count === 1 ? '1 pregação guardada' : `${count} pregações guardadas`}</span>${icon('chevron', { size: 18 })}</a>`;
}

// A newcomer gets the welcome; someone who already lives in the app gets the
// news. The portrait and the greeting stay either way — it was asked for, and
// it is the church's face — but for a returning member they are a strip above
// the feed instead of a wall in front of it. The picture is the same file the
// server already preloads, so nothing extra is downloaded for either of them.
const newcomer = (state) => !prefs.myChurch && !state.profile;

function welcomeStrip(state) {
  return `<section class="hero-strip">
    <img src="/design/assets/photos/elias-destaque.png" width="433" height="576" alt="Profeta Elias" fetchpriority="high" />
    <div>
      <p>Bem-vindo à <span class="brand-mark">ISTN-SJ</span></p>
      ${liveChip(state)}
    </div>
  </section>`;
}

function welcome(state) {
  return `<section class="hero" aria-labelledby="hero-title">
    <div class="hero-copy">
      <span class="eyebrow">Igreja Salvação de Todas as Nações · Sol da Justiça</span>
      <h1 id="hero-title">Bem-vindo à <span class="brand-mark">ISTN-SJ</span></h1>
      <p>Pregações do Profeta Elias, reuniões no Zoom e as igrejas ISTN-SJ perto de si.</p>
      ${liveChip(state)}
    </div>
    <div class="hero-art">
      <span class="hero-sun" aria-hidden="true"></span>
      <img src="/design/assets/photos/elias-destaque.png" width="433" height="576" alt="Profeta Elias a pregar" fetchpriority="high" />
      <span class="hero-signature">Profeta <strong>Elias</strong></span>
    </div>
    <div class="hero-actions">
      <a class="button button-gold" href="/ensinos">Explorar ensinos${icon('arrowRight', { size: 18 })}</a>
      <a class="button button-glass" href="/igrejas">${icon('church', { size: 18 })}Encontrar uma igreja</a>
    </div>
  </section>`;
}

// The home page is the feed. What used to sit under it — the reader's church,
// the prayers, the newest videos — now travels inside it, as cards between the
// announcements: still found, and no longer in front of the news.
const HOME_FEED = 8;

function feed(state) {
  if (state.postsError) return '';
  if (!state.posts) return loadingState('A carregar os anúncios…');
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
    ${mine.length > HOME_FEED ? `<a class="button button-outline full-width" href="/anuncios">Ver todos os anúncios${icon('arrowRight', { size: 18 })}</a>` : ''}`;
}

function prayersCard() {
  return `<a class="home-card" href="/oracoes">
    <span class="round-icon">${icon('pray', { size: 22 })}</span>
    <span><small>ORAÇÕES DO PROFETA ELIAS</small>
      <strong>Uma oração para o que se está a viver.</strong>
      <span>Doença, libertação, finanças. Oiça, e envie a quem precisa.</span></span>
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
      ${sectionHeading('Biblioteca', 'Canais do YouTube', '<a class="link-button" href="/ensinos">Todas as pregações</a>')}
      ${savedLink()}
      <div class="source-grid">${APP_CONFIG.sources.map(sourceCard).join('')}</div>
    </section>
    ${state.profile || !state.accountsAvailable ? '' : `<section class="join-invite">
      <span class="round-icon">${icon('user', { size: 22 })}</span>
      <div><span class="eyebrow">Conta opcional</span><h2>Leve as suas preferências consigo.</h2><p>Com conta, a sua igreja e as pregações guardadas acompanham-no em qualquer telemóvel. E se serve na ISTN, pode pedir o selo de verificação.</p></div>
      <a class="button button-gold" href="/perfil">Entrar ou registar-se</a>
    </section>`}
    ${prefs.myChurch ? '' : `<section class="find-istn">
      <img class="find-istn-photo" src="/design/assets/photos/congregacao-istn-640.webp" srcset="/design/assets/photos/congregacao-istn-640.webp 640w, /design/assets/photos/congregacao-istn-1280.webp 1280w" sizes="(min-width: 760px) 700px, 100vw" alt="Membros da ISTN-SJ reunidos com o Profeta Elias" loading="lazy" decoding="async" />
      <div><span class="eyebrow">ISTN-SJ Mundial</span><h2>A sua igreja pode estar mais perto.</h2><p>Procure por país, região, cidade ou dia de culto.</p></div>
      <a class="button button-dark" href="/igrejas">${icon('search', { size: 18 })}Encontrar a minha igreja</a>
    </section>`}`;
  return page('home', { mainClass: 'home', body, action: `<a class="icon-button" href="/ensinos" aria-label="Pesquisar ensinos">${icon('search', { size: 22 })}</a>` })
    + composerSheet(state) + reactionSheet(state);
}
