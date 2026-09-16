import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { get } from 'node:https';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const types = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json'
};
const port = Number(process.env.PORT || 4173);
// youtube.com/feeds/videos.xml answers 404/500 for every channel, so the public
// channel page is read instead and its embedded ytInitialData parsed.
const channelPages = new Map([
  ['UCEBWBoys57eU9sPUONUENFQ', 'https://www.youtube.com/@apostolomarcelino/streams'],
  ['UCbc9yF0Dr3rWDmkfsAq3Ntg', 'https://www.youtube.com/@LorenaLopes56/videos']
]);
const browserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const feedCache = new Map();
const cacheLifetime = 10 * 60 * 1000;

function parseChannelPage(html) {
  const match = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
  if (!match) throw new Error('Estrutura da página do YouTube não reconhecida.');
  const lockups = [];
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.lockupViewModel) lockups.push(node.lockupViewModel);
    for (const key in node) walk(node[key]);
  })(JSON.parse(match[1]));
  const seen = new Set();
  return lockups.map((lockup) => {
    const metadata = lockup.metadata?.lockupMetadataViewModel;
    const title = metadata?.title?.content;
    const id = lockup.contentId;
    if (!id || !title || seen.has(id)) return null;
    seen.add(id);
    const parts = metadata.metadata?.contentMetadataViewModel?.metadataRows?.flatMap((row) => row.metadataParts || []) || [];
    const published = parts.map((part) => part.text?.content).find((text) => text && /há|atrás/i.test(text));
    return { title, url: `https://www.youtube.com/watch?v=${id}`, thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, meta: published || '' };
  }).filter(Boolean).slice(0, 6);
}

function requestPage(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    const request = get(url, { headers: { 'User-Agent': browserAgent, 'Accept-Language': 'pt-PT,pt;q=0.9', Cookie: 'CONSENT=YES+1' } }, (response) => {
      const { statusCode, headers } = response;
      if (statusCode >= 300 && statusCode < 400 && headers.location && redirects > 0) {
        response.resume();
        requestPage(new URL(headers.location, url).toString(), redirects - 1).then(resolve, reject);
        return;
      }
      if (statusCode !== 200) { response.resume(); reject(new Error(`YouTube respondeu ${statusCode}`)); return; }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve(body));
    });
    request.setTimeout(10000, () => request.destroy(new Error('Tempo limite ao consultar o YouTube.')));
    request.on('error', reject);
  });
}

async function requestFeedWithRetry(channelId, attempts = 3) {
  const url = channelPages.get(channelId);
  for (let attempt = 1; ; attempt += 1) {
    try {
      return parseChannelPage(await requestPage(url));
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 400));
    }
  }
}

createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host}`);
  if (url.pathname === '/api/latest-videos') {
    const channelId = url.searchParams.get('channel');
    if (!channelPages.has(channelId)) { response.writeHead(400, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: 'Canal inválido.' })); return; }
    const cached = feedCache.get(channelId);
    if (cached && Date.now() - cached.createdAt < cacheLifetime) { response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }); response.end(JSON.stringify(cached.payload)); return; }
    requestFeedWithRetry(channelId).then((videos) => {
      const payload = { channelId, updatedAt: new Date().toISOString(), videos };
      feedCache.set(channelId, { createdAt: Date.now(), payload });
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }); response.end(JSON.stringify(payload));
    }).catch(() => {
      if (cached) { response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }); response.end(JSON.stringify({ ...cached.payload, stale: true })); return; }
      response.writeHead(502, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: 'Não foi possível consultar o YouTube agora.' }));
    });
    return;
  }
  // The publishable key is meant to reach the browser; row level security is
  // what protects the data. It comes from the environment so that rotating it
  // does not require a commit.
  if (url.pathname === '/api/config') {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ supabaseUrl: process.env.SUPABASE_URL || '', supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY || '' }));
    return;
  }
  const requested = url.pathname === '/' ? '/index.html'
    : url.pathname === '/admin' || url.pathname === '/admin/' ? '/admin.html'
    : url.pathname;
  const path = normalize(join(root, decodeURIComponent(requested)));
  if (!path.startsWith(root) || !existsSync(path) || statSync(path).isDirectory()) {
    response.writeHead(404); response.end('Not found'); return;
  }
  response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  createReadStream(path).pipe(response);
}).listen(port, () => console.log(`ELIAS — ISTN-SJ disponível em http://localhost:${port}`));
