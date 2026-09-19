// The home page: what is happening next, the reader's own church, the newest
// videos, and a way into everything else.
import { APP_CONFIG } from '../data.js';
import { SEAT_LABELS, findChurch, placeKindLabel } from '../directory.js';
import { escapeHtml } from '../html.js';
import { icon } from '../icons.js';
import { prefs } from '../prefs.js';
import { seatSeal, serviceChips } from './churches.js';
import { liveCard, liveChip } from './live.js';
import { highlightSection } from './posts.js';
import { page, sectionHeading } from './shared.js';
import { sourceCard } from './teachings.js';
import { latestVideosSection } from './videos.js';

function myChurchCard(state) {
  if (!prefs.myChurch || !state.directory) return '';
  const church = findChurch(state.directory.churches, prefs.myChurch);
  if (!church) return '';
  return `<section class="content-section">
    ${sectionHeading('A minha ISTN', `ISTN — ${church.name}`)}
    <a class="my-church" href="/igrejas/${escapeHtml(church.id)}">
      <span class="round-icon">${church.seat ? seatSeal(church.seat, { size: 28 }) : icon(church.modality === 'online' ? 'globe' : 'church', { size: 22 })}</span>
      <span><small>${escapeHtml(church.seat ? SEAT_LABELS[church.seat] : placeKindLabel(church))}${church.region ? ` · ${escapeHtml(church.region)}` : ''}</small>
        ${church.services.length ? serviceChips(church) : '<strong>Horário a confirmar</strong>'}
        ${church.leaderName ? `<span>${escapeHtml(church.leaderName)}</span>` : ''}</span>
      ${icon('chevron', { size: 20 })}
    </a>
  </section>`;
}

function savedLink() {
  const count = prefs.favorites.size;
  if (!count) return '';
  return `<a class="saved-link" href="/ensinos?guardadas=1">${icon('heart', { size: 18 })}<span>${count === 1 ? '1 pregação guardada' : `${count} pregações guardadas`}</span>${icon('chevron', { size: 18 })}</a>`;
}

// The welcome keeps the supplied portrait prominent and the next live visible.
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
      <img src="/design/assets/photos/elias-destaque.png" width="433" height="577" alt="Profeta Elias a pregar" fetchpriority="high" />
      <span class="hero-signature">Profeta <strong>Elias</strong></span>
    </div>
    <div class="hero-actions">
      <a class="button button-gold" href="/ensinos">Explorar ensinos${icon('arrowRight', { size: 18 })}</a>
      <a class="button button-glass" href="/igrejas">${icon('church', { size: 18 })}Encontrar uma igreja</a>
    </div>
  </section>`;
}

export function homePage(state) {
  const body = `
    ${welcome(state)}
    <section class="content-section">${liveCard(state)}</section>
    ${highlightSection(state)}
    ${myChurchCard(state)}
    ${latestVideosSection(state)}
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
  return page('home', { mainClass: 'home', body, action: `<a class="icon-button" href="/ensinos" aria-label="Pesquisar ensinos">${icon('search', { size: 22 })}</a>` });
}
