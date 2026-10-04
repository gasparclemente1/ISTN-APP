import assert from 'node:assert/strict';
import { createPostTranslator } from '../lib/post-translation.mjs';
import { createTranslationStore, postTranslations } from '../src/post-translation.js';
import { postCard, postPage } from '../src/views/posts.js';
import { setLanguage } from '../src/i18n.js';

const source = { id: 'public-post', title: 'Convite', body: 'Venha ao culto.', hidden: false, images: [], reactions: {}, reactionTotal: 0, commentCount: 0, scope: 'Toda a ISTN' };
const answer = { title: 'Invitation', body: 'Come to the service.', sourceLanguage: 'pt' };
const provider = (data = answer) => ({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(data) }] }] }) });

test('tradução envia só texto público, usa esquema e reutiliza a revisão', async () => {
  let post = { ...source }; let calls = 0;
  const api = createPostTranslator({ apiKey: 'test-only', loadPosts: async () => ({ posts: [post] }), fetcher: async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const request = JSON.parse(options.body);
    assert.equal(request.store, false);
    assert.equal(request.text.format.strict, true);
    assert.deepEqual(JSON.parse(request.input[0].content), { title: post.title, body: post.body });
    assert.match(request.instructions, /Elijah/);
    return provider();
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
  const api = createPostTranslator({ apiKey: 'test-only', hourlyLimit: 1, now: () => clock, loadPosts: async () => ({ posts: [source] }), fetcher: async () => provider() });
  await api.translate(source.id, 'en');
  await api.translate(source.id, 'en');
  await assert.rejects(api.translate(source.id, 'fr'), { status: 429 });
  clock = 3600001;
  await api.translate(source.id, 'fr');
});

test('falhas, recusas e respostas incompletas da IA não expõem contexto nem ficam em cache', async () => {
  for (const bad of [
    async () => { throw new Error('secret provider detail'); },
    async () => ({ ok: false }),
    async () => ({ ok: true, json: async () => ({ status: 'incomplete' }) }),
    async () => provider({ title: 42, body: '', sourceLanguage: 'pt' }),
    async () => ({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] }) })
  ]) {
    let calls = 0;
    const api = createPostTranslator({ apiKey: 'test-only', loadPosts: async () => ({ posts: [source] }), fetcher: (...args) => { calls++; return bad(...args); } });
    await assert.rejects(api.translate(source.id, 'en'), { message: 'translation_failed' });
    await assert.rejects(api.translate(source.id, 'en'), { message: 'translation_failed' });
    assert.equal(calls, 2);
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
