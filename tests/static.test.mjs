import assert from 'node:assert/strict';
import { resolvePublicPath } from '../lib/static.mjs';
import { contentSecurityPolicy } from '../lib/security.mjs';

const root = '/srv/elias';

test('serve os ficheiros da aplicação', () => {
  assert.equal(resolvePublicPath(root, '/src/app.js').path, '/srv/elias/src/app.js');
  assert.equal(resolvePublicPath(root, '/design/assets/icons/icon-192.png').type, 'image/png');
  assert.equal(resolvePublicPath(root, '/data/youtube-teachings.json').path, '/srv/elias/data/youtube-teachings.json');
  assert.equal(resolvePublicPath(root, '/sw.js').path, '/srv/elias/sw.js');
});

test('as rotas da aplicação devolvem a página, e /admin o painel', () => {
  for (const route of ['/', '/ensinos', '/ao-vivo', '/igrejas', '/igrejas/source_record_001', '/perfil', '/fontes/streams']) {
    assert.equal(resolvePublicPath(root, route).path, '/srv/elias/index.html', route);
  }
  assert.equal(resolvePublicPath(root, '/admin').path, '/srv/elias/admin.html');
});

test('recusa o que não é da aplicação: código do servidor, git, env, SQL', () => {
  for (const path of ['/server.mjs', '/.git/config', '/.env', '/supabase/seed.sql', '/package.json',
    '/lib/static.mjs', '/scripts/generate_seed.py', 
    '/design/assets/Imagens-Profeta-Elias/x.JPG', '/src/.hidden.js', '/igrejas/x/y']) {
    assert.equal(resolvePublicPath(root, path).status, 404, path);
  }
});

test('não sai da pasta com .. codificado ou por prefixo parecido', () => {
  assert.equal(resolvePublicPath(root, '/src/../server.mjs').status, 404);
  assert.equal(resolvePublicPath(root, '/src/%2e%2e/server.mjs').status, 404);
  assert.equal(resolvePublicPath(root, '/src/..%2f..%2fetc/passwd').status, 404);
  assert.equal(resolvePublicPath(root, '/src/..%5cserver.mjs').status, 400);
});

test('um endereço impossível de descodificar é 400, não um erro que derruba o servidor', () => {
  assert.equal(resolvePublicPath(root, '/%E0%A4%A').status, 400);
  assert.equal(resolvePublicPath(root, '/src/%00app.js').status, 400);
});

test('a política de conteúdo só deixa correr scripts do próprio servidor', () => {
  const policy = contentSecurityPolicy({ supabaseUrl: 'https://abc.supabase.co/' });
  assert.match(policy, /script-src 'self';/);
  assert.match(policy, /connect-src 'self' blob: https:\/\/abc\.supabase\.co/);
  // As orações tocam a partir do projeto, ou do ficheiro que este telemóvel já guardou.
  assert.match(policy, /media-src 'self' blob: https:\/\/abc\.supabase\.co/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.doesNotMatch(contentSecurityPolicy(), /undefined/);
});
