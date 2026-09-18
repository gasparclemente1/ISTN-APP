// "Anúncios": what the team publishes, and the conversation around it.
//
// Reading needs no account. Reacting needs one. Commenting needs the servant
// seal, and publishing a right the team grants — so the page says plainly which
// of those the reader has, instead of offering a box that would be refused.
import { escapeHtml, safeUrl } from '../html.js';
import { icon } from '../icons.js';
import { prefs } from '../prefs.js';
import { REACTIONS, reactionFor, authorName, canComment, canPublish, formatPostDate, isHighlighted, publishScopeOf, visiblePosts } from '../posts.js';
import { verifiedSeal } from '../roles.js';
import { emptyState, errorState, loadingState, page, sectionHeading } from './shared.js';

function authorLine(post) {
  const author = post.author;
  const name = authorName(author);
  const photo = safeUrl(author?.photo_url);
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return `<div class="post-author">
    <span class="post-avatar">${photo ? `<img src="${escapeHtml(photo)}" alt="" loading="lazy" />` : `<span>${escapeHtml(initials || '·')}</span>`}</span>
    <span class="post-byline">
      <strong>${escapeHtml(name)}${author?.verified ? verifiedSeal(author.servo_role) : ''}</strong>
      <small>${escapeHtml(post.scope)} · ${escapeHtml(formatPostDate(post.publishedAt))}</small>
    </span>
    ${isHighlighted(post) ? '<span class="post-pin">Em destaque</span>' : ''}
  </div>`;
}

function postImages(post, { full = false } = {}) {
  const images = post.images.map((image) => ({ ...image, url: safeUrl(image.url) })).filter((image) => image.url);
  if (!images.length) return '';
  return `<div class="post-images ${images.length > 1 ? 'is-grid' : ''}">${images.slice(0, full ? images.length : 4).map((image) => `
    <figure><img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.caption || '')}" loading="lazy" decoding="async" />${full && image.caption ? `<figcaption>${escapeHtml(image.caption)}</figcaption>` : ''}</figure>`).join('')}
  </div>`;
}

// Paragraphs, as typed. Never raw HTML: what people write is text.
const bodyHtml = (text) => String(text || '').split(/\n{2,}/).map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`).join('');

function reactionRow(state, post, { compact = true } = {}) {
  const mine = state.myReactions?.[post.id] || '';
  const selected = reactionFor(mine);
  const total = post.reactionTotal;
  const busy = Boolean(state.reactionSaving?.[post.id]);
  const id = escapeHtml(post.id);
  const active = Object.entries(post.reactions).filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]).map(([kind]) => reactionFor(kind)).filter(Boolean);
  return `<div class="post-stats">
      <span><span class="reaction-stack" aria-hidden="true">${active.slice(0, 3).map((reaction) => `<span class="${reaction.special ? 'is-special' : ''}" title="${reaction.label}">${reaction.emoji}</span>`).join('')}</span>${total ? `${total} ${total === 1 ? 'reação' : 'reações'}` : 'Seja o primeiro a reagir'}</span>
      <span>${post.commentCount} ${post.commentCount === 1 ? 'comentário' : 'comentários'}</span>
    </div>
    <div class="post-interactions compact-interactions">
      <details class="reaction-picker" data-reaction-picker>
        <summary class="reaction-trigger ${selected ? 'is-on' : ''} ${selected?.special ? 'is-special' : ''} ${selected && !selected.special ? 'is-icon-only' : ''}" data-focus-key="reaction-trigger:${id}" aria-label="${selected ? `Reação atual: ${selected.label}. Alterar reação` : 'Escolher reação'}">
          <span aria-hidden="true">${selected?.emoji || '👍'}</span>${selected?.special ? `<span>${selected.label}</span>` : selected ? '' : '<span>Reagir</span>'}
        </summary>
        <div class="reaction-popover" role="group" aria-label="Escolher reação" aria-busy="${busy}">
          <div class="reaction-options">
            ${REACTIONS.map((reaction) => `<button class="reaction-option ${reaction.special ? 'is-special' : ''} ${mine === reaction.kind ? 'is-on' : ''}" type="button"
              data-action="react" data-id="${id}" data-kind="${reaction.kind}" data-focus-key="reaction-trigger:${id}"
              aria-label="${reaction.label}${mine === reaction.kind ? ', remover reação' : ''}" title="${reaction.label}" aria-pressed="${mine === reaction.kind}" ${busy ? 'disabled' : ''}>
              <span aria-hidden="true">${reaction.emoji}</span>${reaction.special ? `<span>${reaction.label}</span>` : ''}
            </button>`).join('')}
          </div>
          ${selected && !REACTIONS.some((reaction) => reaction.kind === mine) ? `<button class="text-button legacy-reaction" type="button" data-action="react" data-id="${id}" data-kind="${escapeHtml(mine)}" data-focus-key="reaction-trigger:${id}" ${busy ? 'disabled' : ''}>Remover ${selected.label}</button>` : ''}
        </div>
      </details>
      ${compact ? `<a class="post-comment-link" href="/anuncios/${id}?comentarios=1">${icon('message', { size: 16 })}Comentar</a>` : '<button class="post-comment-link" type="button" data-action="focus-comment">' + icon('message', { size: 16 }) + 'Comentar</button>'}
    </div>`;
}

