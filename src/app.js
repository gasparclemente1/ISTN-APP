// The public app: state, data loading, routing and interaction. Pages are drawn
// by the modules in ./views from the state kept here.
import { APP_CONFIG, backendConfig, loadDirectory, loadLatestVideos, loadMeetings, loadTeachingLibrary } from './data.js';
import { addFavorite, availableProviders, finishSocialSignIn, loadChurchOptions, loadFavorites, loadProfile, readSession, register, removeFavorite, saveProfile, signIn, signInWithProvider, signOut, loadServoContact } from './account.js';
import { announce, copyText, debounce, renderInto, toast } from './dom.js';
import { filterChurches } from './directory.js';
import { filterTeachings } from './library.js';
import { nextMeeting } from './meetings.js';
import { prefs } from './prefs.js';
import { registerServiceWorker } from './pwa.js';
import { startRouter } from './router.js';
import { churchPage, churchResults, churchesPage } from './views/churches.js';
import { homePage } from './views/home.js';
import { liveStatus, livePage } from './views/live.js';
import { bindProfile, profilePage } from './views/profile.js';
import { TIME_ZONE } from './views/shared.js';
import { sourcePage, teachingResults, teachingsPage } from './views/teachings.js';

const app = document.querySelector('#app');

const state = {
  route: { name: 'home', params: {}, search: new URLSearchParams() },
  teachings: null, teachingsError: false,
  teachingFilters: { query: '', category: 'Todas', year: '', book: '', sort: 'recent', savedOnly: false, page: 1 },
  directory: null, directoryError: false,
  churchFilters: { query: '', country: '', region: '' },
  meetings: null, meetingsError: false,
  latestVideos: {}, videosLoading: true,
  accountsAvailable: false, authMode: 'entrar', authBusy: false, providers: null,
  session: null, profile: null, churchOptions: null, servoContact: null,
  uploading: false, profileSheet: null, sheetGender: null, sheetChurch: null, profileSaving: false
};

// ------------------------------------------------------------- desenho ----

const PAGES = {
  home: () => homePage(state),
  teachings: () => teachingsPage(state),
  source: () => sourcePage(state, state.route.params.id),
  live: () => livePage(state),
  churches: () => churchesPage(state),
  church: () => churchPage(state, state.route.params.id),
  profile: () => profilePage(state)
};

function render() {
  renderInto(app, (PAGES[state.route.name] || PAGES.home)());
  if (state.route.name === 'profile' && state.profile) bindProfile({ state, render, showToast: (message) => toast(message) });
}

// Data arriving after the page is drawn redraws it only if the page uses it.
const USES = {
  teachings: ['teachings'],
  directory: ['home', 'churches', 'church', 'profile'],
  meetings: ['home', 'live'],
  videos: ['home', 'live', 'source'],
  account: ['home', 'profile']
};
const renderIfShowing = (kind) => { if (USES[kind].includes(state.route.name)) render(); };

function pageTitle(route) {
  if (route.name === 'church') {
    const church = state.directory?.churches.find((item) => item.id === route.params.id);
    if (church) return `ISTN — ${church.name} · ELIAS`;
  }
  return route.name === 'home' ? 'ELIAS — ISTN-SJ' : `${route.title} · ELIAS`;
}

function onRoute(route, { scrollY, navigated }) {
  state.route = route;
  if (route.name === 'teachings' && route.search.get('guardadas') === '1') {
    state.teachingFilters = { ...state.teachingFilters, savedOnly: true, page: 1 };
  }
  if (route.name === 'profile') ensureChurchOptions();
  render();
  document.title = pageTitle(route);
  window.scrollTo(0, scrollY);
  // After a navigation, move focus to the new page so a screen reader starts
  // reading it, without scrolling away from the restored position.
  if (navigated) app.querySelector('main')?.focus({ preventScroll: true });
}

// --------------------------------------------------------------- dados ----

function refreshTeachings() {
  state.teachingsError = false;
  return loadTeachingLibrary()
    .then((teachings) => { state.teachings = teachings; })
    .catch(() => { state.teachingsError = true; })
    .finally(() => renderIfShowing('teachings'));
}

function refreshDirectory() {
  state.directoryError = false;
  return loadDirectory()
    .then((directory) => { state.directory = directory; syncMyChurchFromProfile(); })
    .catch(() => { state.directoryError = true; })
    .finally(() => { renderIfShowing('directory'); if (state.route.name === 'church') document.title = pageTitle(state.route); });
}

function refreshMeetings() {
  state.meetingsError = false;
  return loadMeetings()
    .then((meetings) => { state.meetings = meetings; })
    .catch((error) => { state.meetingsError = error?.status === 503 ? 'indisponivel' : 'rede'; })
    .finally(() => renderIfShowing('meetings'));
}

function refreshVideos() {
  // allSettled, not all: one channel failing must not discard the other's videos.
  return Promise.allSettled(APP_CONFIG.sources.filter((source) => source.channelId)
    .map(async (source) => [source.channelId, await loadLatestVideos(source.channelId)]))
    .then((results) => { state.latestVideos = Object.fromEntries(results.filter((result) => result.status === 'fulfilled').map((result) => result.value)); })
    .finally(() => { state.videosLoading = false; renderIfShowing('videos'); });
}

