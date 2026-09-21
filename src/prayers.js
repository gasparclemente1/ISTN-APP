// "Orações": the prayers the Prophet recorded for what people are going
// through, catalogued by theme.
//
// These are not here to be browsed. A pastor arrives with a word in his head —
// "coma", "depressão", "finanças" — finds the prayer, and sends it to whoever
// needs it, almost always on WhatsApp. So everything below answers one of two
// questions: does this prayer match what I am looking for, and what exactly
// travels when I send it.
//
// Pure functions, so the rules can be tested without a browser and the same
// ones answer in the app and in the panel.
import { collator, matchesQuery, slugify } from './text.js';

export function normalizeThemes(rows = []) {
  return (rows || [])
    .map((row) => ({ id: row.id, slug: row.slug || '', name: row.name || '' }))
    .filter((theme) => theme.id && theme.name);
}

export function normalizePrayer(row, { themes = [] } = {}) {
  const found = row.theme_id ? (themes || []).find((item) => item.id === row.theme_id) : null;
  return {
    id: row.id,
    title: row.title || 'Oração',
    description: row.description || '',
    themeId: row.theme_id || null,
    theme: found ? normalizeThemes([found])[0] || null : null,
    audioUrl: row.audio_url || '',
    duration: Number(row.duration_seconds) || 0,
    bytes: Number(row.file_bytes) || 0,
    publishedAt: row.published_at || null
  };
}

// Newest first inside a theme: the team adds prayers as it records them, and
// the most recent recording of a theme is the one they mean to send.
export const sortPrayers = (prayers) => [...prayers]
  .sort((a, b) => collator.compare(b.publishedAt || '', a.publishedAt || '') || collator.compare(a.title, b.title));

// What someone types is matched against the title, what it says it is for, and
// the theme's own name — so "cancer" finds what is filed under "Câncer & Coma"
// even when the prayer's own title never says the word.
export function filterPrayers(prayers, { query = '', theme = '' } = {}) {
  return sortPrayers((prayers || []).filter((prayer) => (!theme || prayer.themeId === theme)
    && matchesQuery([prayer.title, prayer.description, prayer.theme?.name], query)));
}

// Browsing with nothing asked for: every theme in the order the team gave,
// each with its prayers. A theme with nothing recorded yet is left out rather
// than shown empty.
export function prayersByTheme(prayers, themes) {
  return (themes || [])
    .map((theme) => ({ theme, prayers: sortPrayers((prayers || []).filter((prayer) => prayer.themeId === theme.id)) }))
    .filter((group) => group.prayers.length);
}

// How long it takes, said as a person would say it. The exact seconds matter
// to nobody; whether it is two minutes or twenty matters to everybody.
export function formatDuration(seconds) {
  const total = Math.round(Number(seconds) || 0);
  if (total <= 0) return '';
  if (total < 60) return 'menos de 1 min';
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${String(rest).padStart(2, '0')} min` : `${hours} h`;
}

// What the person who receives it sees in WhatsApp. A file called "a7f3c2.mp3"
// says nothing; this says what the prayer is, and whose it is, in the one place
// that travels with the audio wherever it is forwarded.
const EXTENSIONS = { 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/wav': 'wav' };

export function prayerFileName(prayer, type = '') {
  const fromUrl = String(prayer.audioUrl || '').split('?')[0].match(/\.(mp3|m4a|aac|ogg|wav)$/i);
  const extension = EXTENSIONS[type] || (fromUrl ? fromUrl[1].toLowerCase() : 'mp3');
  const parts = ['Oracao', prayer.theme?.name, prayer.title, 'Profeta-Elias-ISTN-SJ']
    .filter(Boolean).map((part) => slugify(part)).filter(Boolean);
  return `${parts.join('-')}.${extension}`;
}

// The line that goes with the audio. An audio arriving alone at someone who is
// ill is unsettling: this says what it is, whose it is, and leaves an address
// where the family can see where it came from.
export function prayerShareText(prayer, url = '') {
  const lines = [prayer.title];
  if (prayer.theme?.name) lines.push(prayer.theme.name);
  lines.push('Oração do Profeta Elias · ISTN-SJ');
  if (url) lines.push(url);
  return lines.join('\n');
}

// The same three the database allows (can_manage_prayers): the central team,
// the Apóstolo, and whoever the team authorised to publish for the whole ISTN.
export const canManagePrayers = (profile, admin = null) => admin?.role === 'central'
  || (Boolean(profile) && (profile.publish_scope === 'global'
    || (profile.servo_claim_status === 'aprovado' && profile.servo?.role === 'apostolo')));
