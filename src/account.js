// The congregation member's own account. Optional by design: everything in the
// app works without one, and this only carries what cannot live on a single
// device — preferences across phones, favourites, and the servant badge.
import { backendConfig } from './data.js';
import { badgeTier, roleLabel, servantName } from './roles.js';

const SESSION_KEY = 'elias-member-session';

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

export async function signIn(email, password) {
  const session = await auth('token?grant_type=password', { email, password });
  writeSession(session);
  return session;
}

export async function register(email, password) {
  const result = await auth('signup', { email, password });
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
  const back = encodeURIComponent(`${location.origin}/`);
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
  if (error) throw new Error(decodeURIComponent(error.replace(/\+/g, ' ')));

  const { supabaseUrl, supabaseKey } = await backendConfig();
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error('Não foi possível concluir a autenticação.');
  const user = await response.json();
  const session = { access_token: accessToken, refresh_token: params.get('refresh_token'), user };
  writeSession(session);
  return session;
}

async function rest(path, options = {}, session = readSession()) {
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
  if (!response.ok) throw Object.assign(new Error(`A base de dados respondeu ${response.status}.`), { status: response.status });
  // return=minimal answers 201 with an empty body, which is not JSON.
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// Reads the member's row, creating it on first sign-in. The badge is read from
// the linked servant, never from anything the member can write.
export async function loadProfile(session = readSession()) {
  if (!session?.user?.id) return null;
  const rows = await rest(`app_users?select=*,servo:servo_id(full_name,role,is_minister,church:church_id(locality,country))&id=eq.${session.user.id}`, {}, session);
  if (rows.length) return rows[0];
  const created = await rest('app_users', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ id: session.user.id, display_name: session.user.email?.split('@')[0] || null })
  }, session);
  return created?.[0] || null;
}

// The directory lives in the database now, so the member can actually pick a
// church — it could not before, when the app read it from a bundled file whose
// records share no id with the table.
export async function loadChurchOptions() {
  return rest('churches?select=id,locality,country,country_code,region,place_type&order=country_code.asc,region.asc,locality.asc');
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

// A verified servant's own number in the directory. Private unless they turn
// it on here; the database lets nobody else turn it on (migration 007).
export async function loadServoContact(servoId, session = readSession()) {
  const rows = await rest(`servo_contacts?select=phone,phone_public&servo_id=eq.${servoId}`, {}, session);
  return rows[0] || null;
}

export async function saveServoContact(servoId, changes, session = readSession()) {
  const rows = await rest('servo_contacts?on_conflict=servo_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ servo_id: servoId, ...changes })
  }, session);
  return rows?.[0] || null;
}

export async function requestServantBadge(note, session = readSession()) {
  return saveProfile({ servo_claim_status: 'pendente', servo_claim_note: note || null }, session);
}

export function badgeFor(profile) {
  const servo = profile?.servo;
  if (profile?.servo_claim_status !== 'aprovado' || !servo) return null;
  const church = servo.church?.locality || servo.church?.country || null;
  return { label: roleLabel(servo.role), role: servo.role, tier: badgeTier(servo.role), isMinister: servo.is_minister, name: servantName(servo), church };
}
