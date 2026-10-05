import assert from 'node:assert/strict';
import { createPostTranslator, prayersAsPosts } from '../lib/post-translation.mjs';
import { createTranslationStore, displayedPrayer, prayerTranslationControl } from '../src/post-translation.js';
import { prayerPage, prayersPage } from '../src/views/prayers.js';
import { setLanguage } from '../src/i18n.js';

const prayer = { id: 'p1', title: 'Oração contra o câncer', description: 'Para quem tem algum câncer/cancro', themeId: 't1', theme: { id: 't1', name: 'Câncer & Coma' }, duration: 40, audioUrl: 'https://example.org/a.mp3' };
const inLanguage = (code, fn) => { setLanguage(code, { remember: false }); try { return fn(); } finally { setLanguage('pt', { remember: false }); } };
const provider = (title, body, to) => ({ ok: true, json: async () => [title, body].map((text) => ({ detectedLanguage: { language: 'pt', score: 1 }, translations: [{ text, to }] })) });

test('uma oração traduz-se como um anúncio: o título é o título e a descrição é o corpo', async () => {
  assert.deepEqual(prayersAsPosts({ prayers: [prayer, { id: 'p2', title: 'Só título' }] }).posts.map(({ id, title, body, hidden }) => [id, title, body, hidden]),
    [['p1', 'Oração contra o câncer', 'Para quem tem algum câncer/cancro', false], ['p2', 'Só título', '', false]]);
  const sent = [];
  const api = createPostTranslator({ apiKey: 'test-only', loadPosts: async () => prayersAsPosts({ prayers: [prayer] }), fetcher: async (url, options) => {
    sent.push(JSON.parse(options.body));
    return provider('Prayer against cancer', 'For anyone with cancer', new URL(url).searchParams.get('to'));
  } });
  const result = await api.translate('p1', 'en');
  assert.equal(result.title, 'Prayer against cancer');
  assert.equal(result.body, 'For anyone with cancer');
  // Só o texto da oração sai: nada do áudio, da duração, nem de quem a gravou.
  assert.deepEqual(sent, [[{ Text: '<div>Oração contra o câncer</div>' }, { Text: '<div>Para quem tem algum câncer/cancro</div>' }]]);
  await assert.rejects(api.translate('inexistente', 'en'), { status: 404 });
});

test('no cliente, a tradução da oração mostra-se e o original volta', async () => {
  const calls = [];
  const store = createTranslationStore({ endpoint: '/api/prayers/translate', fetcher: async (url) => {
    calls.push(url);
    return { ok: true, json: async () => ({ title: 'Prière contre le cancer', body: 'Pour toute personne atteinte d’un cancer', sourceLanguage: 'pt', targetLanguage: 'fr' }) };
  } });
  const asPost = { id: 'p1', title: prayer.title, body: prayer.description };
  setLanguage('fr', { remember: false });
  try {
    await store.toggle(asPost, 'fr');
    assert.deepEqual(calls, ['/api/prayers/translate?id=p1&language=fr']);
    assert.equal(store.get(asPost, 'fr').show, true);
    await store.toggle(asPost, 'fr');
    assert.equal(store.get(asPost, 'fr').show, false);
    assert.equal(calls.length, 1, 'ver o original não pede nada ao servidor');
  } finally { setLanguage('pt', { remember: false }); }
});

test('em português não há botão de tradução; noutra língua há, fora da ligação do cartão', () => {
  assert.equal(prayerTranslationControl(prayer), '');
  const state = { prayers: [prayer], prayerThemes: [prayer.theme], prayerFilters: { query: '', theme: '' }, prayerBusy: {}, prayerPlaying: '', profile: null, admin: null };
  const card = inLanguage('fr', () => prayersPage(state));
  assert.match(card, /data-action="translate-prayer" data-id="p1"/);
  assert.match(card, /Voir la traduction/);
  assert.doesNotMatch(card, /<a class="prayer-open"[^>]*>(?:(?!<\/a>).)*<button/s, 'um botão dentro de uma ligação seria inválido');
  assert.match(card, /Cancer &amp; coma/);
  assert.doesNotMatch(prayersPage(state), /translate-prayer/);
  const full = inLanguage('en', () => prayerPage(state, 'p1'));
  assert.match(full, /data-action="translate-prayer"/);
});

test('sem pedido de tradução, a oração fica como foi publicada', () => {
  assert.equal(displayedPrayer(prayer), prayer);
});
