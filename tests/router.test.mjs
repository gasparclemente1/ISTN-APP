import assert from 'node:assert/strict';
import { parseLocation, pathFor } from '../src/router.js';
import { APP_ROUTES } from '../lib/static.mjs';

const at = (href) => parseLocation(new URL(href, 'https://elias.test'));

test('cada endereço abre a página certa, com os seus parâmetros', () => {
  assert.equal(at('/').name, 'home');
  assert.equal(at('/ensinos?guardadas=1').search.get('guardadas'), '1');
  assert.deepEqual(at('/igrejas/source_record_001').params, { id: 'source_record_001' });
  assert.equal(at('/igrejas/').name, 'churches');
  assert.equal(at('/fontes/streams').params.id, 'streams');
  assert.equal(at('/nao-existe').name, 'home');
});

test('os endereços que a app cria são os que o servidor conhece', () => {
  const paths = [pathFor('home'), pathFor('teachings'), pathFor('live'), pathFor('churches'), pathFor('church', { id: 'online_record_001' }), pathFor('source', { id: 'streams' }), pathFor('profile')];
  paths.forEach((path) => assert.ok(APP_ROUTES.some((route) => route.test(path)), path));
  paths.forEach((path) => assert.equal(pathFor(at(path).name, at(path).params), path));
});
