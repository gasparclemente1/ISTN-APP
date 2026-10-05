import { createHash } from 'node:crypto';
import { createTranslationCache, validTranslation } from './translation-cache.mjs';
import { translationHtml, translatedText } from './translation-text.mjs';

const LANGUAGES = { pt: 'pt-pt', en: 'en', fr: 'fr', es: 'es' };
const fail = (status, code) => Object.assign(new Error(code), { status, code });

// Only public, server-loaded posts may be translated. Never accept arbitrary
// browser text or an external URL, and never send author/profile data.
export function createPostTranslator({
  loadPosts, apiKey = process.env.AZURE_TRANSLATOR_KEY || '',
  region = process.env.AZURE_TRANSLATOR_REGION || '', cacheFile = '',
  fetcher = globalThis.fetch, now = Date.now, hourlyLimit = 120,
  hourlyCharacterLimit = 30000, maxConcurrent = 4
}) {
  const cache = createTranslationCache({ file: cacheFile, now });
  const pending = new Map();
  let windowStart = now();
  let requests = 0;
  let characters = 0;
  let active = 0;
  const translate = async (id, target) => {
    if (!Object.hasOwn(LANGUAGES, target) || typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id)) throw fail(400, 'invalid_request');
    if (!apiKey) throw fail(503, 'translation_unavailable');
    const payload = await loadPosts();
    if (payload.stale) throw fail(503, 'translation_unavailable');
    const post = payload.posts.find((item) => item.id === id && !item.hidden);
    if (!post) throw fail(404, 'post_not_found');
    const title = String(post.title || '');
    const body = String(post.body || '');
    if (!`${title}${body}`.trim() || title.length + body.length > 12000) throw fail(400, 'invalid_request');
    const key = createHash('sha256').update(JSON.stringify(['azure-v3-glossary-v1', id, title, body, target])).digest('hex');
    if (pending.has(key)) return pending.get(key);
    const work = (async () => {
      const hit = await cache.get(key);
      if (hit) return hit;
      const fields = [{ name: 'title', text: title }, { name: 'body', text: body }].filter((field) => field.text.trim());
      const texts = fields.map((field) => ({ Text: translationHtml(field.text, target) }));
      // Conservatively count markup as well. Count once for the only target;
      // cache hits and duplicate readers do not spend more quota.
      const size = texts.reduce((sum, item) => sum + [...item.Text].length, 0);
      if (now() - windowStart >= 3600000) { windowStart = now(); requests = 0; characters = 0; }
      if (requests >= hourlyLimit || characters + size > hourlyCharacterLimit || active >= maxConcurrent) throw fail(429, 'translation_busy');
      requests += 1;
      characters += size;
      active += 1;
      try {
        const url = new URL('https://api.cognitive.microsofttranslator.com/translate');
        url.search = new URLSearchParams({ 'api-version': '3.0', to: LANGUAGES[target], textType: 'html' }).toString();
        const response = await fetcher(url.href, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(25000),
          headers: {
            'Ocp-Apim-Subscription-Key': apiKey,
            ...(region ? { 'Ocp-Apim-Subscription-Region': region } : {}),
            'Content-Type': 'application/json; charset=UTF-8'
          },
          body: JSON.stringify(texts)
        });
        if (response.status === 429) throw fail(429, 'translation_busy');
        if (response.status === 401 || response.status === 403) throw fail(503, 'translation_unavailable');
        if (!response.ok) throw fail(502, 'translation_failed');
        const result = await response.json();
        if (!Array.isArray(result) || result.length !== fields.length) throw fail(502, 'translation_failed');
        const value = { title: '', body: '', sourceLanguage: 'und', targetLanguage: target };
        for (const [index, field] of fields.entries()) {
          const translated = result[index]?.translations?.find((item) => item.to?.toLowerCase() === LANGUAGES[target]);
          if (typeof translated?.text !== 'string' || translated.text.length > 100000) throw fail(502, 'translation_failed');
          value[field.name] = translatedText(translated.text);
          if (!value[field.name].trim()) throw fail(502, 'translation_failed');
          const detected = result[index].detectedLanguage?.language;
          if (typeof detected === 'string') value.sourceLanguage = detected; // Body detection wins over a short title.
        }
        if (!validTranslation(value)) throw fail(502, 'translation_failed');
        await cache.set(key, value);
        return value;
      } catch (error) {
        if (['translation_busy', 'translation_unavailable'].includes(error.code)) throw error;
        // Never relay provider details which may contain context/credentials.
        throw fail(502, 'translation_failed');
      } finally { active -= 1; }
    })();
    pending.set(key, work);
    try { return await work; } finally { pending.delete(key); }
  };
  return { translate, enabled: Boolean(apiKey) };
}
