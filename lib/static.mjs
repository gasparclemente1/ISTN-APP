// Which files the server may hand out, and where they live on disk.
//
// The server used to serve anything under the project folder, which included
// .git, the SQL seed, the server's own source and — had it existed — .env with
// the Supabase keys. It now answers only for what the app actually loads, and
// everything else is a 404, whatever the path looks like.
import { extname, join, normalize, posix, sep } from 'node:path';

export const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp'
};

const PUBLIC_FILES = new Set(['/index.html', '/admin.html', '/manifest.webmanifest', '/sw.js']);
const PUBLIC_PREFIXES = ['/src/', '/design/assets/icons/', '/design/assets/photos/'];
const PUBLIC_PATTERNS = [
  /^\/design\/assets\/ministry-art-\d+\.jpe?g$/,
  /^\/data\/(youtube-teachings|church-service-source-records|online-communities-source-records)\.json$/
];

// Addresses the app itself draws, so a reload or a shared link lands on the
// page rather than on a 404. Anything else that is not a file stays a 404.
export const APP_ROUTES = [
  /^\/$/,
  /^\/ensinos\/?$/,
  /^\/fontes\/[\w-]+\/?$/,
  /^\/ao-vivo\/?$/,
  /^\/igrejas\/?$/,
  /^\/igrejas\/[\w-]+\/?$/,
  /^\/perfil\/?$/
];

export const isTextType = (type = '') => /^(text\/|application\/(json|manifest\+json)|image\/svg)/.test(type);

// Returns { path, type } for a file that may be served, or { status } when it
// may not: 400 for an address that cannot be decoded, 404 for everything else.
export function resolvePublicPath(root, rawPathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(rawPathname);
  } catch {
    return { status: 400 };
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return { status: 400 };

  // Normalised before the allow-list is consulted, so /src/../server.mjs is
  // judged as /server.mjs and refused.
  let pathname = posix.normalize(decoded);
  if (/^\/admin\/?$/.test(pathname)) pathname = '/admin.html';
  else if (APP_ROUTES.some((route) => route.test(pathname))) pathname = '/index.html';

  if (pathname.split('/').some((segment) => segment.startsWith('.'))) return { status: 404 };
  const allowed = PUBLIC_FILES.has(pathname)
    || PUBLIC_PATTERNS.some((pattern) => pattern.test(pathname))
    || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const type = CONTENT_TYPES[extname(pathname).toLowerCase()];
  if (!allowed || !type) return { status: 404 };

  // Belt and braces: whatever the checks above let through must still resolve
  // inside the project. A plain startsWith(root) would also accept a sibling
  // folder whose name merely begins the same way.
  const base = root.endsWith(sep) ? root : root + sep;
  const path = normalize(join(root, pathname));
  if (!path.startsWith(base)) return { status: 404 };
  return { path, type };
}
