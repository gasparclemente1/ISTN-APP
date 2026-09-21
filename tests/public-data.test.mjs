import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPublicData } from '../lib/public-data.mjs';

const config = { supabaseUrl: 'https://proj.supabase.co', supabaseKey: 'pk' };
const readLocal = (name) => readFile(new URL(`../data/${name}`, import.meta.url), 'utf8').then(JSON.parse);

function fakeSupabase(responses) {
  const calls = [];
  const fetchJson = async (url, { headers }) => {
    calls.push({ url, headers });
    const table = new URL(url).pathname.split('/').pop();
    const answer = responses[table];
    if (answer instanceof Error) throw answer;
    return typeof answer === 'function' ? answer() : answer;
  };
  return { calls, fetchJson };
}

test('reuniões vêm do Supabase com a chave pública e ficam um minuto em cache', async () => {
  let clock = 0;
  const { calls, fetchJson } = fakeSupabase({ meetings: [{ id: 'm1' }] });
  const data = createPublicData({ config, fetchJson, readLocal, now: () => clock });
  assert.equal((await data.meetings()).meetings[0].id, 'm1');
  await data.meetings();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers.apikey, 'pk');
  assert.match(calls[0].url, /active=eq\.true/);
  clock = 61 * 1000;
  await data.meetings();
  assert.equal(calls.length, 2);
});

test('reuniões: sem base de dados não há cópia antiga, e uma resposta velha tem prazo', async () => {
  await assert.rejects(createPublicData({ config: {}, readLocal }).meetings(), { status: 503 });

  let clock = 0;
  let fail = false;
  const { fetchJson } = fakeSupabase({ meetings: () => { if (fail) throw new Error('down'); return [{ id: 'm1' }]; } });
  const data = createPublicData({ config, fetchJson, readLocal, now: () => clock });
  await data.meetings();
  fail = true;
  clock = 2 * 60 * 1000;
  assert.equal((await data.meetings()).stale, true);
  clock = 7 * 60 * 60 * 1000;
  await assert.rejects(data.meetings());
});

test('diretório: da base de dados com servos, ou dos ficheiros de origem quando falha', async () => {
  const { fetchJson } = fakeSupabase({
    churches: [{ id: 'u1', record_id: 'source_record_001', modality: 'physical', country_code: 'AO', locality: 'Kifica', church_services: [] }],
    servos: [{ church_id: 'u1', full_name: 'Rufino Boaz', role: 'bispo' }]
  });
  const fromDb = await createPublicData({ config, fetchJson, readLocal }).directory();
  assert.equal(fromDb.source, 'supabase');
  assert.equal(fromDb.churches[0].servants[0].name, 'Bp. Rufino Boaz');

  const down = fakeSupabase({ churches: new Error('down'), servos: [] });
  const fallback = await createPublicData({ config, fetchJson: down.fetchJson, readLocal }).directory();
  assert.equal(fallback.source, 'arquivo');
  assert.equal(fallback.churches.length, 73);

  const unconfigured = await createPublicData({ config: {}, readLocal }).directory();
  assert.equal(unconfigured.source, 'arquivo');
});

test('diretório: se só os servos falharem, as igrejas continuam a vir da base de dados', async () => {
  const { fetchJson } = fakeSupabase({ churches: [{ id: 'u1', modality: 'online', country: 'Noruega' }], servos: new Error('down') });
  const result = await createPublicData({ config, fetchJson, readLocal }).directory();
  assert.equal(result.source, 'supabase');
  assert.deepEqual(result.churches[0].servants, []);
});

test('diretório: só mostra o número de um servo que escolheu torná-lo visível', async () => {
  const { calls, fetchJson } = fakeSupabase({
    churches: [{ id: 'u1', modality: 'physical', country_code: 'AO', locality: 'Kifica' }],
    servos: [{ id: 's1', church_id: 'u1', full_name: 'Rufino Boaz', role: 'bispo' }, { id: 's2', church_id: 'u1', full_name: 'Maria Boaz', role: 'dona' }],
    // A real database would return only the public row; a wrong one is ignored too.
    servo_contacts: [{ servo_id: 's1', phone: '+244 900 000 001', phone_public: true }, { servo_id: 's2', phone: '+244 900 000 002', phone_public: false }]
  });
  const { churches } = await createPublicData({ config, fetchJson, readLocal }).directory();
  assert.deepEqual(churches[0].servants.map((servant) => servant.phone), ['+244 900 000 001', null]);
  assert.ok(calls.some((call) => call.url.includes('servo_contacts') && call.url.includes('phone_public=eq.true')));
});

test('o diretório pede e publica o nome e a sede guardados pelo Admin', async () => {
  const { calls, fetchJson } = fakeSupabase({ churches: [{ id: 'u1', name: 'ISTN Esperança', locality: 'Kifica', seat: 'mundial' }], servos: [] });
  const result = await createPublicData({ config, fetchJson, readLocal }).directory();
  assert.equal(result.churches[0].name, 'ISTN Esperança');
  assert.equal(result.churches[0].seat, 'mundial');
  const selection = new URL(calls.find(({ url }) => url.includes('/churches?')).url).searchParams.get('select').split(',');
  assert.ok(selection.includes('name'));
  assert.ok(selection.includes('seat'));
});

test('o feed traz as comunidades e a etiqueta de cada anúncio', async () => {
  const { fetchJson } = fakeSupabase({
    posts: [{ id: 'p1', body: 'Encontro do ML', community_id: 'k1', published_at: '2026-09-21T09:00:00Z' },
      { id: 'p2', body: 'Culto', community_id: null, published_at: '2026-09-20T09:00:00Z' }],
    post_authors: [], post_reactions: [], post_comments: [],
    communities: [{ id: 'k1', slug: 'ml', name: 'Mulher no Lar', short_name: 'ML', sort_order: 1 }],
    churches: [], servos: [], servo_contacts: []
  });
  const feed = await createPublicData({ config, fetchJson, readLocal }).posts();
  assert.deepEqual(feed.communities.map((community) => community.shortName), ['ML']);
  assert.equal(feed.posts.find((post) => post.id === 'p1').community.name, 'Mulher no Lar');
  assert.equal(feed.posts.find((post) => post.id === 'p2').community, null);
});

test('sem a lista de comunidades o feed lê-se na mesma, sem etiquetas', async () => {
  const { fetchJson } = fakeSupabase({
    posts: [{ id: 'p1', body: 'Encontro do ML', community_id: 'k1', published_at: '2026-09-21T09:00:00Z' }],
    post_authors: [], post_reactions: [], post_comments: [],
    communities: new Error('down'),
    churches: [], servos: [], servo_contacts: []
  });
  const feed = await createPublicData({ config, fetchJson, readLocal }).posts();
  assert.deepEqual(feed.communities, []);
  assert.equal(feed.posts[0].community, null);
  assert.equal(feed.posts[0].communityId, 'k1');
});
