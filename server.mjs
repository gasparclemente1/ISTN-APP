import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createGzip } from 'node:zlib';
import { resolvePublicPath, isTextType } from './lib/static.mjs';
import { securityHeaders } from './lib/security.mjs';
import { supabaseConfig } from './lib/supabase.mjs';
import { latestVideos } from './lib/youtube.mjs';

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const config = supabaseConfig();

function send(request, response, status, body, headers = {}) {
  response.writeHead(status, headers);
  response.end(request.method === 'HEAD' ? undefined : body);
}

function sendJson(request, response, status, payload, cache = 'no-cache') {
  send(request, response, status, JSON.stringify(payload), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache });
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

  // The publishable key is meant to reach the browser; row level security is
  // what protects the data. It comes from the environment so that rotating it
  // does not require a commit.
  if (url.pathname === '/api/config') {
    return sendJson(request, response, 200, config, 'no-store');
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
}).listen(port, () => console.log(`ELIAS — ISTN-SJ disponível em http://localhost:${port}`));
