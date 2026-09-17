import assert from 'node:assert/strict';
import { escapeHtml, externalLinkAttrs, safeUrl, whatsAppUrl } from '../src/html.js';

test('escapa tudo o que pode fechar um atributo ou abrir uma etiqueta', () => {
  assert.equal(escapeHtml(`"><img src=x onerror='1'>&`), '&quot;&gt;&lt;img src=x onerror=&#39;1&#39;&gt;&amp;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(0), '0');
});

test('só aceita endereços https por omissão', () => {
  assert.equal(safeUrl('https://us02web.zoom.us/j/1?pwd=a'), 'https://us02web.zoom.us/j/1?pwd=a');
  for (const bad of ['javascript:alert(1)', ' JAVASCRIPT:alert(1)', 'data:text/html,x', 'http://zoom.us', '//evil.test', 'zoom.us/j/1', '']) {
    assert.equal(safeUrl(bad), '', bad);
  }
  assert.equal(safeUrl('tel:+244900', { schemes: ['tel:'] }), 'tel:+244900');
  assert.equal(safeUrl('/igrejas', { relative: true }), '/igrejas');
  assert.equal(safeUrl('//evil.test', { relative: true }), '');
});

test('um link inseguro fica sem href em vez de apontar para o perigo', () => {
  assert.equal(externalLinkAttrs('javascript:alert(1)'), '');
  assert.match(externalLinkAttrs('https://youtube.com/watch?v=a&b=c'), /href="https:\/\/youtube\.com\/watch\?v=a&amp;b=c" target="_blank" rel="noopener noreferrer"/);
});

test('WhatsApp usa só os dígitos, e nada quando não há número', () => {
  assert.equal(whatsAppUrl('+244 922 846 000'), 'https://wa.me/244922846000');
  assert.equal(whatsAppUrl(undefined), '');
  assert.equal(whatsAppUrl('a confirmar'), '');
});
