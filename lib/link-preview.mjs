// What a shared link shows before it is opened.
//
// WhatsApp, Facebook and Telegram read the page's Open Graph tags to draw the
// card under a shared link. The app is one index.html for every address, so
// without this a church or an announcement shared in a group would show only
// "ISTN-SJ". The server writes the tags for the address asked for: the
// church's name, days and address; the announcement's title and first lines.
//
// Only those services wait for the data. A person opening the app gets the
// page at once, with the tags of the section, and the app draws the rest.
import { findChurch, SEAT_LABELS, serviceLabel } from '../src/directory.js';
import { escapeHtml } from '../src/html.js';
import { videosIn } from '../src/posts.js';

export const PREVIEW_BOTS = /(WhatsApp|facebookexternalhit|Facebot|Twitterbot|TelegramBot|Slackbot|LinkedInBot|Discordbot|Googlebot|bingbot|Applebot|Pinterest|SkypeUriPreview|redditbot|Viber|vkShare|Snapchat)/i;

const SITE = 'ISTN-SJ';
const DEFAULT = {
  title: 'ISTN-SJ — Igreja Salvação de Todas as Nações',
  description: 'Pregações do Profeta Elias, reuniões ao vivo e as igrejas ISTN-SJ pelo mundo.',
  image: '/design/assets/photos/partilha-istn-sj.jpg'
};

// The picture of the Profeta Elias at the top of a page, fetched with the page
// itself rather than after the app's code has run: on mobile data that is the
// difference between seeing him at once and seeing an empty frame.
const PROPHET = {
  home: { href: '/design/assets/photos/profeta-elias-boas-vindas-600.webp', srcset: '/design/assets/photos/profeta-elias-boas-vindas-600.webp 600w, /design/assets/photos/profeta-elias-boas-vindas-1100.webp 1100w', sizes: '(min-width: 760px) 440px, 100vw' },
  churches: { href: '/design/assets/photos/profeta-elias-profecia-560.webp', srcset: '/design/assets/photos/profeta-elias-profecia-560.webp 560w, /design/assets/photos/profeta-elias-profecia-940.webp 940w', sizes: '(min-width: 760px) 360px, 80vw' }
};

// A section, and the pages inside it: a church or a post that cannot be found
// still shows where the link leads.
const SECTIONS = [
  [/^\/$/, { preload: PROPHET.home }],
  [/^\/igrejas\/?$/, { title: 'Igrejas ISTN-SJ pelo mundo', description: 'Encontre a sua igreja local: igrejas, casas de oração e igrejas online, com os dias de culto e as moradas.', preload: PROPHET.churches }],
  [/^\/igrejas\//, { title: 'Igrejas ISTN-SJ pelo mundo', description: 'Encontre a sua igreja local: igrejas, casas de oração e igrejas online, com os dias de culto e as moradas.' }],
  [/^\/ao-vivo(\/|$)/, { title: 'Reuniões que nos fortalecem · ISTN-SJ', description: 'Se alimente cada dia na mesa do Senhor no seio de Deus. A próxima live, a sala do Zoom e os horários.' }],
  [/^\/ensinos(\/|$)/, { title: 'Todas as pregações de Elias num só lugar', description: 'O acervo de pregações do Profeta Elias, por tipo de encontro, ano e livro bíblico.' }],
  [/^\/anuncios(\/|$)/, { title: 'Anúncios · ISTN-SJ', description: 'Novidades, encontros e momentos da ISTN-SJ.' }]
];

const clip = (text, max = 190) => {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
};

// The preview of an address, from what is known without asking anyone.
export function sectionPreview(pathname) {
  const found = SECTIONS.find(([pattern]) => pattern.test(pathname));
  return { ...DEFAULT, ...(found ? found[1] : {}) };
}

export function churchPreview(church) {
  const where = [church.region, church.country].filter(Boolean).join(', ');
  return {
    path: `/igrejas/${encodeURIComponent(church.id)}`,
    title: `ISTN — ${church.name}${church.seat ? ` · ${SEAT_LABELS[church.seat]}` : ''}`,
    description: clip([
      church.services.length ? church.services.map(serviceLabel).join(' · ') : '',
      church.address || where
    ].filter(Boolean).join(' — ')),
    image: DEFAULT.image
  };
}

export function postPreview(post) {
  const video = videosIn(post.body)[0];
  const photo = post.images?.find((image) => /^https:\/\//.test(image.url))?.url;
  return {
    title: post.title || 'Anúncio da ISTN-SJ',
    description: clip(post.body) || DEFAULT.description,
    image: photo || video?.thumbnail || DEFAULT.image
  };
}

// The preview for `pathname`. `load` gives the directory and the posts; it is
// only called for the addresses that need them.
export async function previewFor(pathname, load = {}) {
  const church = pathname.match(/^\/igrejas\/([\w-]+)\/?$/);
  if (church && load.directory) {
    const found = findChurch((await load.directory()).churches, decodeURIComponent(church[1]));
    if (found) return churchPreview(found);
  }
  const post = pathname.match(/^\/anuncios\/([\w-]+)\/?$/);
  if (post && load.posts) {
    const found = (await load.posts()).posts.find((item) => item.id === post[1]);
    if (found) return postPreview(found);
  }
  return sectionPreview(pathname);
}

// index.html with the page's own title and the tags a link preview reads.
// Every value is escaped: a church name or a post is text people typed.
export function withPreview(html, preview, { origin, pathname }) {
  const absolute = (url) => (/^https:\/\//.test(url) ? url : `${origin}${url}`);
  const tags = [
    ['og:site_name', SITE],
    ['og:type', 'website'],
    ['og:locale', 'pt_PT'],
    ['og:title', preview.title],
    ['og:description', preview.description],
    ['og:url', `${origin}${preview.path || pathname}`],
    ['og:image', absolute(preview.image)]
  ].map(([property, content]) => `<meta property="${property}" content="${escapeHtml(content)}" />`)
    .concat(`<meta name="twitter:card" content="summary_large_image" />`)
    .concat(preview.preload ? [`<link rel="preload" as="image" href="${escapeHtml(preview.preload.href)}" imagesrcset="${escapeHtml(preview.preload.srcset)}" imagesizes="${escapeHtml(preview.preload.sizes)}" fetchpriority="high" />`] : [])
    .join('\n    ');
  // Functions, not strings, as replacements: a "$&" typed in a post must stay
  // text, not become a replacement pattern.
  return html
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(preview.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, () => `<meta name="description" content="${escapeHtml(preview.description)}" />\n    ${tags}`);
}
