import assert from 'node:assert/strict';
import { parseEnv } from '../lib/env.mjs';
import { supabaseConfig } from '../lib/supabase.mjs';

test('lê KEY=valor, ignora comentários e aspas', () => {
  assert.deepEqual(parseEnv('# nota\nSUPABASE_URL=abcdefghijkl\nKEY="com espaço" \nPROVIDERS=google, zoom # comentário\n\nlixo'), {
    SUPABASE_URL: 'abcdefghijkl', KEY: 'com espaço', PROVIDERS: 'google, zoom'
  });
});

test('o id do projeto vira o endereço do Supabase', () => {
  assert.equal(supabaseConfig({ SUPABASE_URL: 'abcdefghijkl' }).supabaseUrl, 'https://abcdefghijkl.supabase.co');
  assert.equal(supabaseConfig({ SUPABASE_URL: 'https://x.supabase.co/' }).supabaseUrl, 'https://x.supabase.co');
  assert.deepEqual(supabaseConfig({ SUPABASE_OAUTH_PROVIDERS: 'google, ,zoom' }).providers, ['google', 'zoom']);
  assert.equal(supabaseConfig({}).supabaseUrl, '');
});
