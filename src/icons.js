// Line icons drawn to one 24-unit grid, so the interface reads as a set.
//
// These replace the Unicode symbols the app used before (♧ for a bell, ♙ for a
// person): those looked different on every phone and were read aloud by screen
// readers as "black club suit". An icon here is decorative by default and
// hidden from assistive technology; pass a label when the icon is the only
// thing that says what a control does.

const PATHS = {
  home: '<path d="M4 10.5 12 4l8 6.5V20h-5.5v-5.5h-5V20H4z"/>',
  book: '<path d="M4.5 5.6c2.5-1 5-1 7.5.5v13c-2.5-1.5-5-1.5-7.5-.5zM19.5 5.6c-2.5-1-5-1-7.5.5v13c2.5-1.5 5-1.5 7.5-.5z"/>',
  live: '<circle cx="12" cy="12" r="2.2"/><path d="M8.2 15.8a5.4 5.4 0 0 1 0-7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.3 18.7a9.5 9.5 0 0 1 0-13.4M18.7 5.3a9.5 9.5 0 0 1 0 13.4"/>',
  church: '<path d="M6.5 20.5V10.5L12 6l5.5 4.5v10M4 20.5h16"/><path d="M10.2 20.5v-4.2a1.8 1.8 0 0 1 3.6 0v4.2"/><path d="M12 6V3.5"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.8 19.5c1.2-3.4 4-5.2 7.2-5.2s6 1.8 7.2 5.2"/>',
  users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.9-3 3-4.6 5.5-4.6s4.6 1.6 5.5 4.6M15.5 5.6a3.2 3.2 0 0 1 0 5.8M17.3 14.6c1.6.6 2.7 2.1 3.2 4.4"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  play: '<path d="M8.5 5.5v13l10-6.5z" fill="currentColor"/>',
  pause: '<path d="M9 5.5v13M15 5.5v13" stroke-width="2.6"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  phone: '<path d="M6.5 4h3l1.5 4-2 1.3a10 10 0 0 0 5.7 5.7L16 13l4 1.5v3A2 2 0 0 1 18 19.5C10.5 19 5 13.5 4.5 6A2 2 0 0 1 6.5 4z"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  more: '<circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  eyeOff: '<path d="M4 4l16 16"/><path d="M9.8 5.3A9.3 9.3 0 0 1 12 5c5.5 0 9.2 6 9.2 6a15 15 0 0 1-3.4 3.9M6.4 7.4A15.4 15.4 0 0 0 2.8 11S6.5 17 12 17c1.3 0 2.5-.3 3.5-.8"/><path d="M10 10a2.8 2.8 0 0 0 3.9 3.9"/>',
  eye: '<path d="M2.8 12S6.5 6 12 6s9.2 6 9.2 6-3.7 6-9.2 6-9.2-6-9.2-6z"/><circle cx="12" cy="12" r="2.8"/>',
  external: '<path d="M14 4.5h5.5V10M19.5 4.5 11 13M17 13.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5.5"/>',
  bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/>',
  globe: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.4 2.3 3.6 5 3.6 8s-1.2 5.7-3.6 8c-2.4-2.3-3.6-5-3.6-8s1.2-5.7 3.6-8z"/>',
  pin: '<path d="M12 20.5s-6.2-5.6-6.2-10.6a6.2 6.2 0 0 1 12.4 0c0 5-6.2 10.6-6.2 10.6z"/><circle cx="12" cy="9.9" r="2.3"/>',
  share: '<circle cx="17.5" cy="5.5" r="2.3"/><circle cx="6.5" cy="12" r="2.3"/><circle cx="17.5" cy="18.5" r="2.3"/><path d="m8.5 10.9 7-4.3M8.5 13.1l7 4.3"/>',
  heart: '<path d="M12 19.5s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.6-7.5 10-7.5 10z"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 4 3 19.5h18z"/><path d="M12 10v4.5M12 17.2v.1"/>',
  info: '<circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8v.1"/>',
  navigation: '<path d="m4 11 16-7-7 16-2-7z"/>',
  message: '<path d="M5.2 18.8 6 15.5A7.5 7.5 0 1 1 9 18.3z"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevron: '<path d="M9.5 6l6 6-6 6"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/>',
  download: '<path d="M12 4.5v11M7 11l5 5 5-5M5 19.5h14"/>',
  camera: '<path d="M4 8.5h3l1.6-2.3h6.8L17 8.5h3v10H4z"/><circle cx="12" cy="13.2" r="3.2"/>',
  gender: '<circle cx="12" cy="9" r="4.2"/><path d="M12 13.2V20M9 17h6"/>',
  language: '<path d="M4 6h9M8.5 4v2M6 6c.6 3.6 3 6.4 6 8M11 6c-.8 3.8-3.4 6.8-7 8.5"/><path d="M13 20l3.5-9 3.5 9M14.2 17h4.6"/>',
  mail: '<rect x="3.8" y="6" width="16.4" height="12" rx="2"/><path d="M4.5 7l7.5 6 7.5-6"/>',
  logout: '<path d="M14 5H6.5v14H14"/><path d="M11 12h9M17 8.5l3.5 3.5-3.5 3.5"/>',
  badge: '<path d="M12 3.5l2.2 1.6 2.7-.2.9 2.6 2.2 1.6-.9 2.6.9 2.6-2.2 1.6-.9 2.6-2.7-.2L12 20.5l-2.2-1.6-2.7.2-.9-2.6-2.2-1.6.9-2.6-.9-2.6 2.2-1.6.9-2.6 2.7.2z"/><path d="M8.8 12.2l2.2 2.2 4.2-4.4"/>',
  pray: '<path d="M12 20.5c-2.6 0-4.6-1.2-4.6-1.2l2-3.1M12 20.5c2.6 0 4.6-1.2 4.6-1.2l-2-3.1"/><path d="M9.4 16.2 8 8.6a1.6 1.6 0 0 1 3.1-.7l.9 3.1.9-3.1a1.6 1.6 0 0 1 3.1.7l-1.4 7.6z"/><path d="M12 11V4.2"/>',
  megaphone: '<path d="M4 13.5v-3.2l11-3.8v10.8z"/><path d="M6.8 14.3v4.2h2.6v-3.3"/><path d="M17.5 9.8a3 3 0 0 1 0 4.4"/>',
  edit: '<path d="M5 19h3.2l9-9-3.2-3.2-9 9z"/><path d="M14.5 5.5 17 3l3.5 3.5-2.5 2.5"/>',
  sun: '<path d="M12 3.2l2.1 6.7 6.7 2.1-6.7 2.1L12 20.8l-2.1-6.7L3.2 12l6.7-2.1z" fill="currentColor" stroke="none"/>'
};

export function icon(name, { size = 20, label = '', className = '' } = {}) {
  const body = PATHS[name] || PATHS.info;
  const a11y = label ? `role="img" aria-label="${label.replace(/"/g, '&quot;')}"` : 'aria-hidden="true" focusable="false"';
  return `<svg class="ui-icon ${className}" viewBox="0 0 24 24" width="${size}" height="${size}" ${a11y} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
