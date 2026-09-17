// Building HTML from data other people typed.
//
// Everything interpolated into a template goes through escapeHtml, and every
// address goes through safeUrl first: escaping stops a value from breaking out
// of its attribute, but only checking the scheme stops a "javascript:" link
// that sits perfectly well inside one.

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };

export function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ENTITIES[char]);
}

const DEFAULT_SCHEMES = ['https:'];

// The address itself when its scheme is one of `schemes`, an empty string
// otherwise. Relative addresses ("/igrejas") are allowed only when asked for.
export function safeUrl(value, { schemes = DEFAULT_SCHEMES, relative = false } = {}) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (relative && /^\/(?!\/)/.test(text)) return text;
  try {
    const url = new URL(text);
    return schemes.includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

// The attributes of a link that leaves the app, or nothing when the address is
// not safe to follow — a link without href is inert rather than dangerous.
export function externalLinkAttrs(url, options) {
  const safe = safeUrl(url, options);
  return safe ? `href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer"` : '';
}

// wa.me takes the international number as digits only.
export function whatsAppUrl(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.length >= 8 ? `https://wa.me/${digits}` : '';
}
