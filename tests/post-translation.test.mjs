import assert from 'node:assert/strict';
import { createPostTranslator } from '../lib/post-translation.mjs';
import { createTranslationStore, postTranslations } from '../src/post-translation.js';
import { postCard, postPage } from '../src/views/posts.js';
import { setLanguage } from '../src/i18n.js';

const source = { id: 'public-post', title: 'Convite', body: 'Venha ao culto.', hidden: false, images: [], reactions: {}, reactionTotal: 0, commentCount: 0, scope: 'Toda a ISTN' };
const answer = { title: 'Invitation', body: 'Come to the service.', sourceLanguage: 'pt' };
const provider = (data = answer, to = 'en') => ({ ok: true, json: async () => [data.title, data.body].map((text) => ({
  detectedLanguage: { language: data.sourceLanguage, score: 1 }, translations: [{ text, to }]
})) });

test('Microsoft recebe só texto público, deteta a língua e reutiliza a revisão', async () => {
  let post = { ...source }; let calls = 0;
  const api = createPostTranslator({ apiKey: 'test-only', region: 'westeurope', loadPosts: async () => ({ posts: [post] }), fetcher: async (url, options) => {
    calls++;
    const parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname, 'https://api.cognitive.microsofttranslator.com/translate');
    assert.equal(parsed.searchParams.get('api-version'), '3.0');
    assert.equal(parsed.searchParams.has('from'), false);
    assert.equal(parsed.searchParams.get('textType'), 'html');
    assert.equal(options.headers['Ocp-Apim-Subscription-Key'], 'test-only');
    assert.equal(options.headers['Ocp-Apim-Subscription-Region'], 'westeurope');
    assert.deepEqual(JSON.parse(options.body), [{ Text: `<div>${post.title}</div>` }, { Text: `<div>${post.body}</div>` }]);
    return provider(answer, parsed.searchParams.get('to'));
  }});
  const [one, two] = await Promise.all([api.translate(post.id, 'en'), api.translate(post.id, 'en')]);
  assert.deepEqual(one, two); assert.equal(calls, 1);
  await api.translate(post.id, 'en'); assert.equal(calls, 1);
  post.body = 'Novo texto';
  await api.translate(post.id, 'en'); assert.equal(calls, 2);
  await api.translate(post.id, 'fr'); assert.equal(calls, 3);
});

test('posts ausentes, escondidos, dados antigos e idiomas inválidos não chegam à IA', async () => {
  let payload = { posts: [{ ...source, hidden: true }] }; let calls = 0;
  const api = createPostTranslator({ apiKey: 'test-only', loadPosts: async () => payload, fetcher: async () => { calls++; return provider(); } });
  await assert.rejects(api.translate(source.id, 'en'), { status: 404 });
  await assert.rejects(api.translate('missing', 'en'), { status: 404 });
  await assert.rejects(api.translate(source.id, 'de'), { status: 400 });
  payload = { posts: [source], stale: true };
  await assert.rejects(api.translate(source.id, 'en'), { status: 503 });
  assert.equal(calls, 0);
  const disabled = createPostTranslator({ apiKey: '', loadPosts: async () => payload });
  await assert.rejects(disabled.translate(source.id, 'en'), { code: 'translation_unavailable' });
});

test('limite de consumo permite cache mas bloqueia novos pedidos e recupera na hora seguinte', async () => {
  let clock = 0;
  const api = createPostTranslator({ apiKey: 'test-only', hourlyLimit: 1, now: () => clock, loadPosts: async () => ({ posts: [source] }), fetcher: async (url) => provider(answer, new URL(url).searchParams.get('to')) });
  await api.translate(source.id, 'en');
  await api.translate(source.id, 'en');
  await assert.rejects(api.translate(source.id, 'fr'), { status: 429 });
  clock = 3600001;
  await api.translate(source.id, 'fr');
});

test('falhas e respostas inválidas não expõem contexto nem ficam em cache', async () => {
  for (const bad of [
    async () => { throw new Error('secret provider detail'); },
    async () => ({ ok: false, status: 500 }),
    async () => ({ ok: true, json: async () => ({ unexpected: true }) }),
    async () => provider({ title: 42, body: '', sourceLanguage: 'pt' }),
    async () => provider(answer, 'de')
  ]) {
    let calls = 0;
    const api = createPostTranslator({ apiKey: 'test-only', loadPosts: async () => ({ posts: [source] }), fetcher: (...args) => { calls++; return bad(...args); } });
    await assert.rejects(api.translate(source.id, 'en'), { message: 'translation_failed' });
    await assert.rejects(api.translate(source.id, 'en'), { message: 'translation_failed' });
    assert.equal(calls, 2);
  }
});

test('Microsoft sem quota/autorização e com pedidos excessivos produz erros controlados', async () => {
  for (const [status, code] of [[401, 'translation_unavailable'], [403, 'translation_unavailable'], [429, 'translation_busy']]) {
    const api = createPostTranslator({ apiKey: 'test-only', loadPosts: async () => ({ posts: [source] }), fetcher: async () => ({ ok: false, status }) });
    await assert.rejects(api.translate(source.id, 'en'), { code });
  }
});

