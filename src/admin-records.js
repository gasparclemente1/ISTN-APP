import { collator, matchesQuery } from './text.js';

// Keep phone matching within each contact: two different numbers must never
// accidentally form a match when their digits are joined.
export function matchesRecord(fields, phones, query = '') {
  if (matchesQuery(fields, query)) return true;
  const digits = query.replace(/\D/g, '');
  return /^[+\d\s().-]+$/.test(query) && digits.length >= 3
    && phones.some((phone) => String(phone || '').replace(/\D/g, '').includes(digits));
}

export function recordPage(rows, page = 1, size = 25) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.max(1, Math.min(Number(page) || 1, pages));
  const start = (current - 1) * size;
  return { rows: rows.slice(start, start + size), page: current, pages,
    total: rows.length, from: rows.length ? start + 1 : 0, to: Math.min(start + size, rows.length) };
}

export function sortRecords(rows, label, descending = false) {
  return [...rows].sort((a, b) => (descending ? -1 : 1) * collator.compare(label(a), label(b)));
}

// PostgREST may cap each response at 1,000 rows. Request explicit pages so
// filtering doesn't silently hide older records or pending requests.
export async function readAllPages(read, path, size = 500) {
  const rows = [];
  for (let offset = 0; ; offset += size) {
    const page = await read(`${path}&limit=${size}&offset=${offset}`);
    rows.push(...(page || []));
    if (!page || page.length < size) return rows;
  }
}
