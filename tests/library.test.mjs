import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BOOKS, bookOf } from '../src/bible.js';
import { CATEGORIES, booksIn, categoryOf, countByCategory, filterTeachings, thumbnailUrl, watchUrl } from '../src/library.js';
import { rankPrefixOf } from '../src/roles.js';

const library = JSON.parse(readFileSync(new URL('../data/youtube-teachings.json', import.meta.url)));

test('livros reconhecidos com grafias do Brasil, gralhas e abreviaturas', () => {
  assert.equal(BOOKS.length, 66);
  assert.equal(bookOf('Gênesis 1:1').name, 'Génesis');
  assert.equal(bookOf('Exôdo 3:14').name, 'Êxodo');
  assert.equal(bookOf('Galátas 5:1').name, 'Gálatas');
  assert.equal(bookOf('1Timóteo 6:12').name, '1 Timóteo');
  assert.equal(bookOf('2 Crônicas 7:14').name, '2 Crónicas');
  assert.equal(bookOf('Atos 2:1').name, 'Actos');
  assert.equal(bookOf('1 João 4:8').name, '1 João');
  assert.equal(bookOf('João 3:16').name, 'João');
  assert.equal(bookOf('sem referência'), null);
  assert.equal(bookOf(null), null);
});

test('o filtro de livros do acervo não repete livros e segue a ordem bíblica', () => {
  const books = booksIn(library);
  const names = books.map((book) => book.name);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(books.map((book) => book.order), [...books.map((book) => book.order)].sort((a, b) => a - b));
  assert.ok(!names.some((name) => /Gênesis|Crônicas|Galátas|1Timóteo|Exôdo/.test(name)));
  // Every reference in the library maps to a known book.
  const unknown = library.filter((teaching) => teaching.biblicalReference && !bookOf(teaching.biblicalReference));
  assert.deepEqual(unknown.map((teaching) => teaching.biblicalReference), []);
});

test('categorias e contagens', () => {
  assert.equal(categoryOf('Culto dos servos de sábado'), 'Cultos dos servos');
  assert.equal(categoryOf('Live de quarta'), 'Lives');
  assert.equal(categoryOf('Casamento'), 'Especiais');
  const counts = countByCategory(library);
  assert.equal(counts.Todas, library.length);
  assert.equal(counts.Cultos + counts['Cultos dos servos'] + counts.Lives + counts.Especiais, library.length);
});

test('pesquisa sem acentos, por livro, ano, guardadas e ordem', () => {
  assert.ok(filterTeachings(library, { query: 'isaias' }).length > 0);
  assert.equal(filterTeachings(library, { query: 'isaias' }).length, filterTeachings(library, { query: 'Isaías' }).length);
  assert.ok(filterTeachings(library, { book: 'Génesis' }).every((teaching) => bookOf(teaching.biblicalReference).name === 'Génesis'));
  const recent = filterTeachings(library, { year: '2024' });
  assert.ok(recent.length && recent.every((teaching) => teaching.publishedAt.startsWith('2024')));
  assert.ok(recent[0].publishedAt >= recent[recent.length - 1].publishedAt);
  const oldest = filterTeachings(library, { year: '2024', sort: 'oldest' });
  assert.ok(oldest[0].publishedAt <= oldest[oldest.length - 1].publishedAt);
  assert.deepEqual(filterTeachings(library, { savedOnly: true }, new Set(['youtube-417'])).map((teaching) => teaching.id), ['youtube-417']);
});

test('o link abre o vídeo no início da mensagem, quando se sabe', () => {
  const segment = { url: 'https://www.youtube.com/watch?v=1qPkSqxDlqE&ab_channel=x', startsAt: '02:17:58' };
  assert.equal(new URL(watchUrl(segment)).searchParams.get('t'), '8278s');
  assert.equal(watchUrl({ url: 'https://youtu.be/abc', startsAt: null }), 'https://youtu.be/abc');
  assert.equal(thumbnailUrl('https://www.youtube.com/watch?v=SBntJhzgKDM'), 'https://i.ytimg.com/vi/SBntJhzgKDM/mqdefault.jpg');
  assert.equal(thumbnailUrl('https://www.youtube.com/watch?v="><script>'), '');
});

test('as listas dos filtros estão por ordem alfabética, menos os livros', () => {
  const [todas, ...rest] = CATEGORIES;
  assert.equal(todas, 'Todas');
  assert.deepEqual(rest, [...rest].sort((a, b) => a.localeCompare(b, 'pt')));
  // Os livros seguem a ordem da Bíblia, não a alfabética.
  const books = booksIn(library).map((book) => book.name);
  assert.notDeepEqual(books, [...books].sort((a, b) => a.localeCompare(b, 'pt')));
});

test('um nome não pode começar pela abreviatura da função', () => {
  for (const name of ['Bp. Rufino Boaz', 'bispo Rufino Boaz', 'Pr Jaime José', 'PASTOR Israel Santos', 'Dona Sónia Bento', 'Ap. Marcelino', 'Obr. Mário']) {
    assert.ok(rankPrefixOf(name), name);
  }
  for (const name of ['Rufino Boaz', 'Prisca Manuel', 'Ana Paula', 'Bispos Reunidos']) {
    assert.equal(rankPrefixOf(name), null, name);
  }
  assert.equal(rankPrefixOf(''), null);
  assert.equal(rankPrefixOf(null), null);
});