// ------------------------------------------------------------- conta -----

function ensureChurchOptions() {
  if (!state.profile || state.churchOptions) return;
  state.churchOptions = [];
  loadChurchOptions().then((churches) => { state.churchOptions = churches; renderIfShowing('account'); }).catch(() => {});
}

// A member's church in the account and "A minha ISTN" on the device are the
// same choice; the account wins when both exist.
function syncMyChurchFromProfile() {
  const homeId = state.profile?.home_church_id;
  if (!homeId || !state.directory) return;
  const church = state.directory.churches.find((item) => item.dbId === homeId);
  if (church && prefs.myChurch !== church.id) prefs.setMyChurch(church.id);
}

async function afterSignIn(session) {
  state.session = session;
  state.profile = await loadProfile(session);
  state.servoContact = null;
  if (state.profile?.servo_claim_status === 'aprovado' && state.profile.servo_id) {
    loadServoContact(state.profile.servo_id, session)
      .then((contact) => { state.servoContact = contact; renderIfShowing('account'); })
      .catch(() => {});
  }
  syncMyChurchFromProfile();
  ensureChurchOptions();
  // Saved teachings from before signing in join the account, and the account's
  // join this device.
  loadFavorites(session).then((ids) => {
    const local = [...prefs.favorites].filter((id) => !ids.includes(id));
    prefs.addFavorites(ids);
    local.forEach((id) => addFavorite(id, session).catch(() => {}));
  }).catch(() => {});
}

async function startAccount() {
  const config = await backendConfig();
  state.accountsAvailable = Boolean(config.supabaseUrl && config.supabaseKey);
  if (!state.accountsAvailable) { renderIfShowing('account'); return; }
  availableProviders().then((providers) => { state.providers = providers; renderIfShowing('account'); }).catch(() => {});
  let social = null;
  try {
    social = await finishSocialSignIn();
  } catch (error) {
    // Coming back from Google or Facebook with an error is worth saying.
    toast(error.message);
  }
  const session = social || readSession();
  if (session) {
    try {
      await afterSignIn(session);
      if (social) {
        toast('Sessão iniciada.');
        window.history.replaceState(null, '', '/perfil');
        onRoute({ name: 'profile', params: {}, search: new URLSearchParams(), title: 'Perfil' }, { scrollY: 0, navigated: true });
        return;
      }
    } catch (error) {
      // A session the server no longer accepts is forgotten quietly: the app
      // works signed out, and the profile page offers to sign in again. Offline,
      // the session is kept for when the connection returns.
      if (error?.status === 401 || error?.status === 403) signOut();
      state.session = null;
      state.profile = null;
    }
  }
  renderIfShowing('account');
}

// ----------------------------------------------------------- interação ----

async function shareTeaching(teaching) {
  const text = `${teaching.title}${teaching.biblicalReference ? ` (${teaching.biblicalReference})` : ''}`;
  if (navigator.share) {
    try { await navigator.share({ title: teaching.title, text, url: teaching.url }); return; }
    catch (error) { if (error?.name === 'AbortError') return; }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${teaching.url}`)}`, '_blank', 'noopener,noreferrer');
}

function updateTeachingResults({ announceCount = false } = {}) {
  const region = app.querySelector('#teaching-results');
  if (!region || !state.teachings) return;
  renderInto(region, teachingResults(state));
  if (announceCount) {
    const count = filterTeachings(state.teachings, state.teachingFilters, prefs.favorites).length;
    announce(count === 1 ? '1 pregação encontrada' : `${count} pregações encontradas`);
  }
}

function updateChurchResults({ announceCount = false } = {}) {
  const region = app.querySelector('#church-results');
  if (!region || !state.directory) return;
  renderInto(region, churchResults(state));
  if (announceCount) {
    const count = filterChurches(state.directory.churches, state.churchFilters).length;
    announce(count === 1 ? '1 registo encontrado' : `${count} registos encontrados`);
  }
}

// The list follows the typing quickly; the spoken count waits for a pause.
const announceTeachings = debounce(() => updateTeachingResults({ announceCount: true }), 700);
const announceChurches = debounce(() => updateChurchResults({ announceCount: true }), 700);
const searchTeachings = debounce(() => { updateTeachingResults(); announceTeachings(); }, 140);
const searchChurches = debounce(() => { updateChurchResults(); announceChurches(); }, 140);

const setTeachingFilters = (changes) => { state.teachingFilters = { ...state.teachingFilters, ...changes, page: 1 }; render(); };

