// The books of the Bible in canonical order, so the teaching library can be
// filtered by book without listing "Gênesis", "Génesis" and "Genesis" as three
// books, or putting Apocalipse before Génesis because A comes before G.
//
// Names follow the European Portuguese used by the ministry in its own
// references ("Actos", "Deuteronómio"). The references on each card are shown
// exactly as they were written; only the filter groups them.
import { foldText } from './text.js';

export const BOOKS = [
  'Génesis', 'Êxodo', 'Levítico', 'Números', 'Deuteronómio', 'Josué', 'Juízes', 'Rute', '1 Samuel', '2 Samuel',
  '1 Reis', '2 Reis', '1 Crónicas', '2 Crónicas', 'Esdras', 'Neemias', 'Ester', 'Job', 'Salmos', 'Provérbios',
  'Eclesiastes', 'Cantares', 'Isaías', 'Jeremias', 'Lamentações', 'Ezequiel', 'Daniel', 'Oseias', 'Joel', 'Amós',
  'Obadias', 'Jonas', 'Miqueias', 'Naum', 'Habacuque', 'Sofonias', 'Ageu', 'Zacarias', 'Malaquias',
  'Mateus', 'Marcos', 'Lucas', 'João', 'Actos', 'Romanos', '1 Coríntios', '2 Coríntios', 'Gálatas', 'Efésios',
  'Filipenses', 'Colossenses', '1 Tessalonicenses', '2 Tessalonicenses', '1 Timóteo', '2 Timóteo', 'Tito', 'Filémon',
  'Hebreus', 'Tiago', '1 Pedro', '2 Pedro', '1 João', '2 João', '3 João', 'Judas', 'Apocalipse'
];

const key = (name) => foldText(name).replace(/[^a-z0-9]/g, '');

// Other ways the same book is written: Brazilian spellings, the newer "Atos",
// and longer titles. Accents and spacing are already ignored by `key`.
const ALIASES = {
  atos: 'Actos', jo: 'Job', filemom: 'Filémon', filemon: 'Filémon', salmo: 'Salmos',
  canticos: 'Cantares', canticodoscanticos: 'Cantares', cantaresdesalomao: 'Cantares',
  lamentacoesdejeremias: 'Lamentações'
};

const INDEX = new Map([
  ...BOOKS.map((name, order) => [key(name), { name, order }]),
  ...Object.entries(ALIASES).map(([alias, name]) => [alias, { name, order: BOOKS.indexOf(name) }])
]);

// "1Timóteo 6:12" → { name: '1 Timóteo', order: 53 }; null when the reference
// does not start with a book this list knows.
export function bookOf(reference) {
  const match = String(reference ?? '').trim().match(/^((?:[1-3]\s*)?[^\d:]+)/);
  if (!match) return null;
  return INDEX.get(key(match[1])) || null;
}
