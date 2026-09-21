// Keeping a prayer on the phone, and getting it into WhatsApp.
//
// The pastor sends the same prayer many times. A prayer he has kept costs
// nothing to send again, and can be sent where there is no network at all —
// which is most of why this exists.
//
// It is kept in the Cache API rather than left to the service worker. The
// worker would have to answer the browser's range requests for <audio>, and
// answering those from a cache is where offline audio usually breaks. Here the
// file is read in full, as a blob, and handed to the player and to WhatsApp
// already in hand.
import { prayerFileName, prayerShareText } from './prayers.js';
import { prefs } from './prefs.js';

const CACHE = 'elias-oracoes-v1';

const store = () => (typeof caches === 'undefined' ? Promise.reject(new Error('sem armazenamento')) : caches.open(CACHE));

async function fromCache(url) {
  try {
    return (await (await store()).match(url)) || null;
  } catch {
    return null;
  }
}

export async function keepPrayer(prayer) {
  const cache = await store();
  const response = await fetch(prayer.audioUrl);
  if (!response.ok) throw new Error('Não foi possível guardar o áudio.');
  await cache.put(prayer.audioUrl, response);
  prefs.rememberPrayer(prayer.id);
}

export async function dropPrayer(prayer) {
  try { await (await store()).delete(prayer.audioUrl); } catch { /* já não estava lá */ }
  prefs.forgetPrayer(prayer.id);
}

// The file itself. Free when the prayer is already kept; one download
// otherwise — the same one the pastor pays today, when he saves it by hand to
// send it. And what was downloaded stays: he is going to send this prayer
// again, and nobody should have to remember to press "guardar" for that.
export async function prayerBlob(prayer) {
  const kept = await fromCache(prayer.audioUrl);
  if (kept) return kept.blob();
  const response = await fetch(prayer.audioUrl);
  if (!response.ok) throw new Error('Não foi possível obter o áudio.');
  try {
    await (await store()).put(prayer.audioUrl, response.clone());
    prefs.rememberPrayer(prayer.id);
  } catch { /* sem espaço ou sem armazenamento: envia-se na mesma */ }
  return response.blob();
}

// What the player plays: a blob when it is kept, so it works with no network
// at all; the address otherwise, so nothing is downloaded whole before the
// first second is heard.
export async function prayerSource(prayer) {
  const kept = await fromCache(prayer.audioUrl);
  return kept ? URL.createObjectURL(await kept.blob()) : prayer.audioUrl;
}

// Straight into WhatsApp, as a file, which is what the person at the other end
// needs: they open it there and listen, with no app and no account.
//
// Where the phone cannot hand over a file — an older browser, a desktop — the
// link goes instead: it opens the prayer's own page, which plays and offers
// the file. Never a silent failure, and never nothing.
export async function sharePrayer(prayer, url) {
  const text = prayerShareText(prayer, url);
  try {
    const blob = await prayerBlob(prayer);
    const type = blob.type || 'audio/mpeg';
    const file = new File([blob], prayerFileName(prayer, type), { type });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text });
      return 'ficheiro';
    }
  } catch (error) {
    if (error?.name === 'AbortError') return 'cancelado';
  }
  if (navigator.share) {
    try {
      await navigator.share({ title: prayer.title, text, url });
      return 'link';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelado';
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  return 'link';
}

// Downloading needs the file in hand too: a "download" attribute pointing at
// another address is ignored by the browser, and the prayer would be saved
// under a name that says nothing.
export async function downloadPrayer(prayer) {
  const blob = await prayerBlob(prayer);
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = prayerFileName(prayer, blob.type);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60000);
}
