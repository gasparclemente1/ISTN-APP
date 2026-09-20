// Searching text the way people type it on a phone: without accents, in any
// case, and in any order. "isaias" finds "Isaías"; "luanda kifica" finds the
// record whose locality is Kifica and whose region is Luanda.

export function foldText(value = '') {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// True when every word of the query appears somewhere in the given fields.
export function matchesQuery(fields, query) {
  const words = foldText(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const haystack = foldText(fields.filter(Boolean).join(' '));
  return words.every((word) => haystack.includes(word));
}

export const collator = new Intl.Collator('pt', { sensitivity: 'base', numeric: true });

// "São Tomé e Príncipe" -> "sao-tome-e-principe". The identifier a church is
// given in the panel becomes its address in the app (/igrejas/…), so it must
// carry no accents, spaces or capitals.
export const slugify = (value) => foldText(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
