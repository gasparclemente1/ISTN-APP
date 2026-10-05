import assert from 'node:assert/strict';
import { translationHtml, translatedText } from '../lib/translation-text.mjs';
import { createTranslationCache } from '../lib/translation-cache.mjs';

test('nomes do ministério e links são protegidos sem renomear outros membros', () => {
  const source = 'Profeta Elias · Elias Santos\nISTN-SJ · Igreja Salvação de Todas as Nações - Sol da Justiça\nhttps://example.test/?a=1&b=2';
  for (const [lang, name, sun] of [['en', 'Prophet Elijah', 'Sun of Righteousness'], ['fr', 'Prophète Élie', 'Soleil de Justice'], ['es', 'Profeta Elías', 'Sol de Justicia'], ['pt', 'Profeta Elias', 'Sol da Justiça']]) {
    const html = translationHtml(source, lang);
    assert.ok(html.includes(`<span class="notranslate">${name}</span>`));
    assert.ok(html.includes(sun));
    assert.match(html, /Elias Santos/);
    assert.match(html, /https:\/\/example.test\/\?a=1&amp;b=2/);
    assert.ok(translatedText(html).includes('\nhttps://example.test/?a=1&b=2'));
  }
});

test('markup original é texto e entidades são descodificadas só uma vez', () => {
  const text = '<script>alert("x")</script> &lt;b&gt;\n🙏 Élie';
  const html = translationHtml(text, 'en');
  assert.doesNotMatch(html, /<script>/);
  assert.equal(translatedText(html), text);
  assert.equal(translatedText('<div>&#x1F64F; &#233; &nbsp;</div>'), '🙏 é \u00a0');
  assert.throws(() => translatedText('<script>bad</script>'));
});

test('cache expira e respeita a capacidade sem guardar respostas inválidas', async () => {
  let clock = 0;
  const cache = createTranslationCache({ now: () => clock, ttl: 100, capacity: 1 });
  const value = { title: '', body: 'test', sourceLanguage: 'pt', targetLanguage: 'en' };
  await cache.set('one', value);
  await cache.set('bad', { title: 42 });
  assert.deepEqual(await cache.get('one'), value);
  await cache.set('two', value);
  assert.equal(await cache.get('one'), null);
  clock = 101;
  assert.equal(await cache.get('two'), null);
});

test('cache corrompida ou disco indisponível não impede novas traduções', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const folder = await mkdtemp(join(tmpdir(), 'istn-cache-failure-'));
  const key = 'a'.repeat(64);
  const value = { title: '', body: 'text', sourceLanguage: 'en', targetLanguage: 'pt' };
  try {
    const file = join(folder, 'broken.json');
    await writeFile(file, '{broken');
    const cache = createTranslationCache({ file });
    assert.equal(await cache.get(key), null);
    await cache.set(key, value);
    assert.deepEqual(await createTranslationCache({ file }).get(key), value);
    const unavailable = createTranslationCache({ file: join(file, 'not-a-directory.json') });
    await unavailable.set(key, value);
    assert.deepEqual(await unavailable.get(key), value);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
