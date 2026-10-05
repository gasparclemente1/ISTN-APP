import { escapeHtml } from '../src/html.js';

const prophet = { pt: 'Profeta Elias', en: 'Prophet Elijah', fr: 'Prophète Élie', es: 'Profeta Elías' };
const church = {
  pt: 'Igreja Salvação de Todas as Nações · Sol da Justiça',
  en: 'Salvation of All Nations Church · Sun of Righteousness',
  fr: 'Église du Salut de Toutes les Nations · Soleil de Justice',
  es: 'Iglesia Salvación de Todas las Naciones · Sol de Justicia'
};
const terms = /https?:\/\/[^\s<>]+|\bISTN-SJ\b|(?:Profeta|Prophet|Prophète)\s+(?:Elias|Elijah|Élie|Elías)(?!\p{L})|(?:Igreja Salvação de Todas as Nações|Salvation of All Nations Church|Église du Salut de Toutes les Nations|Iglesia Salvación de Todas las Naciones)\s*[-–—·]\s*(?:Sol da Justiça|Sun of Righteousness|Soleil de Justice|Sol de Justicia)/giu;

// HTML exists only on the server-to-Translator leg. All source text is escaped;
// known ministry names and URLs are protected using Microsoft's notranslate.
export function translationHtml(source, target) {
  let cursor = 0;
  let html = '';
  for (const match of source.matchAll(terms)) {
    html += escapeHtml(source.slice(cursor, match.index));
    const word = match[0];
    const replacement = /^(Profeta|Prophet|Prophète)\s/iu.test(word) ? prophet[target]
      : /^(Igreja|Salvation|Église|Iglesia) /iu.test(word) ? church[target] : word;
    html += `<span class="notranslate">${escapeHtml(replacement)}</span>`;
    cursor = match.index + word.length;
  }
  html += escapeHtml(source.slice(cursor));
  return `<div>${html.replace(/\r\n?|\n/g, '<br>')}</div>`;
}

// Convert the small HTML vocabulary we send to plain text. Never return HTML
// for the browser to execute. Decode entities once, AFTER removing actual tags.
export function translatedText(html) {
  const text = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?(?:div|span)\b[^>]*>/gi, '');
  if (/<\/?[a-z!]/i.test(text)) throw new Error('unexpected_translation_markup');
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, entity) => {
    if (!entity.startsWith('#')) return entities[entity.toLowerCase()];
    const point = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : whole;
  });
}
