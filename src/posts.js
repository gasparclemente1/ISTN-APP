// Announcements: how a post is put together, who may write one, and what a
// reaction adds up to. Pure functions, so the rules can be tested without a
// browser and the same ones answer in the app and in the panel.
import { churchTitle } from './directory.js';
import { videoId } from './library.js';
import { collator } from './text.js';
import { roleShort } from './roles.js';

export const REACTIONS = [
  { kind: 'curtir', label: 'Gosto', emoji: '👍' },
  { kind: 'gosto', label: 'Amei', emoji: '❤️' },
  { kind: 'oracao', label: 'Em oração', emoji: '🙏🏾' },
  { kind: 'celebrar', label: 'Celebrar', emoji: '🎉' },
  { kind: 'emocionado', label: 'Emocionado', emoji: '😭' },
  { kind: 'elias_deus', label: 'Elias é Deus', emoji: '✦', special: true }
];

// Preserve the meaning of historical reactions, including Amém which is no
// longer offered in the picker. Existing heart reactions keep their stored key.
export const reactionFor = (kind) => REACTIONS.find((reaction) => reaction.kind === kind)
  || (kind === 'amem' ? { kind: 'amem', label: 'Amém', emoji: '🙌' } : null);

export const PUBLISH_SCOPES = [
  { id: 'nenhum', label: 'Não publica' },
  { id: 'igreja', label: 'Só a sua igreja' },
  { id: 'global', label: 'Toda a ISTN' }
];

// "Bp. Rufino Boaz" for a verified servant, the plain name otherwise: the rank
// is added here, never stored with the name.
export function authorName(author) {
  if (!author) return 'Sem nome';
  const short = author.verified ? roleShort(author.servo_role) : '';
  return short ? `${short} ${author.display_name}` : author.display_name;
}

// A post joined with its author, images, reactions and comment count.
export function normalizePost(row, { authors = new Map(), reactions = [], comments = [], churches = [] } = {}) {
  const mine = reactions.filter((reaction) => reaction.post_id === row.id);
  const counts = {};
  mine.forEach((reaction) => { counts[reaction.kind] = (counts[reaction.kind] || 0) + 1; });
  const church = row.church_id ? churches.find((item) => item.dbId === row.church_id) : null;
  return {
    id: row.id,
    title: row.title || '',
    body: row.body || '',
    churchId: row.church_id || null,
    churchName: church?.name || null,
    scope: row.church_id ? (church?.name ? churchTitle(church) : 'Uma igreja') : 'Toda a ISTN',
    highlighted: Boolean(row.highlighted),
    highlightUntil: row.highlight_until || null,
    hidden: Boolean(row.hidden),
    publishedAt: row.published_at,
    authorId: row.author_id,
    author: authors.get(row.author_id) || null,
    images: [...(row.post_images || [])]
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((image) => ({ url: image.url, caption: image.caption || '' })),
    reactions: counts,
    reactionTotal: mine.length,
    commentCount: comments.filter((comment) => comment.post_id === row.id).length
  };
}

// Highlighted while it lasts: a highlight with a date stops on its own, so
// nobody has to remember to take last month's announcement down.
export function isHighlighted(post, today = new Date()) {
  if (!post.highlighted) return false;
  if (!post.highlightUntil) return true;
  const until = new Date(`${post.highlightUntil}T23:59:59Z`);
  return !Number.isNaN(until.getTime()) && until >= today;
}

// Highlighted first, then newest first.
export function sortPosts(posts, today = new Date()) {
  return [...posts].sort((a, b) => (isHighlighted(b, today) - isHighlighted(a, today))
    || collator.compare(b.publishedAt || '', a.publishedAt || ''));
}

// Posts worth reading for this person: everything for the whole ISTN, plus
// their own church's.
export function visiblePosts(posts, { churchDbId = null } = {}) {
  return posts.filter((post) => !post.churchId || post.churchId === churchDbId);
}

export const isApostolo = (profile) => profile?.servo_claim_status === 'aprovado' && profile?.servo?.role === 'apostolo';
export const isVerifiedServant = (profile) => profile?.servo_claim_status === 'aprovado' && Boolean(profile?.servo_id);

// What this account may publish: nothing, only its own church, or everything.
// The database decides again on every write (migration 009); this only decides
// what to offer.
export function publishScopeOf(profile) {
  if (!profile) return 'nenhum';
  if (isApostolo(profile)) return 'global';
  return PUBLISH_SCOPES.some((scope) => scope.id === profile.publish_scope) ? profile.publish_scope : 'nenhum';
}

export const canPublish = (profile) => publishScopeOf(profile) !== 'nenhum';
export const canComment = (profile) => isVerifiedServant(profile);

export function formatPostDate(value, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.round((now - date) / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 60 * 24) return `há ${Math.floor(minutes / 60)} h`;
  if (minutes < 60 * 24 * 7) {
    const days = Math.floor(minutes / (60 * 24));
    return days === 1 ? 'ontem' : `há ${days} dias`;
  }
  return new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

// Addresses written in a post, as typed, without the full stop or bracket that
// ends the sentence around them.
export function linksIn(text) {
  return (String(text || '').match(/https?:\/\/[^\s<>"']+/g) || [])
    .map((link) => link.replace(/[.,;:!?)\]]+$/, ''));
}

// The YouTube videos a post points to, once each and at most three: a video is
// shared as a link and watched on YouTube, so it weighs nothing on the app or
// on the database.
export function videosIn(text) {
  const ids = [];
  linksIn(text).forEach((link) => {
    const id = videoId(link);
    if (id && /^[\w-]{6,20}$/.test(id) && !ids.includes(id)) ids.push(id);
  });
  return ids.slice(0, 3).map((id) => ({ id, url: `https://www.youtube.com/watch?v=${id}`, thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }));
}

// What "Partilhar" sends along with the link: the title and the first line of
// the text, enough for whoever receives it to know what it is about.
export function postShareText(post) {
  const clip = (text) => (text.length > 140 ? `${text.slice(0, 139).trimEnd()}…` : text);
  const firstLine = String(post.body || '').split('\n').map((line) => line.trim()).find(Boolean) || '';
  if (post.title) return firstLine ? `${post.title}\n${clip(firstLine)}` : post.title;
  return clip(firstLine || 'Anúncio');
}
