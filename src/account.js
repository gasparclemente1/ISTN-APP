// The congregation member's own account. Optional by design: everything in the
// app works without one, and this only carries what cannot live on a single
// device — preferences across phones, favourites, and the servant badge.
import { backendConfig } from './data.js';
import { badgeTier, roleLabel, servantName } from './roles.js';

const SESSION_KEY = 'elias-member-session';

// Sessions last across reloads. An access token expires after an hour, so a
// refused request is retried once with a refreshed token; only a refusal of the
// refresh itself ends the session.
let refreshing = null;

export function readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}

function writeSession(session) {
  try { session ? localStorage.setItem(SESSION_KEY, JSON.stringify(session)) : localStorage.removeItem(SESSION_KEY); } catch { /* modo privado */ }
}

async function auth(path, body) {
  const { supabaseUrl, supabaseKey } = await backendConfig();
  if (!supabaseUrl) throw new Error('As contas ainda não estão configuradas neste servidor.');
  const response = await fetch(`${supabaseUrl}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: supabaseKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const reason = payload?.error_description || payload?.msg || payload?.error || '';
    if (/invalid login credentials/i.test(reason)) throw new Error('Email ou palavra-passe incorretos.');
    if (/already registered/i.test(reason)) throw new Error('Já existe uma conta com este email.');
    if (/password should be/i.test(reason)) throw new Error('A palavra-passe precisa de pelo menos 6 caracteres.');
    throw new Error(reason || 'Não foi possível concluir.');
  }
  return payload;
}

export function refreshSession(session = readSession()) {
  if (!session?.refresh_token) return Promise.reject(new Error('Sessão sem credencial de renovação.'));
  refreshing ||= auth('token?grant_type=refresh_token', { refresh_token: session.refresh_token })
    .then((fresh) => {
      // Supabase omits the user on a refresh; keep the one already known.
      const merged = { ...session, ...fresh, user: fresh.user || session.user };
      writeSession(merged);
      return merged;
    })
    .finally(() => { refreshing = null; });
  return refreshing;
}

export async function signIn(email, password) {
  const session = await auth('token?grant_type=password', { email, password });
  writeSession(session);
  return session;
}

// Where the confirmation email's link brings the person back. Without it,
// Supabase uses the project's Site URL, which is http://localhost:3000 until
// someone changes it — so the link opened a page that does not exist. Supabase
// only honours an address listed in its Redirect URLs (see DEPLOY.md).
export const authReturnUrl = () => `${location.origin}/perfil`;

// The name is asked for here and kept with the account. It is never taken from
// the email address or from the Google profile: people write how they want to
// be called.
export async function register(email, password, displayName) {
  const result = await auth(`signup?redirect_to=${encodeURIComponent(authReturnUrl())}`, {
    email, password, data: { display_name: displayName }
  });
  // Supabase devolve sessão imediata quando a confirmação de email está desligada.
  if (result?.access_token) { writeSession(result); return result; }
  return null;
}

export function signOut() { writeSession(null); }

// Google is the only sign-in besides email and password.
const PROVIDER_LABELS = {
  google: { button: 'Continuar com Google', name: 'Google' }
};

export async function availableProviders() {
  const { providers } = await backendConfig();
  return (providers || []).filter((id) => PROVIDER_LABELS[id]).map((id) => ({ id, label: PROVIDER_LABELS[id].button, name: PROVIDER_LABELS[id].name }));
}

// Hands the browser to the provider. Supabase brings it back to this origin
// with the tokens in the URL fragment, which finishSocialSignIn picks up.
export async function signInWithProvider(provider) {
  const { supabaseUrl } = await backendConfig();
  if (!supabaseUrl) throw new Error('As contas ainda não estão configuradas neste servidor.');
  const back = encodeURIComponent(authReturnUrl());
  location.href = `${supabaseUrl}/auth/v1/authorize?provider=${encodeURIComponent(provider)}&redirect_to=${back}`;
}

// The fragment never reaches a server, which is why the tokens travel there.
// It is cleared from the address bar as soon as it has been read.
export async function finishSocialSignIn() {
  const fragment = location.hash.startsWith('#') ? location.hash.slice(1) : '';
  if (!fragment) return null;
  const params = new URLSearchParams(fragment);
  const error = params.get('error_description') || params.get('error');
  const accessToken = params.get('access_token');
  if (!accessToken && !error) return null;
  history.replaceState(null, '', location.pathname + location.search);
  if (params.get('error_code') === 'otp_expired') {
    throw new Error('Este link de confirmação já foi usado ou expirou. Entre com o seu email e palavra-passe.');
  }
  if (error) throw new Error(decodeURIComponent(error.replace(/\+/g, ' ')));

  const { supabaseUrl, supabaseKey } = await backendConfig();
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error('Não foi possível concluir a autenticação.');
  const user = await response.json();
  const session = { access_token: accessToken, refresh_token: params.get('refresh_token'), user };
  writeSession(session);
  // "signup" when the person arrived from the confirmation email.
  return { ...session, arrivedFrom: params.get('type') || 'provider' };
}

async function rest(path, options = {}, session = readSession(), retry = true) {
  const { supabaseUrl, supabaseKey } = await backendConfig();
  // Without a project there is nothing to ask; a relative /rest/v1 request would
  // only reach this server and fail with a confusing 404.
  if (!supabaseUrl) throw new Error('As contas ainda não estão configuradas neste servidor.');
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${session?.access_token || supabaseKey}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  if (response.status === 401 && retry && session?.refresh_token) {
    const fresh = await refreshSession(session).catch(() => null);
    if (fresh) return rest(path, options, fresh, false);
  }
  if (!response.ok) throw Object.assign(new Error(`A base de dados respondeu ${response.status}.`), { status: response.status });
  // return=minimal answers 201 with an empty body, which is not JSON.
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// Reads the member's row, creating it on first sign-in. The badge is read from
// the linked servant, never from anything the member can write.
export async function loadProfile(session = readSession()) {
  if (!session?.user?.id) return null;
  const rows = await rest(`app_users?select=*,servo:servo_id(full_name,role,is_minister,church:church_id(name,locality,country))&id=eq.${session.user.id}`, {}, session);
  if (rows.length) return rows[0];
  // Only the name the person gave when registering here; never the local part
  // of their email, nor the name Google holds.
  const given = session.user?.user_metadata?.display_name;
  const created = await rest('app_users', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ id: session.user.id, display_name: typeof given === 'string' && given.trim() ? given.trim() : null })
  }, session);
  return created?.[0] || null;
}

// The directory lives in the database now, so the member can actually pick a
// church — it could not before, when the app read it from a bundled file whose
// records share no id with the table.
export async function loadChurchOptions() {
  return rest('churches?select=id,name,locality,country,country_code,region,place_type&order=country_code.asc,region.asc,locality.asc');
}

export async function saveProfile(changes, session = readSession()) {
  const rows = await rest(`app_users?id=eq.${session.user.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(changes)
  }, session);
  return rows?.[0] || null;
}

