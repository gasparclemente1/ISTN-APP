// How the server reaches the Supabase project: its address and publishable key
// from the environment, and a small JSON GET that works without a global fetch
// (Node 17 has none, and Render may run an older runtime than the laptop).
import { get as httpGet } from 'node:http';
import { get as httpsGet } from 'node:https';

export const SIGN_IN_PROVIDERS = ['google'];

// Supabase shows the project id more prominently than the URL, so accept
// either: a bare id becomes https://<id>.supabase.co.
export function supabaseConfig(env = process.env) {
  const configured = (env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const supabaseUrl = !configured ? ''
    : /^https?:\/\//.test(configured) ? configured
    : `https://${configured}.supabase.co`;
  // Google is the only sign-in offered besides email. It is advertised only when
  // listed, since a button that leads to "provider is not enabled" is worse than
  // no button; anything else listed is ignored.
  const providers = (env.SUPABASE_OAUTH_PROVIDERS || '').split(',').map((name) => name.trim().toLowerCase())
    .filter((name) => SIGN_IN_PROVIDERS.includes(name));
  return { supabaseUrl, supabaseKey: (env.SUPABASE_PUBLISHABLE_KEY || '').trim(), providers };
}

export function getJson(url, { headers = {}, timeout = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const get = url.startsWith('https:') ? httpsGet : httpGet;
    const request = get(url, { headers: { Accept: 'application/json', ...headers } }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Supabase respondeu ${response.statusCode}.`));
          return;
        }
        try { resolve(JSON.parse(body)); } catch { reject(new Error('Resposta inválida do Supabase.')); }
      });
    });
    request.setTimeout(timeout, () => request.destroy(new Error('Tempo limite ao consultar o Supabase.')));
    request.on('error', reject);
  });
}

// A read-only query against the REST API, as the anonymous role: exactly what
// any visitor could ask for, so the server never sees more than the public.
export function restGet(config, path, fetchJson = getJson) {
  return fetchJson(`${config.supabaseUrl}/rest/v1/${path}`, {
    headers: { apikey: config.supabaseKey, Authorization: `Bearer ${config.supabaseKey}` }
  });
}