const actions = {
  'retry-meetings': refreshMeetings,
  'retry-directory': refreshDirectory,
  'retry-teachings': refreshTeachings,

  category: (element) => setTeachingFilters({ category: element.dataset.value, savedOnly: false }),
  'saved-only': () => setTeachingFilters({ savedOnly: !state.teachingFilters.savedOnly }),
  sort: (element) => setTeachingFilters({ sort: element.dataset.value }),
  'clear-teaching-filters': () => setTeachingFilters({ query: '', category: 'Todas', year: '', book: '', savedOnly: false }),
  'show-more': () => { state.teachingFilters.page += 1; updateTeachingResults(); },

  favorite(element) {
    const id = element.dataset.id;
    const saved = prefs.toggleFavorite(id);
    if (state.session) (saved ? addFavorite : removeFavorite)(id, state.session).catch(() => {});
    element.setAttribute('aria-pressed', String(saved));
    element.classList.toggle('is-on', saved);
    announce(saved ? 'Pregação guardada.' : 'Pregação removida das guardadas.');
    if (state.teachingFilters.savedOnly) updateTeachingResults();
    const count = app.querySelector('[data-action="saved-only"] small');
    if (count) count.textContent = prefs.favorites.size;
  },
  share(element) {
    const teaching = state.teachings?.find((item) => item.id === element.dataset.id);
    if (teaching) shareTeaching(teaching);
  },
  async copy(element) {
    const copied = await copyText(element.dataset.value);
    toast(copied ? `${element.dataset.label} copiado.` : 'Não foi possível copiar. Selecione o texto e copie à mão.');
  },

  'clear-church-filters': () => { state.churchFilters = { query: '', country: '', region: '' }; render(); },
  'my-church': (element) => {
    const id = element.dataset.id;
    const next = prefs.myChurch === id ? null : id;
    const church = state.directory?.churches.find((item) => item.id === id);
    prefs.setMyChurch(next);
    if (state.session && church?.dbId && state.directory?.source === 'supabase') {
      saveProfile({ home_church_id: next ? church.dbId : null }, state.session)
        .then((profile) => { if (profile) state.profile = profile; })
        .catch(() => toast('Guardado neste dispositivo. Não foi possível atualizar a conta.'));
    }
    render();
    toast(next ? 'Guardada como a sua ISTN.' : 'Deixou de ser a sua ISTN.');
  },

  'switch-auth': () => { state.authMode = state.authMode === 'registar' ? 'entrar' : 'registar'; render(); },
  provider: (element) => signInWithProvider(element.dataset.provider).catch((error) => toast(error.message))
};

app.addEventListener('click', (event) => {
  const element = event.target.closest('[data-action]');
  if (!element || !app.contains(element) || !actions[element.dataset.action]) return;
  event.preventDefault();
  actions[element.dataset.action](element);
});

app.addEventListener('input', (event) => {
  if (event.target.id === 'teaching-search') {
    state.teachingFilters = { ...state.teachingFilters, query: event.target.value, page: 1 };
    searchTeachings();
  } else if (event.target.id === 'church-search') {
    state.churchFilters = { ...state.churchFilters, query: event.target.value };
    searchChurches();
  }
});

app.addEventListener('change', (event) => {
  const { id, value } = event.target;
  if (id === 'year-filter') setTeachingFilters({ year: value });
  else if (id === 'book-filter') setTeachingFilters({ book: value });
  else if (id === 'country-filter') { state.churchFilters = { ...state.churchFilters, country: value, region: '' }; render(); }
  else if (id === 'region-filter') { state.churchFilters = { ...state.churchFilters, region: value }; render(); }
});

app.addEventListener('submit', async (event) => {
  if (event.target.id !== 'account-form') return;
  event.preventDefault();
  const { email, password } = Object.fromEntries(new FormData(event.target).entries());
  state.authBusy = true; render();
  try {
    const session = state.authMode === 'registar' ? await register(email, password) : await signIn(email, password);
    if (!session) { toast('Conta criada. Confirme o email antes de entrar.'); state.authMode = 'entrar'; return; }
    await afterSignIn(session);
    toast('Sessão iniciada.');
  } catch (error) {
    toast(error.message);
  } finally {
    state.authBusy = false; render();
  }
});

// Keeps "Começa em 12 min" true without redrawing the page every tick; the
// page is redrawn only when the next meeting itself changes or goes live.
let lastMeetingKey = '';
setInterval(() => {
  if (!state.meetings || !['home', 'live'].includes(state.route.name)) return;
  const now = new Date();
  const next = nextMeeting(state.meetings, TIME_ZONE, now);
  const key = next ? `${next.start.getTime()}:${next.isLive}` : 'none';
  if (lastMeetingKey && key !== lastMeetingKey) { lastMeetingKey = key; render(); return; }
  lastMeetingKey = key;
  if (next) app.querySelectorAll('[data-countdown]').forEach((element) => { element.textContent = liveStatus(next, now); });
}, 20000);

prefs.subscribe(() => { if (state.route.name === 'home') render(); });

registerServiceWorker({
  onUpdate: (reload) => toast('Há uma nova versão da aplicação.', { actionLabel: 'Atualizar', onAction: reload, duration: 0 })
});

startRouter(onRoute);
refreshMeetings();
refreshDirectory();
refreshTeachings();
refreshVideos();
startAccount();