// Saved teachings follow the account across devices. The device keeps its own
// copy too (src/prefs.js), so they still work signed out or offline.
export async function loadFavorites(session = readSession()) {
  const rows = await rest('favorites?select=teaching_id', {}, session);
  return rows.map((row) => row.teaching_id);
}

export async function addFavorite(teachingId, session = readSession()) {
  await rest('favorites?on_conflict=user_id,teaching_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: session.user.id, teaching_id: teachingId })
  }, session);
}

export async function removeFavorite(teachingId, session = readSession()) {
  await rest(`favorites?user_id=eq.${session.user.id}&teaching_id=eq.${encodeURIComponent(teachingId)}`, { method: 'DELETE' }, session);
}

export async function requestServantBadge(note, session = readSession()) {
  return saveProfile({ servo_claim_status: 'pendente', servo_claim_note: note || null }, session);
}

// Writing in the feed. Every one of these is checked again by the database
// (migration 009): the app only decides what to offer.
export async function createPost({ body, title = null, churchId = null, communityId = null, highlighted = false, highlightUntil = null }, session = readSession()) {
  const rows = await rest('posts', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ body, title, church_id: churchId, community_id: communityId, highlighted, highlight_until: highlightUntil })
  }, session);
  if (!rows?.length) throw new Error('Não tem permissão para publicar.');
  return rows[0];
}

export async function updatePost(id, changes, session = readSession()) {
  const rows = await rest(`posts?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(changes)
  }, session);
  if (!rows?.length) throw new Error('Não tem permissão para alterar esta publicação.');
  return rows[0];
}

export function deletePost(id, session = readSession()) {
  return rest(`posts?id=eq.${id}`, { method: 'DELETE' }, session);
}

export function addPostImages(postId, images, session = readSession()) {
  if (!images.length) return Promise.resolve(null);
  return rest('post_images', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(images.map((image, index) => ({ post_id: postId, url: image.url, caption: image.caption || null, sort_order: index })))
  }, session);
}

export function loadComments(postId) {
  return rest(`post_comments?select=id,post_id,author_id,body,created_at&post_id=eq.${postId}&hidden=eq.false&order=created_at.asc`);
}

// Who reacted, by name. Read straight from the database, not from the server's
// cached feed: it is only asked for when someone opens the list, and it has to
// include the tap they have just made. No account needed — the names beside an
// announcement are as public as the announcement.
export function loadReactionPeople(postId) {
  return rest(`post_reaction_people?select=user_id,kind,display_name,photo_url,servo_role,verified&post_id=eq.${encodeURIComponent(postId)}&order=created_at.desc&limit=200`);
}

export function loadPostAuthors() {
  return rest('post_authors?select=id,display_name,photo_url,servo_role,verified');
}

export async function addComment(postId, body, session = readSession()) {
  const rows = await rest('post_comments', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ post_id: postId, body })
  }, session);
  if (!rows?.length) throw new Error('Só servos verificados podem comentar.');
  return rows[0];
}

export function hideComment(id, hidden, session = readSession()) {
  return rest(`post_comments?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ hidden }) }, session);
}

// One reaction per person per post: setting another replaces it, and the same
// one again removes it.
export function setReaction(postId, kind, session = readSession()) {
  if (!kind) return rest(`post_reactions?post_id=eq.${postId}&user_id=eq.${session.user.id}`, { method: 'DELETE' }, session);
  return rest('post_reactions?on_conflict=post_id,user_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ post_id: postId, user_id: session.user.id, kind })
  }, session);
}

export function loadMyReactions(session = readSession()) {
  if (!session?.user?.id) return Promise.resolve([]);
  return rest(`post_reactions?select=post_id,kind&user_id=eq.${session.user.id}`, {}, session);
}

export function badgeFor(profile) {
  const servo = profile?.servo;
  if (profile?.servo_claim_status !== 'aprovado' || !servo) return null;
  const church = servo.church?.name || servo.church?.locality || servo.church?.country || null;
  return { label: roleLabel(servo.role), role: servo.role, tier: badgeTier(servo.role), isMinister: servo.is_minister, name: servantName(servo), church };
}
