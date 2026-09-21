// The public app: state, data loading, routing and interaction. Pages are drawn
// by the modules in ./views from the state kept here.
import { APP_CONFIG, backendConfig, loadDirectory, loadLatestVideos, loadMeetings, loadPosts, loadTeachingLibrary } from './data.js';
import {
  addComment, addFavorite, addPostImages, availableProviders, createPost, deletePost, finishSocialSignIn, loadChurchOptions,
  loadComments, loadFavorites, loadMyReactions, loadPostAuthors, loadProfile, loadReactionPeople, readSession, register, removeFavorite,
  saveProfile, setReaction, signIn, signInWithProvider, signOut, updatePost
} from './account.js';
import { announce, copyText, debounce, renderInto, toast } from './dom.js';
import { churchTitle, filterChurches, findChurch } from './directory.js';
import { filterTeachings } from './library.js';
import { nextMeeting } from './meetings.js';
import { rankPrefixOf } from './roles.js';
import { prefs } from './prefs.js';
import { canPublish, postShareText, publishScopeOf, visiblePosts } from './posts.js';
import { uploadPhoto } from './upload.js';
import { registerServiceWorker } from './pwa.js';
import { startRouter } from './router.js';
import { churchPage, churchResults, churchShareText, churchesPage } from './views/churches.js';
import { homePage } from './views/home.js';
import { liveStatus, livePage } from './views/live.js';
import { bindProfile, profilePage } from './views/profile.js';
import { setAccount, TIME_ZONE } from './views/shared.js';
import { sourcePage, teachingResults, teachingsPage } from './views/teachings.js';
import { myChurchDbId, postPage, postsPage } from './views/posts.js';

const app = document.querySelector('#app');

const state = {
  route: { name: 'home', params: {}, search: new URLSearchParams() },
  teachings: null, teachingsError: false,
  teachingFilters: { query: '', category: 'Todas', year: '', book: '', sort: 'recent', savedOnly: false, page: 1 },
  directory: null, directoryError: false,
  churchFilters: { query: '', country: '', region: '', day: '' },
  meetings: null, meetingsError: false,
  posts: null, postsError: false, comments: {}, postAuthors: null, myReactions: {},
  communities: [], postCommunity: '', reactionSheet: null, reactionPeople: {},
  commentDrafts: {}, reactionSaving: {}, postDraft: null, postSaving: false, postUploading: false, commentSaving: false,
  latestVideos: {}, videosLoading: true,
  accountsAvailable: false, authMode: 'entrar', authBusy: false, providers: null,
  session: null, profile: null, churchOptions: null,
  uploading: false, profileSheet: null, sheetGender: null, sheetChurch: null, profileSaving: false
};

// ------------------------------------------------------------- desenho ----

const PAGES = {
  home: () => homePage(state),
  teachings: () => teachingsPage(state),
  source: () => sourcePage(state, state.route.params.id),
  live: () => livePage(state),
  posts: () => postsPage(state),
  post: () => postPage(state, state.route.params.id),
  churches: () => churchesPage(state),
  church: () => churchPage(state, state.route.params.id),
  profile: () => profilePage(state)
};

function render() {
  const composerWasOpen = Boolean(app.querySelector('#post-form'));
  setAccount(state.profile);
  state.myChurchDbId = myChurchDbId(state);
  renderInto(app, (PAGES[state.route.name] || PAGES.home)());
  if (state.postDraft && !composerWasOpen) app.querySelector('#post-body')?.focus();
  if (state.route.name === 'profile' && state.profile) bindProfile({ state, render, showToast: (message) => toast(message) });
}

// Data arriving after the page is drawn redraws it only if the page uses it.
const USES = {
  teachings: ['teachings'],
  directory: ['home', 'churches', 'church', 'profile'],
  meetings: ['home', 'live'],
  posts: ['home', 'posts', 'post'],
  videos: ['home', 'live', 'source'],
  account: ['home', 'profile']
};
const renderIfShowing = (kind) => { if (USES[kind].includes(state.route.name)) render(); };

