import assert from 'node:assert/strict';
import { canonicalRedirect } from '../lib/canonical.mjs';

const canonicalHost = 'istnsj.org';

test('um endereço antigo leva ao novo, com o caminho e a pesquisa', () => {
  assert.equal(canonicalRedirect({ host: 'elias-istn-sj.onrender.com', pathname: '/igrejas/ao-kifica', search: '?x=1', canonicalHost }),
    'https://istnsj.org/igrejas/ao-kifica?x=1');
  assert.equal(canonicalRedirect({ host: 'www.istnsj.org', pathname: '/', canonicalHost }), 'https://istnsj.org/');
  assert.equal(canonicalRedirect({ host: 'ISTNSJ.ORG', pathname: '/anuncios', canonicalHost }), null);
});

test('sem domínio próprio, em casa, e no exame de saúde, não se redireciona nada', () => {
  assert.equal(canonicalRedirect({ host: 'elias-istn-sj.onrender.com', pathname: '/', canonicalHost: '' }), null);
  assert.equal(canonicalRedirect({ host: 'localhost:4173', pathname: '/', canonicalHost }), null);
  assert.equal(canonicalRedirect({ host: '127.0.0.1:4176', pathname: '/igrejas', canonicalHost }), null);
  // O Render chama /healthz pelo nome do próprio serviço: tem de responder 200.
  assert.equal(canonicalRedirect({ host: 'elias-istn-sj.onrender.com', pathname: '/healthz', canonicalHost }), null);
});

test('o endereço de destino nunca vem do pedido', () => {
  assert.equal(canonicalRedirect({ host: 'qualquer.test', pathname: '/', canonicalHost: 'mau exemplo/evil' }), null);
  assert.equal(canonicalRedirect({ host: 'qualquer.test', pathname: '/', canonicalHost: 'https://istnsj.org/' }), 'https://istnsj.org/');
});
