// The latest videos of the ministry's YouTube channels.
import { APP_CONFIG } from '../data.js';
import { escapeHtml, externalLinkAttrs, safeUrl } from '../html.js';
import { icon } from '../icons.js';
import { externalHint, sectionHeading } from './shared.js';

function videoCard(video) {
  const thumbnail = safeUrl(video.thumbnail);
  return `<a class="video-card" ${externalLinkAttrs(video.url)}>
    <span class="video-thumb">${thumbnail ? `<img src="${escapeHtml(thumbnail)}" alt="" loading="lazy" decoding="async" />` : ''}<span class="play-badge">${icon('play', { size: 14 })}</span></span>
    <span class="video-copy">${video.meta ? `<small>${escapeHtml(video.meta)}</small>` : ''}<strong>${escapeHtml(video.title)}</strong><em>Ver no YouTube${externalHint}</em></span>
  </a>`;
}

export function videoRow(state, source) {
  const videos = state.latestVideos[source.channelId]?.videos || [];
  if (videos.length) return `<div class="video-row">${videos.slice(0, 4).map(videoCard).join('')}</div>`;
  if (state.videosLoading) return '<div class="video-empty" role="status"><span class="loader" aria-hidden="true"></span><p>A carregar os últimos vídeos…</p></div>';
  return `<div class="video-empty"><p>O YouTube não respondeu agora.</p><a class="button button-outline" ${externalLinkAttrs(source.url)}>Abrir o canal${externalHint}</a></div>`;
}

export function latestVideosSection(state) {
  const sources = APP_CONFIG.sources.filter((source) => source.channelId);
  if (!sources.length) return '';
  return `<section class="content-section latest-videos">
    ${sectionHeading('Atualizado pelo YouTube', 'Últimos vídeos publicados')}
    ${sources.map((source) => `<div class="video-group">
      <div class="video-group-title"><h3>${escapeHtml(source.title)}</h3><a class="link-button" href="/fontes/${escapeHtml(source.id)}">Ver canal</a></div>
      ${videoRow(state, source)}
    </div>`).join('')}
  </section>`;
}