function pageTitle(route) {
  if (route.name === 'church') {
    const church = findChurch(state.directory?.churches, route.params.id);
    if (church) return `${churchTitle(church)} · ISTN-SJ`;
  }
  return route.name === 'home' ? 'ISTN-SJ — Igreja Salvação de Todas as Nações' : `${route.title} · ISTN-SJ`;
}

function onRoute(route, { scrollY, navigated }) {
  state.route = route;
  if (state.directory) followFormerIds();
  if (route.name === 'teachings' && route.search.get('guardadas') === '1') {
    state.teachingFilters = { ...state.teachingFilters, savedOnly: true, page: 1 };
  }
  if (route.name === 'profile') { ensureChurchOptions(); askForNameIfMissing(); }
  if (route.name === 'post') ensureComments(route.params.id);
  if (route.name === 'posts' && canPublish(state.profile)) ensureChurchOptions();
  render();
  document.title = pageTitle(route);
  window.scrollTo(0, scrollY);
  // After a navigation, move focus to the new page so a screen reader starts
  // reading it, without scrolling away from the restored position.
  if (navigated) app.querySelector('main')?.focus({ preventScroll: true });
  if (route.name === 'post' && route.search.get('comentarios') === '1') {
    requestAnimationFrame(() => {
      app.querySelector('.comments')?.scrollIntoView({ block: 'start' });
      app.querySelector('#comment-body')?.focus({ preventScroll: true });
    });
  }
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
    .then((directory) => { state.directory = directory; followFormerIds(); syncMyChurchFromProfile(); })
    .catch(() => { state.directoryError = true; })
    .finally(() => { renderIfShowing('directory'); if (state.route.name === 'church') document.title = pageTitle(state.route); });
}

// Places announced once per service were joined into one record each, with new
// ids. A church saved on this phone, or opened from an old link, is found
// through the ids it had before and moved to the current one.
function followFormerIds() {
  const churches = state.directory?.churches;
  const saved = prefs.myChurch && findChurch(churches, prefs.myChurch);
  if (saved && saved.id !== prefs.myChurch) prefs.setMyChurch(saved.id);
  if (state.route.name !== 'church') return;
  const shown = findChurch(churches, state.route.params.id);
  if (shown && shown.id !== state.route.params.id) {
    state.route = { ...state.route, params: { ...state.route.params, id: shown.id } };
    window.history.replaceState(window.history.state, '', `/igrejas/${encodeURIComponent(shown.id)}`);
  }
}

function refreshPosts({ fresh = false } = {}) {
  state.postsError = false;
  return loadPosts({ fresh })
    .then(({ posts, communities }) => { state.posts = posts; if (communities) state.communities = communities; })
    .catch(() => { state.postsError = true; })
    .finally(() => renderIfShowing('posts'));
}

// Comments are read straight from the database, not through the server's cache:
// someone who has just written one must see it.
function ensureComments(postId) {
  if (!postId || state.comments[postId]) return;
  Promise.all([loadComments(postId), state.postAuthors ? null : loadPostAuthors()])
    .then(([comments, authors]) => {
      state.comments = { ...state.comments, [postId]: comments };
      if (authors) state.postAuthors = new Map(authors.map((author) => [author.id, author]));
      renderIfShowing('posts');
    })
    .catch(() => { state.comments = { ...state.comments, [postId]: [] }; renderIfShowing('posts'); });
}

// The names behind "12 reações", read when someone asks for them. undefined
// while it is being fetched, null when it could not be.
function openReactions(postId, { again = false } = {}) {
  if (!postId) return;
  state.reactionSheet = { id: postId, kind: state.reactionSheet?.id === postId ? state.reactionSheet.kind : '' };
  if (!again && state.reactionPeople[postId]) { render(); return; }
  delete state.reactionPeople[postId];
  render();
  loadReactionPeople(postId)
    .then((people) => { state.reactionPeople = { ...state.reactionPeople, [postId]: people || [] }; })
    .catch(() => { state.reactionPeople = { ...state.reactionPeople, [postId]: null }; })
    .finally(() => { if (state.reactionSheet?.id === postId) render(); });
}

