// Real addresses for every page, so the phone's back button goes back instead
// of leaving the app, a church can be shared as a link, and a reload stays on
// the same page. The server answers each of these paths with index.html.

const ROUTES = [
  { name: 'home', pattern: /^\/$/, title: 'ELIAS — ISTN-SJ' },
  { name: 'teachings', pattern: /^\/ensinos\/?$/, title: 'Ensinos' },
  { name: 'source', pattern: /^\/fontes\/([\w-]+)\/?$/, keys: ['id'], title: 'Canal' },
  { name: 'live', pattern: /^\/ao-vivo\/?$/, title: 'Ao vivo' },
  { name: 'posts', pattern: /^\/anuncios\/?$/, title: 'Anúncios' },
  { name: 'post', pattern: /^\/anuncios\/([\w-]+)\/?$/, keys: ['id'], title: 'Anúncio' },
  { name: 'churches', pattern: /^\/igrejas\/?$/, title: 'Igrejas' },
  { name: 'church', pattern: /^\/igrejas\/([\w-]+)\/?$/, keys: ['id'], title: 'Igreja' },
  { name: 'profile', pattern: /^\/perfil\/?$/, title: 'Perfil' }
];

const PATHS = {
  home: () => '/',
  teachings: () => '/ensinos',
  source: ({ id }) => `/fontes/${encodeURIComponent(id)}`,
  live: () => '/ao-vivo',
  posts: () => '/anuncios',
  post: ({ id }) => `/anuncios/${encodeURIComponent(id)}`,
  churches: () => '/igrejas',
  church: ({ id }) => `/igrejas/${encodeURIComponent(id)}`,
  profile: () => '/perfil'
};

export const pathFor = (name, params = {}) => (PATHS[name] || PATHS.home)(params);

export function parseLocation(location = window.location) {
  const search = new URLSearchParams(location.search);
  for (const route of ROUTES) {
    const match = location.pathname.match(route.pattern);
    if (match) {
      const params = Object.fromEntries((route.keys || []).map((key, index) => [key, decodeURIComponent(match[index + 1])]));
      return { name: route.name, params, search, title: route.title };
    }
  }
  return { name: 'home', params: {}, search, title: ROUTES[0].title };
}

// Links this router should handle itself: same origin, no target, not a file
// to download and not the admin panel, which is a separate page.
function isAppLink(anchor, event) {
  if (!anchor || event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.target || anchor.hasAttribute('download') || anchor.dataset.external !== undefined) return false;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  return !/^\/(admin|api|calendario\.ics|data|src|design)/.test(url.pathname);
}

export function startRouter(onChange) {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  const go = (url, { replace = false } = {}) => {
    const target = new URL(url, window.location.href);
    if (target.pathname + target.search === window.location.pathname + window.location.search) {
      window.scrollTo(0, 0);
      return;
    }
    // Remember where the reader was, so going back returns them to the same
    // place in a long list.
    history.replaceState({ ...(history.state || {}), scrollY: window.scrollY }, '');
    history[replace ? 'replaceState' : 'pushState']({ scrollY: 0 }, '', target.pathname + target.search);
    onChange(parseLocation(), { scrollY: 0, navigated: true });
  };

  document.addEventListener('click', (event) => {
    const anchor = event.target.closest?.('a[href]');
    if (!isAppLink(anchor, event)) return;
    event.preventDefault();
    go(anchor.href);
  });

  window.addEventListener('popstate', (event) => {
    onChange(parseLocation(), { scrollY: event.state?.scrollY || 0, navigated: true });
  });

  onChange(parseLocation(), { scrollY: history.state?.scrollY || 0, navigated: false });
  return { go };
}
