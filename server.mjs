import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createGzip, gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { APP_ROUTES, resolvePublicPath, isTextType } from './lib/static.mjs';
import { PREVIEW_BOTS, previewFor, sectionPreview, withPreview } from './lib/link-preview.mjs';
import { securityHeaders } from './lib/security.mjs';
import { createProviderLookup, supabaseConfig } from './lib/supabase.mjs';
import { latestVideos } from './lib/youtube.mjs';
import { createPublicData } from './lib/public-data.mjs';
import { buildCalendar } from './src/calendar.js';
import { serviceWorkerScript } from './lib/service-worker.mjs';
import { loadEnvFile } from './lib/env.mjs';

const root = process.cwd();
loadEnvFile(root);
const port = Number(process.env.PORT || 4173);
const config = supabaseConfig();
const publicData = createPublicData({ config, root });
const signInProviders = createProviderLookup(config);
if (!publicData.configured) console.warn('SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY em falta: reuniões indisponíveis e diretório lido dos ficheiros de origem.');

function send(request, response, status, body, headers = {}) {
  response.writeHead(status, headers);
  response.end(request.method === 'HEAD' ? undefined : body);
}

// The directory is some 40 KB of JSON; compressed it is a fraction of that,
// which is what matters to someone on mobile data.
function sendJson(request, response, status, payload, cache = 'no-cache') {
  const body = JSON.stringify(payload);
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache, Vary: 'Accept-Encoding' };
  if (body.length > 1024 && /\bgzip\b/.test(request.headers['accept-encoding'] || '')) {
    return send(request, response, status, gzipSync(body), { ...headers, 'Content-Encoding': 'gzip' });
  }
  return send(request, response, status, body, headers);
}

function sendFile(request, response, { path, type }) {
  let stats;
  try { stats = statSync(path); } catch { return send(request, response, 404, 'Not found'); }
  if (!stats.isFile()) return send(request, response, 404, 'Not found');

  // A weak validator is enough to spare a phone on mobile data from downloading
  // a file it already has.
  const etag = `W/"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`;
  const headers = {
    'Content-Type': type,
    ETag: etag,
    // Images change by being replaced under a new name; code and data change in
    // place and must be revalidated every time.
    'Cache-Control': type.startsWith('image/') && !type.includes('svg') ? 'public, max-age=604800' : 'no-cache',
    Vary: 'Accept-Encoding'
  };
  if (request.headers['if-none-match'] === etag) return send(request, response, 304, undefined, headers);

  const gzip = isTextType(type) && /\bgzip\b/.test(request.headers['accept-encoding'] || '');
  if (gzip) headers['Content-Encoding'] = 'gzip';
  else headers['Content-Length'] = stats.size;
  response.writeHead(200, headers);
  if (request.method === 'HEAD') { response.end(); return; }
  const stream = createReadStream(path);
  stream.on('error', () => response.destroy());
  (gzip ? stream.pipe(createGzip()) : stream).pipe(response);
}

async function handle(request, response) {
  const url = new URL(request.url || '/', 'http://localhost');
  const https = request.headers['x-forwarded-proto'] === 'https';
  for (const [name, value] of Object.entries(securityHeaders({ supabaseUrl: config.supabaseUrl, https }))) {
    response.setHeader(name, value);
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return send(request, response, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
  }

  if (url.pathname === '/healthz') return sendJson(request, response, 200, { ok: true }, 'no-store');

  if (url.pathname === '/api/latest-videos') {
    try {
      const payload = await latestVideos(url.searchParams.get('channel'));
      if (!payload) return sendJson(request, response, 400, { error: 'Canal inválido.' });
      return sendJson(request, response, 200, payload);
    } catch {
      return sendJson(request, response, 502, { error: 'Não foi possível consultar o YouTube agora.' });
    }
  }

  if (url.pathname === '/api/meetings') {
    try {
      return sendJson(request, response, 200, await publicData.meetings());
    } catch (error) {
      return sendJson(request, response, error.status || 502, { error: 'Não foi possível carregar a programação.' }, 'no-store');
    }
  }

  if (url.pathname === '/api/posts') {
    try {
      return sendJson(request, response, 200, await publicData.posts({ fresh: url.searchParams.get('novo') === '1' }));
    } catch {
      return sendJson(request, response, 502, { error: 'Não foi possível carregar os anúncios.' }, 'no-store');
    }
  }

  if (url.pathname === '/api/directory') {
    try {
      return sendJson(request, response, 200, await publicData.directory());
    } catch {
      return sendJson(request, response, 502, { error: 'Não foi possível carregar o diretório.' }, 'no-store');
    }
  }

  // A feed a phone's calendar can subscribe to, and re-read on its own when the
  // team changes a meeting.
  if (url.pathname === '/calendario.ics') {
    try {
      const { meetings } = await publicData.meetings();
      return send(request, response, 200, buildCalendar(meetings), {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="reunioes-istn-sj.ics"',
        'Cache-Control': 'no-cache'
      });
    } catch (error) {
      return send(request, response, error.status || 502, 'Programação indisponível.', { 'Content-Type': 'text/plain; charset=utf-8' });
    }
  }

  // The publishable key is meant to reach the browser; row level security is
  // what protects the data. It comes from the environment so that rotating it
  // does not require a commit.
  if (url.pathname === '/api/config') {
    return sendJson(request, response, 200, { ...config, providers: await signInProviders() }, 'no-store');
  }

  if (url.pathname === '/sw.js') {
    return send(request, response, 200, serviceWorkerScript(root), { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
  }

  // Every page of the app is index.html, with the tags a shared link's
  // preview reads. Only WhatsApp and the like wait for the church's or the
  // announcement's own; a person gets the page at once.
  if (APP_ROUTES.some((route) => route.test(url.pathname))) {
    const host = /^[\w.-]+(:\d+)?$/.test(request.headers.host || '') ? request.headers.host : 'localhost';
    let preview = sectionPreview(url.pathname);
    if (PREVIEW_BOTS.test(request.headers['user-agent'] || '')) {
      const load = { directory: () => publicData.directory(), posts: () => publicData.posts() };
      const late = new Promise((resolve) => { setTimeout(() => resolve(preview), 2500).unref(); });
      preview = await Promise.race([previewFor(url.pathname, load).catch(() => preview), late]);
    }
    const html = withPreview(readFileSync(join(root, 'index.html'), 'utf8'), preview, { origin: `${https ? 'https' : 'http'}://${host}`, pathname: url.pathname });
    return send(request, response, 200, html, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  }

  const resolved = resolvePublicPath(root, url.pathname);
  if (resolved.status) return send(request, response, resolved.status, resolved.status === 400 ? 'Bad request' : 'Not found');
  return sendFile(request, response, resolved);
}

createServer((request, response) => {
  // One bad request must never take the whole app down for everyone else.
  handle(request, response).catch((error) => {
    console.error(error);
    if (!response.headersSent) send(request, response, 500, 'Internal error');
    else response.destroy();
  });
}).listen(port, () => console.log(`ISTN-SJ disponível em http://localhost:${port}`));
