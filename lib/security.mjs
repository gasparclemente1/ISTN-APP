// Response headers that limit what a page can do if something slips past the
// escaping — above all, that no script runs unless it came from this server.
//
// The Content-Security-Policy is built from the configured Supabase project,
// because the browser talks to it directly for sign-in, the panel and photo
// uploads, shows the photographs it stores, and plays the prayers the Prophet
// recorded, which are files in that same project.

function originOf(url) {
  try { return new URL(url).origin; } catch { return ''; }
}

export function contentSecurityPolicy({ supabaseUrl = '' } = {}) {
  const supabase = originOf(supabaseUrl);
  const list = (...sources) => sources.filter(Boolean).join(' ');
  return [
    "default-src 'self'",
    "script-src 'self'",
    // Inline style attributes carry computed values (a progress bar's width);
    // they cannot run code, so allowing them costs little.
    list("style-src 'self' 'unsafe-inline'", 'https://fonts.googleapis.com'),
    list("font-src 'self'", 'https://fonts.gstatic.com'),
    list("img-src 'self' data: blob:", 'https://i.ytimg.com https://i3.ytimg.com', supabase),
    // The prayers: played from the project, or from the blob of a recording
    // this phone has already kept.
    list("media-src 'self' blob:", supabase),
    list("connect-src 'self' blob:", supabase),
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ');
}

export function securityHeaders({ supabaseUrl = '', https = false } = {}) {
  return {
    'Content-Security-Policy': contentSecurityPolicy({ supabaseUrl }),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    ...(https ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {})
  };
}
