// Installing the service worker, and saying when a new version has arrived.
//
// Every deploy produces a new service worker (the server stamps it with a hash
// of the app's files), which fetches the whole new version before taking over.
// The page already open keeps running the version it started with; rather than
// switching code underneath it, the reader is offered a reload.

export function registerServiceWorker({ onUpdate }) {
  if (!('serviceWorker' in navigator)) return;
  // On the very first visit there is no previous version to replace, so
  // taking control is not an update worth announcing.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    onUpdate(() => { reloading = true; window.location.reload(); });
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* sem modo offline, a app funciona na mesma */ });
  });
}
