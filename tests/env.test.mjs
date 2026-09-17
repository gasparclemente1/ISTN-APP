import assert from 'node:assert/strict';
import { parseEnv } from '../lib/env.mjs';
import { createProviderLookup, supabaseConfig } from '../lib/supabase.mjs';

test('lê KEY=valor, ignora comentários e aspas', () => {
  assert.deepEqual(parseEnv('# nota\nSUPABASE_URL=abcdefghijkl\nKEY="com espaço" \nPROVIDERS=google, zoom # comentário\n\nlixo'), {
    SUPABASE_URL: 'abcdefghijkl', KEY: 'com espaço', PROVIDERS: 'google, zoom'
  });
});

test('o id do projeto vira o endereço do Supabase', () => {
  assert.equal(supabaseConfig({ SUPABASE_URL: 'abcdefghijkl' }).supabaseUrl, 'https://abcdefghijkl.supabase.co');
  assert.equal(supabaseConfig({ SUPABASE_URL: 'https://x.supabase.co/' }).supabaseUrl, 'https://x.supabase.co');
  // Só o Google: outros fornecedores listados são ignorados.
  assert.deepEqual(supabaseConfig({ SUPABASE_OAUTH_PROVIDERS: 'Google, ,zoom,facebook' }).providers, ['google']);
  assert.deepEqual(supabaseConfig({ SUPABASE_OAUTH_PROVIDERS: 'facebook' }).providers, []);
  assert.equal(supabaseConfig({}).supabaseUrl, '');
});

test('o botão do Google aparece quando o Google está ativo no Supabase, sem outra configuração', async () => {
  const config = { supabaseUrl: 'https://x.supabase.co', supabaseKey: 'pk', providers: [] };
  let clock = 0;
  let calls = 0;
  const settings = { external: { email: true, google: true, facebook: true, zoom: true } };
  const lookup = createProviderLookup(config, async (url, { headers }) => {
    calls += 1;
    assert.equal(url, 'https://x.supabase.co/auth/v1/settings');
    assert.equal(headers.apikey, 'pk');
    return settings;
  }, { now: () => clock });
  assert.deepEqual(await lookup(), ['google']);
  await lookup();
  assert.equal(calls, 1);
  settings.external.google = false;
  clock = 6 * 60 * 1000;
  assert.deepEqual(await lookup(), []);
});

test('sem acesso às definições do Supabase usa a lista do ambiente; sem Supabase, nada', async () => {
  const failing = async () => { throw new Error('down'); };
  assert.deepEqual(await createProviderLookup({ supabaseUrl: 'https://x.supabase.co', supabaseKey: 'pk', providers: ['google'] }, failing)(), ['google']);
  assert.deepEqual(await createProviderLookup({ supabaseUrl: '', supabaseKey: '', providers: ['google'] }, failing)(), []);
});
