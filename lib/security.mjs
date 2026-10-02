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

// The Zoom client runs on its own document: media and SDK permissions do not
// relax the policy of the account, admin or other application pages.
export function zoomContentSecurityPolicy() {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' https://source.zoom.us https://*.zoom.us https://dmogdx0jrul3u.cloudfront.net blob:",
    "style-src 'self' 'unsafe-inline' https://source.zoom.us",
    "connect-src 'self' https://zoom.us https://*.zoom.us wss://*.zoom.us https://zoom.com https://*.zoom.com wss://*.zoom.com https://zoom.com.cn https://*.zoom.com.cn wss://*.zoom.com.cn https://dmogdx0jrul3u.cloudfront.net",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://source.zoom.us",
    "media-src 'self' blob: https:",
    "worker-src 'self' blob:",
    "frame-src https://*.zoom.us https://*.zoom.com",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"
  ].join('; ');
}

export function securityHeaders({ supabaseUrl = '', https = false, zoomRoom = false } = {}) {
  return {
    'Content-Security-Policy': zoomRoom ? zoomContentSecurityPolicy() : contentSecurityPolicy({ supabaseUrl }),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': zoomRoom ? 'camera=(self), microphone=(self), geolocation=(), payment=()' : 'camera=(), microphone=(), geolocation=(), payment=()',
    ...(https ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {})
  };
}