function emojiTools(target) {
  return `<div class="emoji-tools" role="group" aria-label="Adicionar emoji">
    <span>Uma palavra de carinho</span>
    ${[['🙏', 'Oração'], ['❤️', 'Amor'], ['🙌', 'Gratidão'], ['🕊️', 'Paz'], ['😊', 'Alegria']].map(([emoji, label]) => `<button type="button" data-action="insert-emoji" data-target="${target}" data-emoji="${emoji}" aria-label="Adicionar emoji: ${label}" title="${label}">${emoji}</button>`).join('')}
  </div>`;
}

function postCard(state, post) {
  return `<article class="post-card ${isHighlighted(post) ? 'is-highlighted' : ''}">
    ${authorLine(post)}
    <a class="post-open" href="/anuncios/${escapeHtml(post.id)}">
      ${post.title ? `<h3>${escapeHtml(post.title)}</h3>` : ''}
      <div class="post-body is-clamped">${bodyHtml(post.body)}</div>
      <span class="post-more">Ler tudo${icon('chevron', { size: 14 })}</span>
    </a>
    ${postImages(post)}
    ${reactionRow(state, post)}
  </article>`;
}

function composerButton(state) {
  if (!canPublish(state.profile)) return '';
  return `<button class="post-new" type="button" data-action="new-post">
    <span class="post-avatar">${icon('edit', { size: 20 })}</span>
    <span class="post-new-prompt">O que deseja partilhar?<small>Uma novidade, um convite, uma bênção.</small></span>
    <span class="post-new-photo">${icon('camera', { size: 22 })}<span>Fotos</span></span>
  </button>`;
}

