import { messages } from './locales/messages.js';
import { escapeHtml } from './html.js';

export const LANGUAGES = Object.freeze([['pt', 'Português'], ['en', 'English'], ['fr', 'Français'], ['es', 'Español']]);
const KEY = 'istn-language-v1';
const locales = { pt: 'pt-PT', en: 'en-GB', fr: 'fr-FR', es: 'es-ES' };
export const isLanguage = (value) => Object.hasOwn(locales, value);
// BCP-47 regional variants (fr-CA, es-MX, pt-BR) share the UI catalogue.
export function detectLanguage(languages = []) {
  for (const tag of languages) {
    const base = String(tag).trim().toLowerCase().split(/[-_]/)[0];
    if (isLanguage(base)) return base;
  }
  return 'pt';
}
const browserLanguage = () => globalThis.document
  ? detectLanguage(globalThis.navigator?.languages?.length ? navigator.languages : [globalThis.navigator?.language])
  : 'pt';
let profileLanguage = null;
let selected = browserLanguage();
let explicit = false;
try {
  const saved = globalThis.localStorage?.getItem(KEY);
  if (isLanguage(saved)) { selected = saved; explicit = true; }
} catch { /* Storage is optional, including private browsing. */ }
const listeners = new Set();
export function useProfileLanguage(value) {
  profileLanguage = isLanguage(value) ? value : null;
  if (!explicit) setLanguage(profileLanguage || browserLanguage(), { remember: false });
}
// Follow a device language change only while no explicit/profile choice applies.
globalThis.window?.addEventListener('languagechange', () => {
  if (!explicit && !profileLanguage) setLanguage(browserLanguage(), { remember: false });
});
export const language = () => selected;
export const locale = () => locales[selected];
export const hasLanguagePreference = () => explicit;
export function setLanguage(next, { remember = true } = {}) {
  if (!isLanguage(next)) return false;
  if (remember) {
    explicit = true;
    try { globalThis.localStorage?.setItem(KEY, next); } catch { /* Keep session preference. */ }
  }
  const changed = next !== selected;
  selected = next;
  if (globalThis.document) document.documentElement.lang = locale();
  if (changed) listeners.forEach((listener) => listener(next));
  return changed;
}
export function onLanguageChange(listener) { listeners.add(listener); return () => listeners.delete(listener); }
function interpolate(text, values) {
  // One pass: placeholder-shaped user content is never interpreted again.
  return String(text ?? '').replace(/\{(\d+)\}/g, (token, key) => Object.hasOwn(values, key) ? String(values[key] ?? '') : token);
}
export function t(source, values = {}) {
  return interpolate(messages[source]?.[selected] ?? source, values);
}
// For existing HTML templates: translate/escape only authored UI text. Values
// retain the original template's escaping; this never translates user content.
export function th(source, values = {}) {
  return interpolate(escapeHtml(messages[source]?.[selected] ?? source), values);
}
export function languageSelector(id = 'app-language') {
  return `<label class="language-picker" for="${id}"><span class="sr-only">${th('Idioma')}</span><select id="${id}" data-language aria-label="${th('Idioma')}">${LANGUAGES.map(([code, name]) => `<option value="${code}"${selected === code ? ' selected' : ''}>${name}</option>`).join('')}</select></label>`;
}
setLanguage(selected, { remember: false });

// Only use on ministry content (sermons, prayers and meeting descriptions),
// never on members' names, URLs, IDs or editable source values.
export function ministryText(value) {
  const text = String(value ?? '');
  if (language() === 'pt') return text;
  return text
    .replace(/Igreja Salvação de Todas as Nações\s*[-–—·]\s*Sol da Justiça/gi, t('Igreja Salvação de Todas as Nações · Sol da Justiça'))
    .replace(/\bProfeta\s+Elias\b/gi, t('Profeta Elias'))
    .replace(/\bElias\b/g, t('Elias'));
}