const closeReactions = () => { if (state.reactionSheet) { state.reactionSheet = null; render(); } };

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

// An account with no name yet — someone who signed in with Google, where the
// app deliberately does not borrow the name Google holds — is asked for one as
// soon as the profile is on screen.
function askForNameIfMissing() {
  if (state.profile && !state.profile.display_name && !state.profileSheet) state.profileSheet = 'display_name';
}

async function afterSignIn(session) {
  state.session = session;
  state.profile = await loadProfile(session);
  syncMyChurchFromProfile();
  ensureChurchOptions();
  askForNameIfMissing();
  // Saved teachings from before signing in join the account, and the account's
  // join this device.
  loadMyReactions(session)
    .then((rows) => { state.myReactions = Object.fromEntries(rows.map((row) => [row.post_id, row.kind])); renderIfShowing('posts'); })
    .catch(() => {});
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
    // Coming back from Google or from a confirmation link with an error is worth saying.
    toast(error.message);
  }
  const session = social || readSession();
  if (session) {
    try {
      await afterSignIn(session);
      if (social) {
        toast(social.arrivedFrom === 'signup' ? 'Email confirmado. Sessão iniciada.' : 'Sessão iniciada.');
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
    announce(count === 1 ? '1 igreja encontrada' : `${count} igrejas encontradas`);
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
  'retry-posts': refreshPosts,

  // ------------------------------------------------------------ anúncios --
  'new-post': () => {
    if (!canPublish(state.profile)) { toast('Só quem a equipa autoriza pode publicar.'); return; }
    ensureChurchOptions();
    // Writing from inside a community's filter starts with that community
    // chosen — it is almost always the one being written for.
    state.postDraft = { body: '', title: '', churchId: publishScopeOf(state.profile) === 'global' ? null : state.profile.home_church_id, communityId: state.postCommunity || null, highlighted: false, images: [] };
    render();
  },
  'edit-post': (element) => {
    const post = state.posts?.find((item) => item.id === element.dataset.id);
    if (!post) return;
    ensureChurchOptions();
    state.postDraft = { id: post.id, title: post.title, body: post.body, churchId: post.churchId, communityId: post.communityId, highlighted: post.highlighted, highlightUntil: post.highlightUntil, images: [] };
    render();
  },
  'delete-post': (element) => {
    if (!window.confirm('Eliminar este anúncio? Esta ação não pode ser anulada.')) return;
    deletePost(element.dataset.id, state.session)
      .then(() => { toast('Anúncio eliminado.'); router.go('/anuncios'); return refreshPosts({ fresh: true }); })
      .catch((error) => toast(error.message));
  },
  'drop-image': (element) => {
    if (!state.postDraft || state.postUploading || state.postSaving) return;
    const index = Number(element.dataset.index);
    state.postDraft.images = state.postDraft.images.filter((image, position) => position !== index);
    render();
  },
  // A link to the announcement itself, so whoever receives it lands on it.
  'share-post': async (element) => {
    const post = state.posts?.find((item) => item.id === element.dataset.id);
    if (!post) return;
    const url = `${window.location.origin}/anuncios/${encodeURIComponent(post.id)}`;
    const text = postShareText(post);
    if (navigator.share) {
      try { await navigator.share({ title: post.title || 'Anúncio · ISTN-SJ', text, url }); return; }
      catch (error) { if (error?.name === 'AbortError') return; }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`, '_blank', 'noopener,noreferrer');
  },
  // ML, Acção Social, Grupo Jovem: one community's announcements at a time.
  'filter-community': (element) => {
    state.postCommunity = element.dataset.id || '';
    render();
    const community = state.communities.find((item) => item.id === state.postCommunity);
    const count = visiblePosts(state.posts || [], { churchDbId: state.myChurchDbId, community: state.postCommunity }).length;
    announce(`${community ? community.name : 'Todos os anúncios'}: ${count === 1 ? '1 anúncio' : `${count} anúncios`}.`);
  },

  // Who reacted, by name. Fetched when the list is opened and kept until
  // somebody's reaction changes it.
  'show-reactions': (element) => { openReactions(element.dataset.id); },
  'retry-reactions': () => { if (state.reactionSheet) openReactions(state.reactionSheet.id, { again: true }); },
  'reaction-tab': (element) => {
    if (!state.reactionSheet) return;
    state.reactionSheet = { ...state.reactionSheet, kind: element.dataset.kind || '' };
    render();
  },

  'focus-comment': () => {
    app.querySelector('.comments')?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    app.querySelector('#comment-body')?.focus({ preventScroll: true });
  },
  'insert-emoji': (element) => {
    const field = document.getElementById(element.dataset.target);
    if (!field || field.disabled) return;
    const emoji = element.dataset.emoji;
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    if (field.value.length - (end - start) + emoji.length > field.maxLength) return;
    field.setRangeText(emoji, start, end, 'end');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.focus();
  },
  react: async (element) => {
    if (!state.session) { toast('Entre com a sua conta para reagir.'); return; }
    const id = element.dataset.id;
    if (state.reactionSaving[id]) return;
    state.reactionSaving[id] = true;
    const kind = state.myReactions[id] === element.dataset.kind ? '' : element.dataset.kind;
    const previous = state.myReactions[id] || '';
    state.myReactions = { ...state.myReactions, [id]: kind };
    // The counts come from the server's cached feed; adjust the one on screen so
    // the tap answers at once, and let the next refresh confirm it.
    const post = state.posts?.find((item) => item.id === id);
    if (post) {
      if (previous) post.reactions[previous] = Math.max(0, (post.reactions[previous] || 0) - 1);
      if (kind) post.reactions[kind] = (post.reactions[kind] || 0) + 1;
      post.reactionTotal = Math.max(0, post.reactionTotal + (kind ? 1 : 0) - (previous ? 1 : 0));
    }
    render();
    try {
      await setReaction(id, kind, state.session);
      delete state.reactionPeople[id];
      if (state.reactionSheet?.id === id) openReactions(id, { again: true });
      announce(kind ? 'Reação adicionada.' : 'Reação removida.');
    } catch (error) {
      state.myReactions[id] = previous;
      if (post) {
        if (kind) post.reactions[kind] = Math.max(0, (post.reactions[kind] || 0) - 1);
        if (previous) post.reactions[previous] = (post.reactions[previous] || 0) + 1;
        post.reactionTotal = Math.max(0, post.reactionTotal - (kind ? 1 : 0) + (previous ? 1 : 0));
      }
      toast(error.message);
    } finally {
      delete state.reactionSaving[id];
      render();
    }
  },

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

  'clear-church-filters': () => { state.churchFilters = { query: '', country: '', region: '', day: '' }; render(); },
  // From the map or the list of countries under it: the list, filtered, with
  // its first place in view.
  'church-country': (element) => {
    state.churchFilters = { ...state.churchFilters, country: element.dataset.country, region: '' };
    render();
    app.querySelector('#church-results')?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    const count = filterChurches(state.directory?.churches || [], state.churchFilters).length;
    announce(`${element.dataset.country}: ${count === 1 ? '1 igreja' : `${count} igrejas`}.`);
  },
  'church-day': (element) => {
    state.churchFilters = { ...state.churchFilters, day: element.dataset.day };
    render();
    const count = filterChurches(state.directory?.churches || [], state.churchFilters).length;
    announce(count === 1 ? '1 igreja encontrada' : `${count} igrejas encontradas`);
  },
  'share-church': async (element) => {
    const church = findChurch(state.directory?.churches, element.dataset.id);
    if (!church) return;
    const url = `${window.location.origin}/igrejas/${encodeURIComponent(church.id)}`;
    const text = churchShareText(church);
    if (navigator.share) {
      try { await navigator.share({ title: churchTitle(church), text, url }); return; }
      catch (error) { if (error?.name === 'AbortError') return; }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`, '_blank', 'noopener,noreferrer');
  },
  'my-church': (element) => {
    const id = element.dataset.id;
    const next = prefs.myChurch === id ? null : id;
    const church = findChurch(state.directory?.churches, id);
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

// Keep drafts in memory so asynchronous updates never discard typed text.
function rememberPostDraft(form) {
  if (!state.postDraft) return;
  const values = Object.fromEntries(new FormData(form).entries());
  Object.assign(state.postDraft, {
    title: values.title || '', body: values.body || '', churchId: values.church_id || null,
    communityId: values.community_id || null,
    highlighted: Boolean(values.highlighted), highlightUntil: values.highlight_until || ''
  });
}
for (const eventName of ['input', 'change']) {
  app.addEventListener(eventName, (event) => {
    if (event.target.form?.id === 'post-form') rememberPostDraft(event.target.form);
    if (event.target.form?.id === 'comment-form' && event.target.name === 'body') {
      state.commentDrafts[event.target.form.dataset.id] = event.target.value;
    }
  });
}

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

app.addEventListener('click', (event) => {
  const closer = event.target.closest('[data-reactions-close]');
  if (closer && (event.target === closer || closer.tagName === 'BUTTON')) closeReactions();
});

app.addEventListener('click', (event) => {
  const closer = event.target.closest('[data-sheet-close]');
  if (!closer || !state.postDraft || state.postUploading || state.postSaving) return;
  if (event.target === closer || closer.tagName === 'BUTTON') { state.postDraft = null; render(); }
});

// Native details provides click, touch and keyboard access to the compact picker.
// Close it on an outside click or Escape, and keep only one picker open.
app.addEventListener('toggle', (event) => {
  if (!event.target.matches('[data-reaction-picker]') || !event.target.open) return;
  app.querySelectorAll('[data-reaction-picker][open]').forEach((picker) => {
    if (picker !== event.target) picker.open = false;
  });
}, true);
document.addEventListener('click', (event) => {
  app.querySelectorAll('[data-reaction-picker][open]').forEach((picker) => {
    if (!picker.contains(event.target)) picker.open = false;
  });
});
app.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const picker = event.target.closest('[data-reaction-picker][open]');
  if (picker) { event.preventDefault(); picker.open = false; picker.querySelector('summary').focus(); return; }
  if (state.reactionSheet) { event.preventDefault(); closeReactions(); }
});

app.addEventListener('keydown', (event) => {
  const dialog = app.querySelector('#post-form');
  if (!dialog) return;
  if (event.key === 'Escape' && !state.postUploading && !state.postSaving) {
    event.preventDefault(); state.postDraft = null; render();
    app.querySelector('[data-action="new-post"], [data-action="edit-post"]')?.focus();
  }
  if (event.key === 'Tab') {
    const fields = [...dialog.querySelectorAll('button, input, textarea, select, summary')]
      .filter((field) => !field.disabled && field.type !== 'hidden' && field.getClientRects().length);
    const first = fields[0], last = fields[fields.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});

app.addEventListener('change', async (event) => {
  if (!event.target.matches('[data-post-image]')) return;
  const draft = state.postDraft;
  if (!draft || state.postUploading || state.postSaving) return;
  const files = [...(event.target.files || [])];
  if (!files.length) return;
  const room = Math.max(0, 8 - draft.images.length);
  if (files.length > room) toast('Pode adicionar até 8 fotos por publicação.');
  state.postUploading = true; render();
  try {
    for (const file of files.slice(0, room)) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        toast(`${file.name}: escolha uma foto JPG, PNG ou WebP.`); continue;
      }
      try {
        const url = await uploadPhoto(file, '', state.session.user.id, state.session, { bucket: 'publicacoes', maxEdge: 1600 });
        draft.images.push({ url });
      } catch (error) { toast(`${file.name}: ${error.message}`); }
      render();
    }
  } finally { state.postUploading = false; render(); }
});

app.addEventListener('submit', async (event) => {
  if (event.target.id === 'post-form') {
    event.preventDefault();
    if (state.postSaving || state.postUploading || !state.postDraft) return;
    const values = Object.fromEntries(new FormData(event.target).entries());
    const body = (values.body || '').trim();
    if (!body) { toast('Escreva o anúncio.'); return; }
    const isEdit = Boolean(state.postDraft.id);
    state.postSaving = true; render();
    try {
      const fields = {
        body,
        title: (values.title || '').trim() || null,
        churchId: values.church_id || null,
        communityId: values.community_id || null,
        highlighted: Boolean(values.highlighted),
        highlightUntil: values.highlight_until || null
      };
      const saved = state.postDraft.id
        ? await updatePost(state.postDraft.id, { body: fields.body, title: fields.title, church_id: fields.churchId, community_id: fields.communityId, highlighted: fields.highlighted, highlight_until: fields.highlightUntil }, state.session)
        : await createPost(fields, state.session);
      if (state.postDraft.images?.length) await addPostImages(saved.id, state.postDraft.images, state.session);
      state.postDraft = null;
      toast(isEdit ? 'Anúncio guardado.' : 'Anúncio publicado.');
      await refreshPosts({ fresh: true });
    } catch (error) {
      toast(error.message);
    } finally {
      state.postSaving = false; render();
    }
    return;
  }

  if (event.target.id === 'comment-form') {
    event.preventDefault();
    if (state.commentSaving) return;
    const postId = event.target.dataset.id;
    const body = (new FormData(event.target).get('body') || '').toString().trim();
    if (!body) return;
    state.commentSaving = true; render();
    try {
      await addComment(postId, body, state.session);
      delete state.commentDrafts[postId];
      const [comments] = await Promise.all([loadComments(postId), refreshPosts({ fresh: true })]);
      state.comments = { ...state.comments, [postId]: comments };
      toast('Comentário publicado.');
    } catch (error) {
      toast(error.message);
    } finally {
      state.commentSaving = false; render();
    }
    return;
  }

  if (event.target.id !== 'account-form') return;
  event.preventDefault();
  const { email, password, display_name: displayName } = Object.fromEntries(new FormData(event.target).entries());
  if (state.authMode === 'registar') {
    const name = (displayName || '').trim();
    if (!name) { toast('Indique o seu nome.'); return; }
    const rank = rankPrefixOf(name);
    if (rank) { toast(`Escreva o nome sem «${rank}»: a função é acrescentada pela aplicação.`); return; }
  }
  state.authBusy = true; render();
  try {
    const session = state.authMode === 'registar' ? await register(email, password, (displayName || '').trim()) : await signIn(email, password);
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

const router = startRouter(onRoute);
refreshMeetings();
refreshPosts();
refreshDirectory();
refreshTeachings();
refreshVideos();
startAccount();

// Returning from Admin or another tab refreshes the public data. Do not
// redraw a member's form while they are composing or editing their profile.
let lastPublicRefresh = Date.now();
function refreshPublicOnReturn() {
  if (document.visibilityState !== 'visible' || Date.now() - lastPublicRefresh < 60000) return;
  if (!['home', 'churches', 'church', 'live'].includes(state.route.name)) return;
  lastPublicRefresh = Date.now();
  refreshDirectory();
  refreshMeetings();
  refreshPosts();
}
document.addEventListener('visibilitychange', refreshPublicOnReturn);
window.addEventListener('focus', refreshPublicOnReturn);
