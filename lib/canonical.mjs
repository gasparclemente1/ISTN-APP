// One address for the app, so a link shared in a group always opens the same
// place: with CANONICAL_HOST set, a request that arrives at any other name —
// the old istn-sj.onrender.com, or www — is sent to the canonical one.
//
// Two exceptions: the health check, which Render calls by the service's own
// name and must answer 200, and local development.

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|[\w-]+\.local)(:\d+)?$/i;

export function canonicalRedirect({ host = '', pathname = '/', search = '', canonicalHost = '', https = false } = {}) {
  const canonical = String(canonicalHost).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const asked = String(host).trim().toLowerCase();
  if (!canonical || !asked || asked === canonical) return null;
  if (LOCAL.test(asked) || LOCAL.test(canonical)) return null;
  // Render calls /healthz by the service's own address; a redirect there would
  // read as an unhealthy deploy.
  if (pathname === '/healthz') return null;
  // Someone else's name in the Host header must never become a redirect target.
  if (!/^[a-z0-9.-]+(:\d+)?$/.test(canonical)) return null;
  return `https://${canonical}${pathname}${search}`;
}
