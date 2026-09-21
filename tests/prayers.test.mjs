import assert from 'node:assert/strict';
import { canManagePrayers, filterPrayers, formatDuration, normalizePrayer, normalizeThemes, prayerFileName, prayerShareText, prayersByTheme, sortPrayers } from '../src/prayers.js';

const themes = normalizeThemes([
  { id: 't1', slug: 'financas-portas-abertas', name: 'Finanças e portas abertas' },
  { id: 't2', slug: 'libertacao-geral', name: 'Libertação Geral' },
  { id: 't3', slug: 'cancer-coma', name: 'Câncer & Coma' },
  { id: 't4', slug: 'doencas', name: 'Doenças' },
  { id: 't5', slug: 'oracao-geral', name: 'Oração geral' },
  { id: 't6', slug: 'outros', name: 'Outros' },
  { id: 'sem-nome', slug: 'x' }
]);

const row = (id, title, theme, extra = {}) => normalizePrayer({
  id, title, theme_id: theme, audio_url: `https://arquivo.istn/${id}.mp3`,
  duration_seconds: 500, published_at: '2026-09-20T10:00:00Z', ...extra
}, { themes });

test('os seis temas da equipa, pelas palavras e pela ordem dela', () => {
  assert.deepEqual(themes.map((theme) => theme.name), [
    'Finanças e portas abertas', 'Libertação Geral', 'Câncer & Coma', 'Doenças', 'Oração geral', 'Outros'
  ]);
  // Um tema sem nome não é tema nenhum.
  assert.equal(themes.length, 6);
});

test('uma oração junta o tema, o ficheiro e a duração', () => {
  const prayer = row('p1', 'Oração pelos enfermos', 't4', { description: 'Para quem está internado.', file_bytes: 2400000 });
  assert.equal(prayer.theme.name, 'Doenças');
  assert.equal(prayer.audioUrl, 'https://arquivo.istn/p1.mp3');
  assert.equal(prayer.duration, 500);
  assert.equal(prayer.bytes, 2400000);
  // Um tema apagado não apaga a oração: ela continua a ouvir-se e a enviar-se.
  assert.equal(normalizePrayer({ id: 'p9', title: 'x', theme_id: 'ido', audio_url: 'https://a/b.mp3' }, { themes }).theme, null);
  assert.equal(normalizePrayer({ id: 'p8', audio_url: 'https://a/b.mp3' }, { themes }).title, 'Oração');
});

test('procurar pelo que a pessoa está a viver, não pelo título', () => {
  const prayers = [
    row('p1', 'Oração pelos enfermos', 't4', { description: 'Para quem está internado.' }),
    row('p2', 'Quebra de maldições', 't2'),
    row('p3', 'Oração pela família', 't3', { description: 'Para quem acompanha um doente.' })
  ];
  // "cancer" encontra o que está arquivado em «Câncer & Coma», mesmo sem a palavra no título.
  assert.deepEqual(filterPrayers(prayers, { query: 'cancer' }).map((p) => p.id), ['p3']);
  // Sem acentos e em qualquer ordem, como se escreve num telemóvel.
  assert.deepEqual(filterPrayers(prayers, { query: 'libertacao' }).map((p) => p.id), ['p2']);
  assert.deepEqual(filterPrayers(prayers, { query: 'internado enfermos' }).map((p) => p.id), ['p1']);
  assert.deepEqual(filterPrayers(prayers, { theme: 't4' }).map((p) => p.id), ['p1']);
  assert.deepEqual(filterPrayers(prayers, {}).map((p) => p.id).sort(), ['p1', 'p2', 'p3']);
  assert.deepEqual(filterPrayers(prayers, { query: 'nada disto' }), []);
});

test('a mais recente de cada tema à frente', () => {
  const prayers = [
    row('a', 'Uma', 't4', { published_at: '2026-09-10T10:00:00Z' }),
    row('b', 'Outra', 't4', { published_at: '2026-09-20T10:00:00Z' }),
    row('c', 'Terceira', 't2', { published_at: '2026-09-15T10:00:00Z' })
  ];
  assert.deepEqual(sortPrayers(prayers).map((p) => p.id), ['b', 'c', 'a']);
  const grupos = prayersByTheme(prayers, themes);
  // Só os temas que têm gravações, pela ordem que a equipa deu.
  assert.deepEqual(grupos.map((g) => g.theme.name), ['Libertação Geral', 'Doenças']);
  assert.deepEqual(grupos[1].prayers.map((p) => p.id), ['b', 'a']);
});

test('a duração diz-se como as pessoas a dizem', () => {
  assert.equal(formatDuration(0), '');
  assert.equal(formatDuration(null), '');
  assert.equal(formatDuration(42), 'menos de 1 min');
  assert.equal(formatDuration(500), '8 min');
  assert.equal(formatDuration(3600), '1 h');
  assert.equal(formatDuration(3900), '1 h 05 min');
});

test('o ficheiro chega com um nome que diz o que é e de quem é', () => {
  const prayer = row('p1', 'Oração pelos enfermos', 't3');
  assert.equal(prayerFileName(prayer), 'oracao-cancer-coma-oracao-pelos-enfermos-profeta-elias-istn-sj.mp3');
  // A extensão segue o que o ficheiro é, não o que o endereço parece.
  assert.equal(prayerFileName(prayer, 'audio/mp4'), 'oracao-cancer-coma-oracao-pelos-enfermos-profeta-elias-istn-sj.m4a');
  assert.match(prayerFileName(normalizePrayer({ id: 'x', title: 'Sem tema', audio_url: 'https://a/b.ogg' }, { themes })), /\.ogg$/);
});

test('o áudio nunca vai sozinho: leva o que é, de quem é, e onde vê-lo', () => {
  const texto = prayerShareText(row('p1', 'Oração pelos enfermos', 't4'), 'https://istn.ao/oracoes/p1');
  assert.deepEqual(texto.split('\n'), [
    'Oração pelos enfermos',
    'Doenças',
    'Oração do Profeta Elias · ISTN-SJ',
    'https://istn.ao/oracoes/p1'
  ]);
  assert.equal(prayerShareText({ title: 'Só isto' }), 'Só isto\nOração do Profeta Elias · ISTN-SJ');
});

test('acrescentar orações é de quem fala por toda a ISTN', () => {
  assert.equal(canManagePrayers(null), false);
  assert.equal(canManagePrayers({ publish_scope: 'nenhum' }), false);
  assert.equal(canManagePrayers({ publish_scope: 'igreja' }), false);
  assert.equal(canManagePrayers({ publish_scope: 'global' }), true);
  assert.equal(canManagePrayers({ servo_claim_status: 'aprovado', servo: { role: 'apostolo' } }), true);
  // Um pedido por aprovar não dá o direito.
  assert.equal(canManagePrayers({ servo_claim_status: 'pendente', servo: { role: 'apostolo' } }), false);
  // E a equipa central, que não tem publish_scope nenhum, pode na mesma.
  assert.equal(canManagePrayers(null, { role: 'central' }), true);
  assert.equal(canManagePrayers(null, { role: 'local', church_id: 'c1' }), false);
});
