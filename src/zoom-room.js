import { safeUrl } from './html.js';

const meeting = new URLSearchParams(location.search).get('meeting');
const lobby = document.querySelector('#live-lobby');
const form = document.querySelector('#join-form');
const status = document.querySelector('#room-status');
const button = form.querySelector('button');
const endpoint = (action) => `/api/zoom/${action}?meeting=${encodeURIComponent(meeting || '')}`;
let sdkPromise;
let sdkLoaded = false;

async function request(action, method = 'GET') {
  const response = await fetch(endpoint(action), { method, cache: 'no-store', signal: AbortSignal.timeout(20000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível abrir a reunião.');
  return result;
}

function loadAsset(url) {
  return new Promise((resolve, reject) => {
    const element = document.createElement('script');
    const timeout = setTimeout(() => { element.remove(); reject(new Error('O Zoom demorou a responder. Recarregue a página ou abra no Zoom.')); }, 30000);
    element.onload = () => { clearTimeout(timeout); resolve(); };
    element.onerror = () => { clearTimeout(timeout); element.remove(); reject(new Error('Não foi possível carregar o Zoom. Recarregue a página ou abra no Zoom.')); };
    element.src = url;
    document.head.append(element);
  });
}

async function loadSdk(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('A sala precisa de ser atualizada.');
  const base = `https://source.zoom.us/${version}`;
  // SDK 6 loads its own styles from lib/ui during initialization.
  for (const vendor of ['react', 'react-dom', 'redux', 'redux-thunk', 'react-redux', 'lodash']) {
    await loadAsset(`${base}/lib/vendor/${vendor}.min.js`);
  }
  await loadAsset(`https://source.zoom.us/zoom-meeting-${version}.min.js`);
  const sdk = window.ZoomMtg;
  sdk.setZoomJSLib(`${base}/lib`, '/av');
  sdk.preLoadWasm();
  await sdk.prepareWebSDK();
  await sdk.i18n.load('pt-PT');
  sdk.i18n.reload('pt-PT');
  return sdk;
}

function showError(message) {
  document.body.classList.remove('room-joining');
  lobby.hidden = false;
  status.textContent = message;
  button.disabled = false;
  button.textContent = 'Tentar novamente';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const userName = form.elements.name.value.trim();
  if (!userName) { form.elements.name.focus(); return; }
  button.disabled = true;
  status.textContent = 'A ligar à reunião…';
  try {
    // Credentials are created only after a deliberate join, never persisted.
    const details = await request('join', 'POST');
    sdkPromise ||= loadSdk(details.sdkVersion).then((sdk) => { sdkLoaded = true; return sdk; });
    const sdk = await sdkPromise;
    await new Promise((resolve, reject) => sdk.init({
      leaveUrl: `${location.origin}/ao-vivo`, leaveOnPageUnload: true,
      patchJsMedia: true, isSupportAV: true, isSupportChat: true,
      disablePreview: false, defaultView: 'speaker',
      success: resolve, error: reject
    }));
    document.body.classList.add('room-joining');
    lobby.hidden = true;
    await new Promise((resolve, reject) => sdk.join({
      signature: details.signature, meetingNumber: details.meetingNumber,
      passWord: details.passWord, userName,
      success: resolve, error: reject
    }));
  } catch (error) {
    showError(error instanceof Error ? error.message : 'Não foi possível entrar. Confirme com a equipa se a reunião está aberta, tente novamente ou abra no Zoom.');
    // A failed CDN load requires a fresh document, avoiding duplicate SDKs.
    if (!sdkLoaded && sdkPromise) {
      button.type = 'button';
      button.textContent = 'Recarregar a sala';
      button.onclick = () => location.reload();
    }
  }
});

async function prepare() {
  try {
    if (!meeting) throw new Error('Escolha uma reunião na programação para entrar.');
    if (!window.isSecureContext || !navigator.mediaDevices) throw new Error('Abra a App num navegador atualizado e numa ligação segura para participar.');
    const room = await request('room');
    document.querySelector('#room-title').textContent = room.title;
    const fallback = document.querySelector('#zoom-fallback');
    const url = safeUrl(room.zoomUrl);
    if (url) { fallback.href = url; fallback.hidden = false; }
    status.textContent = 'Para pedir a palavra, use «Levantar a mão» nos controlos da reunião.';
    form.hidden = false;
  } catch (error) {
    showError(error.message || 'Não foi possível preparar a sala. Volte à programação e tente novamente.');
  }
}

prepare();
