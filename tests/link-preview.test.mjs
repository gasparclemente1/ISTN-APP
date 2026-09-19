import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PREVIEW_BOTS, churchPreview, postPreview, previewFor, sectionPreview, withPreview } from '../lib/link-preview.mjs';
import { normalizeChurch, rowsFromDirectoryFile } from '../src/directory.js';

const churches = rowsFromDirectoryFile(JSON.parse(readFileSync(new URL('../data/igrejas.json', import.meta.url)))).map((row) => normalizeChurch(row));
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const load = { directory: async () => ({ churches }), posts: async () => ({ posts: [{ id: 'p1', title: '', body: 'Vigília na sede. https://youtu.be/SBntJhzgKDM', images: [] }] }) };

test('um link de uma igreja mostra o nome, a sede, os dias e a morada', async () => {
  const preview = await previewFor('/igrejas/ao-kifica', load);
  assert.equal(preview.title, 'ISTN — Kifica · Sede mundial');
  assert.match(preview.description, /^Quinta, 15:00 · Sábado, 09:00 · Domingo, 09:00 — Rua 149/);
  // O link antigo também, e com o endereço de agora.
  const former = await previewFor('/igrejas/source_record_064', load);
  assert.equal(former.title, 'ISTN — Kifica · Sede mundial');
  assert.match(withPreview(html, former, { origin: 'https://app.istn.test', pathname: '/igrejas/source_record_064' }), /og:url" content="https:\/\/app\.istn\.test\/igrejas\/ao-kifica"/);
  // Sem morada, a região e o país.
  assert.match(churchPreview(churches.find((church) => church.id === 'ao-sapu-2')).description, /Luanda, Angola$/);
});

test('um link de um anúncio mostra o texto e a imagem do vídeo', async () => {
  const preview = await previewFor('/anuncios/p1', load);
  assert.equal(preview.title, 'Anúncio da ISTN-SJ');
  assert.equal(preview.image, 'https://i.ytimg.com/vi/SBntJhzgKDM/hqdefault.jpg');
  assert.equal(postPreview({ title: 'T', body: 'x', images: [{ url: 'https://foto.test/a.jpg' }] }).image, 'https://foto.test/a.jpg');
  // Um anúncio que já não existe: a secção.
  assert.equal((await previewFor('/anuncios/outro', load)).title, 'Anúncios · ISTN-SJ');
});

test('as secções têm o seu próprio título, sem ir à base de dados', () => {
  assert.equal(sectionPreview('/ao-vivo').title, 'Reuniões que nos fortalecem · ISTN-SJ');
  assert.equal(sectionPreview('/').title, 'ISTN-SJ — Igreja Salvação de Todas as Nações');
  assert.equal(sectionPreview('/perfil').image, '/design/assets/photos/partilha-istn-sj.jpg');
});

test('as etiquetas entram no index.html, escapadas, com endereços completos', () => {
  const page = withPreview(html, { title: 'A <script>alert(1)</script> "x" $& $1', description: 'Texto & mais', image: '/design/assets/photos/partilha-istn-sj.jpg' },
    { origin: 'https://app.istn.test', pathname: '/igrejas/ao-kifica' });
  assert.match(page, /<title>A &lt;script&gt;alert\(1\)&lt;\/script&gt; &quot;x&quot; \$&amp; \$1<\/title>/);
  assert.ok(!page.includes('<script>alert'));
  assert.match(page, /<meta property="og:image" content="https:\/\/app\.istn\.test\/design\/assets\/photos\/partilha-istn-sj\.jpg" \/>/);
  assert.match(page, /<meta property="og:url" content="https:\/\/app\.istn\.test\/igrejas\/ao-kifica" \/>/);
  assert.match(page, /<meta name="description" content="Texto &amp; mais" \/>/);
  assert.equal((page.match(/<title>/g) || []).length, 1);
});

test('só os serviços de pré-visualização esperam pelos dados', () => {
  assert.ok(PREVIEW_BOTS.test('WhatsApp/2.23.20.0'));
  assert.ok(PREVIEW_BOTS.test('facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'));
  assert.ok(PREVIEW_BOTS.test('TelegramBot (like TwitterBot)'));
  assert.ok(!PREVIEW_BOTS.test('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36'));
});

test('o Início e as Igrejas pedem a imagem do Profeta logo com a página', () => {
  const home = withPreview(html, sectionPreview('/'), { origin: 'https://app.istn.test', pathname: '/' });
  assert.match(home, /<link rel="preload" as="image" href="\/design\/assets\/photos\/profeta-elias-boas-vindas-600\.webp"/);
  assert.match(withPreview(html, sectionPreview('/igrejas'), { origin: 'https://x.test', pathname: '/igrejas' }), /profeta-elias-profecia-560\.webp/);
  assert.ok(!withPreview(html, sectionPreview('/ensinos'), { origin: 'https://x.test', pathname: '/ensinos' }).includes('rel="preload"'));
});
