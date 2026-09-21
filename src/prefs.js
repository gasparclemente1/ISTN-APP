// Preferences kept on this device, for everyone — with or without an account.
//
// Using the app needs no account, so "A minha ISTN" and saved teachings must
// work without one. Storage can be missing or refuse writes (private browsing,
// full disk); the app then simply forgets on reload rather than breaking.

const KEY = 'elias-preferencias-v1';

function read() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '{}');
    const ids = (value) => (Array.isArray(value) ? value.filter((id) => typeof id === 'string') : []);
    return {
      favorites: ids(stored.favorites),
      prayers: ids(stored.prayers),
      myChurch: typeof stored.myChurch === 'string' ? stored.myChurch : null
    };
  } catch {
    return { favorites: [], prayers: [], myChurch: null };
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
  // Prayers kept on this phone, to be sent again without paying for the same
  // download twice — and to be sent at all where there is no network.
  get savedPrayers() { return new Set(current.prayers); },
  isSavedPrayer: (id) => current.prayers.includes(id),
  rememberPrayer(id) { if (!current.prayers.includes(id)) write({ ...current, prayers: [...current.prayers, id] }); },
  forgetPrayer(id) { if (current.prayers.includes(id)) write({ ...current, prayers: current.prayers.filter((item) => item !== id) }); },

  get myChurch() { return current.myChurch; },
  setMyChurch(id) { write({ ...current, myChurch: id || null }); },
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
};