export function composerSheet(state) {
  const draft = state.postDraft;
  if (!draft) return '';
  const scope = publishScopeOf(state.profile);
  const churches = state.churchOptions || [];
  const home = state.profile?.home_church_id;
  return `<div class="sheet-backdrop" data-sheet-close>
    <form class="sheet post-composer" id="post-form" role="dialog" aria-modal="true" aria-labelledby="post-sheet-title">
      <span class="sheet-grip" aria-hidden="true"></span>
      <div class="composer-heading"><div><span class="eyebrow">PARTILHAR COM A COMUNIDADE</span><h2 id="post-sheet-title">${draft.id ? 'Editar publicação' : 'Criar publicação'}</h2></div><button class="icon-button" type="button" data-sheet-close aria-label="Fechar" ${state.postUploading || state.postSaving ? 'disabled' : ''}>${icon('close')}</button></div>
      <label class="sheet-field">Título (opcional)<input type="text" name="title" data-focus-key="post-title" placeholder="Dê um título à sua publicação" value="${escapeHtml(draft.title || '')}" maxlength="120" /></label>
      <label class="sheet-field">Mensagem<textarea id="post-body" name="body" rows="5" maxlength="4000" required placeholder="Partilhe as novidades com a sua comunidade…">${escapeHtml(draft.body || '')}</textarea></label>
      ${emojiTools('post-body')}
      ${scope === 'global'
        ? `<label class="sheet-field">Para quem<select name="church_id">
            <option value="">Toda a ISTN</option>
            ${churches.map((church) => `<option value="${church.id}" ${draft.churchId === church.id ? 'selected' : ''}>ISTN — ${escapeHtml(church.locality || church.country || '')}</option>`).join('')}
          </select></label>`
        : `<p class="sheet-hint">Este anúncio é publicado na sua igreja.</p><input type="hidden" name="church_id" value="${escapeHtml(home || '')}" />`}
      <details class="post-options" ${draft.highlighted ? 'open' : ''}><summary>${icon('sun', { size: 18 })} Opções de destaque</summary><label class="sheet-check"><input type="checkbox" name="highlighted" ${draft.highlighted ? 'checked' : ''} /> Destacar este anúncio</label>
      <label class="sheet-field">Destaque até (opcional)<input type="date" name="highlight_until" value="${escapeHtml(draft.highlightUntil || '')}" /></label></details>
      <div class="sheet-field">
        <span>Fotos da publicação <small>${(draft.images || []).length}/8</small></span>
        <div class="draft-images">${(draft.images || []).map((image, index) => `<figure><img src="${escapeHtml(safeUrl(image.url))}" alt="" /><button class="icon-button small" type="button" data-action="drop-image" data-index="${index}" aria-label="Remover foto ${index + 1}" ${state.postUploading || state.postSaving ? 'disabled' : ''}>${icon('close', { size: 16 })}</button></figure>`).join('')}</div>
        <label class="post-photo-pick">${icon('camera', { size: 28 })}<strong>${state.postUploading ? 'A adicionar as suas fotos…' : 'Adicionar fotos'}</strong><span>Escolha os momentos que deseja partilhar</span><input type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label="Adicionar fotos" data-post-image ${state.postUploading || state.postSaving || draft.images.length >= 8 ? 'disabled' : ''} /></label>
        <small role="status">${state.postUploading ? 'Aguarde até todas as fotos estarem prontas.' : 'Até 8 fotos · JPG, PNG ou WebP'}</small>
      </div>
      <div class="sheet-actions">
        <button class="button button-gold full-width" type="submit" ${state.postSaving || state.postUploading ? 'disabled' : ''}>${state.postSaving ? 'A publicar…' : draft.id ? 'Guardar' : 'Publicar'}</button>
        <button class="text-button" type="button" data-sheet-close ${state.postSaving || state.postUploading ? 'disabled' : ''}>Cancelar</button>
      </div>
    </form>
  </div>`;
}

export function highlightSection(state) {
  if (!state.posts?.length) return '';
  const mine = visiblePosts(state.posts, { churchDbId: state.myChurchDbId }).filter((post) => isHighlighted(post));
  if (!mine.length) return '';
  return `<section class="content-section">
    ${sectionHeading('Em destaque', mine.length === 1 ? 'Anúncio' : 'Anúncios', '<a class="link-button" href="/anuncios">Ver todos</a>')}
    <div class="post-list">${mine.slice(0, 2).map((post) => postCard(state, post)).join('')}</div>
  </section>`;
}

export function postsPage(state) {
  let content;
  if (state.postsError) content = errorState('Não foi possível carregar os anúncios.', 'retry-posts');
  else if (!state.posts) content = loadingState('A carregar os anúncios…');
  else {
    const list = visiblePosts(state.posts, { churchDbId: state.myChurchDbId });
    content = list.length
      ? `<div class="post-list">${list.map((post) => postCard(state, post)).join('')}</div>`
      : emptyState({ title: 'Ainda não há anúncios', text: 'Quando a equipa publicar algo, aparece aqui.' });
  }
  const body = `<section class="page-intro"><span class="eyebrow">ISTN-SJ</span><h1>A nossa comunidade.</h1><p>Novidades, encontros e momentos que nos aproximam.</p></section>
    ${composerButton(state)}
    ${content}`;
  return page('posts', { title: 'Anúncios', back: 'home', body }) + composerSheet(state);
}

