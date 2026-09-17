// The teaching library: how a recorded message is classified, searched, sorted
// and linked. Pure functions, so the rules can be tested without a browser.
import { bookOf } from './bible.js';
import { collator, matchesQuery } from './text.js';

export const CATEGORIES = ['Todas', 'Cultos', 'Cultos dos servos', 'Lives', 'Especiais'];

export function categoryOf(service = '') {
  const value = String(service || '').trim().toLowerCase();
  if (value.startsWith('live')) return 'Lives';
  if (value.includes('servos')) return 'Cultos dos servos';
  if (value.startsWith('culto')) return 'Cultos';
  return 'Especiais';
}

export const yearOf = (teaching) => (teaching.publishedAt ? String(teaching.publishedAt).slice(0, 4) : '');

export function videoId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith('youtu.be')) return parsed.pathname.slice(1) || null;
    return parsed.searchParams.get('v');
  } catch {
    return null;
  }
}

export function thumbnailUrl(url) {
  const id = videoId(url);
  return id && /^[\w-]{6,20}$/.test(id) ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : '';
}

const seconds = (clock) => {
  const parts = String(clock || '').split(':').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
};

// Several messages share one long recording (a vigil, a festival). When the
// start of the message is known, the link opens the video right there.
export function watchUrl(teaching) {
  const start = seconds(teaching.startsAt);
  if (start === null) return teaching.url;
  try {
    const url = new URL(teaching.url);
    url.searchParams.set('t', `${start}s`);
    return url.href;
  } catch {
    return teaching.url;
  }
}

export function formatDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

export function yearsIn(library) {
  return [...new Set(library.map(yearOf).filter(Boolean))].sort((a, b) => b.localeCompare(a));
}

// Books present in the library, in biblical order, with how many messages each.
export function booksIn(library) {
  const counts = new Map();
  library.forEach((teaching) => {
    const book = bookOf(teaching.biblicalReference);
    if (!book) return;
    const entry = counts.get(book.name) || { ...book, count: 0 };
    entry.count += 1;
    counts.set(book.name, entry);
  });
  return [...counts.values()].sort((a, b) => a.order - b.order);
}

export function countByCategory(library) {
  const counts = Object.fromEntries(CATEGORIES.map((category) => [category, 0]));
  counts.Todas = library.length;
  library.forEach((teaching) => { counts[categoryOf(teaching.service)] += 1; });
  return counts;
}

export function filterTeachings(library, { query = '', category = 'Todas', year = '', book = '', sort = 'recent', savedOnly = false } = {}, saved = new Set()) {
  const matching = library.filter((teaching) => (category === 'Todas' || categoryOf(teaching.service) === category)
    && (!year || yearOf(teaching) === year)
    && (!book || bookOf(teaching.biblicalReference)?.name === book)
    && (!savedOnly || saved.has(teaching.id))
    && matchesQuery([teaching.title, teaching.biblicalReference, teaching.service, teaching.description], query));
  const direction = sort === 'oldest' ? 1 : -1;
  return matching.sort((a, b) => direction * collator.compare(a.publishedAt || '', b.publishedAt || '')
    || collator.compare(a.startsAt || '', b.startsAt || ''));
}
