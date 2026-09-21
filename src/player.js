// The player for a prayer, and the one part of the app that is drawn outside
// #app.
//
// Every page is redrawn by replacing the whole of #app (src/dom.js). An
// <audio> element in there is destroyed and recreated on each redraw — and the
// app redraws often: on navigation, when data arrives, on every reaction, and
// every twenty seconds for the live countdown. A prayer would stop by itself
// mid-sentence. So the player lives next to the announcer and the toast, in
// the body, and only tells the pages what it is doing.
//
// It also gives the phone's own lock screen the title and the controls, which
// is where a prayer is actually listened to: screen off, phone down.
import { formatDuration, prayerShareText } from './prayers.js';
import { prayerSource } from './prayer-audio.js';

let audio = null;
let bar = null;
let parts = null;
let current = null;
let objectUrl = '';
const listeners = new Set();
let onFailure = () => {};

// The app says how a failure is shown, so this module needs to know nothing
// about toasts.
export function whenPlaybackFails(handler) { onFailure = handler; }

export const playing = () => (current && !audio?.paused ? current.id : '');
export const loaded = () => current?.id || '';
export function onPlayerChange(listener) { listeners.add(listener); return () => listeners.delete(listener); }
const announceChange = () => listeners.forEach((listener) => listener(playing()));

const clock = (seconds) => {
  const total = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

function build() {
  if (bar) return;
  audio = new Audio();
  audio.preload = 'metadata';

  bar = document.createElement('div');
  bar.className = 'prayer-bar';
  bar.hidden = true;
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Oração a tocar');
  bar.innerHTML = `
    <button class="prayer-bar-play" type="button" aria-label="Tocar"><span aria-hidden="true">▶</span></button>
    <div class="prayer-bar-body">
      <strong></strong>
      <small></small>
      <input class="prayer-bar-seek" type="range" min="0" max="1000" value="0" step="1" aria-label="Posição da oração" />
    </div>
    <span class="prayer-bar-time"><b>0:00</b></span>
    <button class="prayer-bar-back" type="button" aria-label="Recuar 15 segundos">15s</button>
    <button class="prayer-bar-close" type="button" aria-label="Fechar o leitor">✕</button>`;
  document.body.append(bar);

  parts = {
    play: bar.querySelector('.prayer-bar-play'),
    title: bar.querySelector('strong'),
    theme: bar.querySelector('small'),
    seek: bar.querySelector('.prayer-bar-seek'),
    time: bar.querySelector('.prayer-bar-time b')
  };

  parts.play.addEventListener('click', toggle);
  bar.querySelector('.prayer-bar-back').addEventListener('click', () => { audio.currentTime = Math.max(0, audio.currentTime - 15); });
  bar.querySelector('.prayer-bar-close').addEventListener('click', stopPrayer);

  let dragging = false;
  parts.seek.addEventListener('input', () => { dragging = true; });
  parts.seek.addEventListener('change', () => {
    dragging = false;
    if (audio.duration) audio.currentTime = (Number(parts.seek.value) / 1000) * audio.duration;
  });

  audio.addEventListener('timeupdate', () => {
    parts.time.textContent = clock(audio.currentTime);
    if (!dragging && audio.duration) parts.seek.value = String(Math.round((audio.currentTime / audio.duration) * 1000));
  });
  audio.addEventListener('play', () => { paint(); announceChange(); });
  audio.addEventListener('pause', () => { paint(); announceChange(); });
  audio.addEventListener('ended', () => { parts.seek.value = '0'; paint(); announceChange(); });
  // A recording that will not play must say so. Left alone the bar goes on
  // claiming to be playing, and whoever is waiting for a prayer hears silence
  // and believes it is the network.
  audio.addEventListener('error', () => {
    const name = current?.title || 'A oração';
    stopPrayer();
    onFailure(`${name} não pôde ser tocada. Tente de novo, ou transfira o áudio.`);
  });
}

function paint() {
  if (!current) return;
  const running = !audio.paused && !audio.ended;
  parts.play.setAttribute('aria-label', running ? 'Pausa' : 'Tocar');
  parts.play.firstElementChild.textContent = running ? '❚❚' : '▶';
  bar.classList.toggle('is-playing', running);
}

// What the lock screen shows while the phone is in a pocket and the prayer is
// being listened to.
function tellThePhone(prayer) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: prayer.title,
      artist: 'Profeta Elias · ISTN-SJ',
      album: prayer.theme?.name || 'Orações',
      artwork: [
        { src: '/design/assets/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/design/assets/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
      ]
    });
    navigator.mediaSession.setActionHandler('play', () => audio.play());
    navigator.mediaSession.setActionHandler('pause', () => audio.pause());
    navigator.mediaSession.setActionHandler('seekbackward', () => { audio.currentTime = Math.max(0, audio.currentTime - 15); });
    navigator.mediaSession.setActionHandler('seekforward', () => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 15); });
  } catch { /* o telefone não quer: a aplicação toca na mesma */ }
}

export async function playPrayer(prayer) {
  build();
  if (current?.id === prayer.id) { toggle(); return; }
  if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = ''; }
  current = prayer;
  bar.hidden = false;
  parts.title.textContent = prayer.title;
  parts.theme.textContent = [prayer.theme?.name, formatDuration(prayer.duration)].filter(Boolean).join(' · ');
  parts.seek.value = '0';
  parts.time.textContent = '0:00';
  const source = await prayerSource(prayer);
  if (source.startsWith('blob:')) objectUrl = source;
  audio.src = source;
  tellThePhone(prayer);
  try {
    await audio.play();
  } catch (error) {
    // A browser that refuses to start without a tap is not a failure: the bar
    // is there, showing the prayer, waiting to be pressed.
    paint();
    if (error?.name !== 'NotAllowedError') onFailure('Não foi possível tocar esta oração.');
  }
  announceChange();
}

export function toggle() {
  if (!audio || !current) return;
  if (audio.paused) audio.play().catch(() => {});
  else audio.pause();
}

export function stopPrayer() {
  if (!audio) return;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = ''; }
  current = null;
  bar.hidden = true;
  announceChange();
}

// Kept beside the player: a prayer shared while it is playing should say the
// same thing as one shared from the list.
export const sharingText = prayerShareText;