function commentList(state, post) {
  const comments = state.comments?.[post.id];
  if (!comments) return '<p class="hint">A carregar comentários…</p>';
  if (!comments.length) return '<div class="comments-empty"><span aria-hidden="true">🕊️</span><strong>Uma conversa começa com carinho.</strong><p>Ainda não há comentários nesta publicação.</p></div>';
  return `<ul class="comment-list">${comments.map((comment) => {
    const author = state.postAuthors?.get(comment.author_id);
    const name = authorName(author);
    const photo = safeUrl(author?.photo_url);
    return `<li><span class="post-avatar comment-avatar">${photo ? `<img src="${escapeHtml(photo)}" alt="" loading="lazy" />` : escapeHtml((name || '·').slice(0, 1))}</span><div class="comment-content"><div class="comment-bubble">
      <strong>${escapeHtml(name)}${author?.verified ? verifiedSeal(author.servo_role) : ''}</strong>
      <div>${bodyHtml(comment.body)}</div></div>
      <small>${escapeHtml(formatPostDate(comment.created_at))}</small></div>
    </li>`;
  }).join('')}</ul>`;
}

function commentForm(state, post) {
  if (canComment(state.profile)) {
    return `<form id="comment-form" class="comment-form" data-id="${escapeHtml(post.id)}">
      <label class="sheet-field"><span class="sr-only">Comentar</span>
        <textarea id="comment-body" name="body" rows="2" maxlength="2000" required ${state.commentSaving ? 'disabled' : ''} placeholder="Deixe uma mensagem de carinho…">${escapeHtml(state.commentDrafts?.[post.id] || '')}</textarea>
      </label>
      <div class="comment-toolbar">${emojiTools('comment-body')}<button class="button button-dark" type="submit" ${state.commentSaving ? 'disabled' : ''}>${state.commentSaving ? 'A enviar…' : 'Enviar'}${icon('arrowRight', { size: 18 })}</button></div>
    </form>`;
  }
  return `<p class="notice">${icon('info', { size: 18 })}<span>${state.profile
    ? 'Os comentários estão reservados aos servos com selo de verificação. Pode reagir a este anúncio.'
    : 'Entre com a sua conta para reagir. Comentar está reservado aos servos verificados.'}</span></p>`;
}

export function postPage(state, id) {
  const back = { title: 'Anúncio', back: 'posts' };
  if (state.postsError) return page('post', { ...back, body: errorState('Não foi possível carregar os anúncios.', 'retry-posts') });
  if (!state.posts) return page('post', { ...back, body: loadingState('A carregar…') });
  const post = state.posts.find((item) => item.id === id);
  if (!post) {
    return page('post', { ...back, body: emptyState({ title: 'Anúncio não encontrado', text: 'Pode ter sido removido pela equipa.', action: '<a class="button button-dark" href="/anuncios">Ver os anúncios</a>' }) });
  }
  const mine = state.profile && post.authorId === state.profile.id;
  const body = `<article class="post-full ${isHighlighted(post) ? 'is-highlighted' : ''}">
      ${authorLine(post)}
      ${post.title ? `<h1>${escapeHtml(post.title)}</h1>` : ''}
      <div class="post-body">${bodyHtml(post.body)}</div>
      ${postImages(post, { full: true })}
      ${reactionRow(state, post, { compact: false })}
      ${mine ? `<div class="post-owner-actions">
        <button class="text-button" type="button" data-action="edit-post" data-id="${escapeHtml(post.id)}">${icon('edit', { size: 16 })}Editar</button>
        <button class="text-button danger" type="button" data-action="delete-post" data-id="${escapeHtml(post.id)}">${icon('close', { size: 16 })}Eliminar</button>
      </div>` : ''}
    </article>
    <section class="comments" aria-labelledby="comments-title">
      <h2 id="comments-title">Comentários<small>${state.comments?.[post.id]?.length ?? post.commentCount}</small></h2>
      ${commentForm(state, post)}
      ${commentList(state, post)}
    </section>`;
  return page('post', { ...back, body }) + composerSheet(state);
}

// Kept next to the feed: the home page's "A minha ISTN" card and this page both
// need the church the reader chose, as the database knows it.
export const myChurchDbId = (state) => state.directory?.churches.find((church) => church.id === prefs.myChurch)?.dbId || null;