test('alternância original/tradução é por idioma e revisão; o original fica intacto', async () => {
  let calls = 0;
  const store = createTranslationStore({ fetcher: async (url) => { calls++; return { ok: true, json: async () => ({ ...answer, targetLanguage: new URL(url, 'https://example.test').searchParams.get('language') }) }; } });
  await store.toggle(source, 'en'); assert.equal(store.get(source, 'en').show, true);
  await store.toggle(source, 'en'); assert.equal(store.get(source, 'en').show, false);
  await store.toggle(source, 'en'); assert.equal(calls, 1);
  assert.equal(store.get(source, 'fr'), undefined);
  assert.equal(store.get({ ...source, body: 'Editado' }, 'en'), undefined);
  assert.equal(source.body, 'Venha ao culto.');
});

test('cartão e anúncio completo exibem tradução escapada e mantêm autor e edição originais', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ...answer, title: '<script>alert(1)</script>', targetLanguage: 'en' }) });
  try {
    setLanguage('en', { remember: false });
    const state = { posts: [source], comments: {}, profile: null };
    await postTranslations.toggle(source);
    for (const html of [postCard(state, source), postPage(state, source.id)]) {
      assert.match(html, /See original/);
      assert.match(html, /&lt;script&gt;/);
      assert.doesNotMatch(html, /<script>/);
      assert.match(html, /Automatic translation/);
      assert.match(html, /data-action="translate-post"/);
      assert.match(html, /Come to the service/);
    }
    await postTranslations.toggle(source);
    assert.match(postCard(state, source), /Convite/);
    assert.equal(source.body, 'Venha ao culto.');
  } finally { globalThis.fetch = previous; setLanguage('pt', { remember: false }); }
});


test('falha da tradução deixa original visível e permite repetir o pedido', async () => {
  let calls = 0;
  const store = createTranslationStore({ fetcher: async () => {
    calls++;
    if (calls === 1) return { ok: false, json: async () => ({ code: 'translation_unavailable' }) };
    return { ok: true, json: async () => ({ ...answer, targetLanguage: 'fr' }) };
  }});
  await store.toggle(source, 'fr');
  assert.equal(store.get(source, 'fr').show, false);
  assert.equal(store.get(source, 'fr').loading, false);
  assert.match(store.get(source, 'fr').error, /não está disponível/);
  await store.toggle(source, 'fr');
  assert.equal(store.get(source, 'fr').show, true);
});

test('português usa pt-pt; publicações sem título e deteção do corpo são aceites', async () => {
  const api = createPostTranslator({ apiKey: 'test-only', region: '', loadPosts: async () => ({ posts: [{ ...source, title: '' }] }), fetcher: async (url, options) => {
    assert.equal(new URL(url).searchParams.get('to'), 'pt-pt');
    assert.equal(options.headers['Ocp-Apim-Subscription-Region'], undefined);
    assert.equal(JSON.parse(options.body).length, 1);
    return { ok: true, json: async () => [{ detectedLanguage: { language: 'en' }, translations: [{ to: 'pt-pt', text: '<div>Venha ao culto.</div>' }] }] };
  }});
  assert.deepEqual(await api.translate(source.id, 'pt'), { title: '', body: 'Venha ao culto.', sourceLanguage: 'en', targetLanguage: 'pt' });
});

test('limite de caracteres bloqueia consumo novo mas reutiliza cache', async () => {
  let calls = 0;
  const api = createPostTranslator({ apiKey: 'test-only', hourlyCharacterLimit: 60, loadPosts: async () => ({ posts: [source] }), fetcher: async () => { calls++; return provider(); } });
  await api.translate(source.id, 'en');
  await api.translate(source.id, 'en');
  await assert.rejects(api.translate(source.id, 'es'), { code: 'translation_busy' });
  assert.equal(calls, 1);
});

test('limite simultâneo libera a vaga após resposta e partilha pedidos iguais', async () => {
  let release;
  let started;
  const began = new Promise((resolve) => { started = resolve; });
  const api = createPostTranslator({ apiKey: 'test-only', maxConcurrent: 1, loadPosts: async () => ({ posts: [source] }), fetcher: async () => {
    started();
    await new Promise((resolve) => { release = resolve; });
    return provider();
  }});
  const one = api.translate(source.id, 'en');
  await began;
  const duplicate = api.translate(source.id, 'en');
  await assert.rejects(api.translate(source.id, 'fr'), { code: 'translation_busy' });
  release();
  assert.deepEqual(await one, await duplicate);
});

test('traduções guardadas sobrevivem à criação de outro tradutor e invalidam revisões', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const folder = await mkdtemp(join(tmpdir(), 'istn-cache-test-'));
  let post = { ...source }; let calls = 0;
  const options = { apiKey: 'test-only', cacheFile: join(folder, 'cache.json'), loadPosts: async () => ({ posts: [post] }), fetcher: async () => { calls++; return provider(); } };
  try {
    await createPostTranslator(options).translate(post.id, 'en');
    await createPostTranslator(options).translate(post.id, 'en');
    assert.equal(calls, 1);
    post.body += '!';
    await createPostTranslator(options).translate(post.id, 'en');
    assert.equal(calls, 2);
    post.hidden = true;
    await assert.rejects(createPostTranslator(options).translate(post.id, 'en'), { status: 404 });
  } finally { await rm(folder, { recursive: true, force: true }); }
});
