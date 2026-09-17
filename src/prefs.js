// Preferences kept on this device, for everyone — with or without an account.
//
// Using the app needs no account, so "A minha ISTN" and saved teachings must
// work without one. Storage can be missing or refuse writes (private browsing,
// full disk); the app then simply forgets on reload rather than breaking.

const KEY = 'elias-preferencias-v1';

function read() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { favorites: Array.isArray(stored.favorites) ? stored.favorites.filter((id) => typeof id === 'string') : [], myChurch: typeof stored.myChurch === 'string' ? stored.myChurch : null };
  } catch {
    return { favorites: [], myChurch: null };
  }
}

let current = read();
const listeners = new Set();

function write(next) {
  current = next;
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* sem armazenamento: fica só nesta sessão */ }
  listeners.forEach((listener) => listener(current));
}

export const prefs = {
  get favorites() { return new Set(current.favorites); },
  isFavorite: (id) => current.favorites.includes(id),
  // Returns whether the teaching is saved after the toggle.
  toggleFavorite(id) {
    const saved = current.favorites.includes(id);
    write({ ...current, favorites: saved ? current.favorites.filter((item) => item !== id) : [...current.favorites, id] });
    return !saved;
  },
  addFavorites(ids) {
    const merged = [...new Set([...current.favorites, ...ids])];
    if (merged.length !== current.favorites.length) write({ ...current, favorites: merged });
  },
  get myChurch() { return current.myChurch; },
  setMyChurch(id) { write({ ...current, myChurch: id || null }); },
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
};
