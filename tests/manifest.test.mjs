import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { localizedManifest } from '../lib/manifest.mjs';
import { messages } from '../src/locales/messages.js';

const base = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));

test('o nome da app instalada é o nome da igreja na língua escolhida, e a sigla fica', () => {
  const expected = {
    en: 'ISTN-SJ — Salvation of All Nations Church · Sun of Righteousness',
    fr: 'ISTN-SJ — Église du Salut de Toutes les Nations · Soleil de Justice',
    es: 'ISTN-SJ — Iglesia Salvación de Todas las Naciones · Sol de Justicia'
  };
  for (const [lang, name] of Object.entries(expected)) {
    const manifest = localizedManifest(base, lang);
    assert.equal(manifest.name, name);
    assert.equal(manifest.short_name, 'ISTN-SJ');
    assert.equal(manifest.lang, { en: 'en-GB', fr: 'fr-FR', es: 'es-ES' }[lang]);
    assert.doesNotMatch(manifest.name, /Igreja|Salvação|Justiça/);
  }
});

test('descrição e atalhos também estão traduzidos; o resto do manifest não muda', () => {
  for (const lang of ['en', 'fr', 'es']) {
    const manifest = localizedManifest(base, lang);
    assert.equal(manifest.description, messages[base.description][lang]);
    assert.deepEqual(manifest.shortcuts.map((s) => s.name), base.shortcuts.map((s) => messages[s.name][lang]));
    manifest.shortcuts.forEach((shortcut, index) => assert.notEqual(shortcut.description, base.shortcuts[index].description, `${lang}: ${shortcut.name}`));
    assert.deepEqual(manifest.shortcuts.map((s) => s.url), base.shortcuts.map((s) => s.url));
    assert.deepEqual(manifest.icons, base.icons);
    assert.equal(manifest.start_url, base.start_url);
  }
});

test('português ou uma língua desconhecida devolvem o manifest como está', () => {
  assert.equal(localizedManifest(base, 'pt'), base);
  assert.equal(localizedManifest(base, '../etc'), base);
  assert.equal(localizedManifest(base, undefined), base);
});
