import { language, t, th } from './i18n.js';
import { escapeHtml } from './html.js';

// Per-language/per-revision state, shared by cards and the full publication.
// Never replace the source used by editing, sharing, moderation or video links.
export function createTranslationStore({ fetcher = (...args) => globalThis.fetch(...args), endpoint = '/api/posts/translate' } = {}) {
  const entries = new Map();
  const keyFor = (post, target) => JSON.stringify([post.id, post.title, post.body, target]);
  function get(post, target = language()) { return entries.get(keyFor(post, target)); }
  async function toggle(post, target = language()) {
    const key = keyFor(post, target);
    let entry = entries.get(key);
    if (entry?.loading) return;
    if (entry?.result) { entry.show = !entry.show; return; }
    if (entries.size >= 200) entries.delete(entries.keys().next().value);
    entry = { loading: true, show: false, error: '' };
    entries.set(key, entry);
    try {
      const response = await fetcher(`${endpoint}?id=${encodeURIComponent(post.id)}&language=${target}`, {
        method: 'POST', signal: AbortSignal.timeout(30000)
      });
      const data = await response.json();
      if (!response.ok) throw Object.assign(new Error(), { code: data.code });
      if (data.targetLanguage !== target || typeof data.title !== 'string' || typeof data.body !== 'string') throw new Error();
      entry.result = data;
      entry.show = true;
    } catch (error) {
      entry.error = error.code === 'translation_unavailable' ? 'A tradução ainda não está disponível.'
        : error.code === 'translation_busy' ? 'Há muitos pedidos de tradução. Tente novamente dentro de alguns minutos.'
          : 'Não foi possível traduzir. Tente novamente.';
    } finally { entry.loading = false; }
  }
  return { get, toggle };
}
export const postTranslations = createTranslationStore();
export function displayedPost(post) {
  const entry = postTranslations.get(post);
  return entry?.show && entry.result ? { ...post, title: entry.result.title, body: entry.result.body } : post;
}
export function translationControl(post, { store = postTranslations, action = 'translate-post' } = {}) {
  if (!`${post.title || ''}${post.body || ''}`.trim()) return '';
  const entry = store.get(post);
  const translated = entry?.show && entry.result;
  const same = translated?.sourceLanguage?.split('-')[0] === language()
    && translated.title === (post.title || '') && translated.body === (post.body || '');
  return `<div class="post-translation" aria-live="polite">
    <button class="text-button" type="button" data-action="${action}" data-id="${escapeHtml(post.id)}" data-focus-key="translate:${escapeHtml(post.id)}" aria-pressed="${Boolean(translated)}" ${entry?.loading ? 'disabled' : ''}>${th(entry?.loading ? 'A traduzir…' : translated ? 'Ver original' : 'Ver tradução')}</button>
    ${translated ? `<small>${th(same ? 'O texto já está no seu idioma.' : 'Tradução automática · pode conter erros')}</small>` : ''}
    ${entry?.error ? `<small role="status">${escapeHtml(t(entry.error))}</small>` : ''}
  </div>`;
}

// The Prophet's prayers: the same translator, the same wording, the same
// warning. A prayer's description plays the part of a post's body. It is only
// offered in another language: the prayers are recorded in Portuguese.
export const prayerTranslations = createTranslationStore({ endpoint: '/api/prayers/translate' });
const asPost = (prayer) => ({ id: prayer.id, title: prayer.title || '', body: prayer.description || '' });
export function displayedPrayer(prayer) {
  const entry = prayerTranslations.get(asPost(prayer));
  return entry?.show && entry.result
    ? { ...prayer, title: entry.result.title, description: entry.result.body, translated: true }
    : prayer;
}
export function prayerTranslationControl(prayer) {
  return language() === 'pt' ? '' : translationControl(asPost(prayer), { store: prayerTranslations, action: 'translate-prayer' });
}
