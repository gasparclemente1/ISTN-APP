// The congregation member's own account. Optional by design: everything in the
// app works without one, and this only carries what cannot live on a single
// device — preferences across phones, favourites, and the servant badge.
import { backendConfig } from './data.js';

const SESSION_KEY = 'elias-member-session';

export const ROLE_LABELS = {
  apostolo: 'Apóstolo', bispo: 'Bispo', bispo_auxiliar: 'Bispo Auxiliar',
  pastor: 'Pastor', pastor_auxiliar: 'Pastor Auxiliar', discipulo: 'Discípulo',
  obreiro: 'Obreiro', futuro_obreiro: 'Futuro Obreiro',
  dona: 'Dona', obreira: 'Obreira', futura_obreira: 'Futura Obreira'
};

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

async function rest(path, options = {}, session = readSession()) {
  const { supabaseUrl, supabaseKey } = await backendConfig();
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${session?.access_token || supabaseKey}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  if (!response.ok) throw new Error(`A base de dados respondeu ${response.status}.`);
  return response.status === 204 ? null : response.json();
}

// Reads the member's row, creating it on first sign-in. The badge is read from
// the linked servant, never from anything the member can write.
export async function loadProfile(session = readSession()) {
  if (!session?.user?.id) return null;
  const rows = await rest(`app_users?select=*,servo:servo_id(full_name,role,is_minister)&id=eq.${session.user.id}`, {}, session);
  if (rows.length) return rows[0];
  const created = await rest('app_users', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ id: session.user.id, display_name: session.user.email?.split('@')[0] || null })
  }, session);
  return created?.[0] || null;
}

export async function saveProfile(changes, session = readSession()) {
  const rows = await rest(`app_users?id=eq.${session.user.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(changes)
  }, session);
  return rows?.[0] || null;
}

export async function requestServantBadge(note, session = readSession()) {
  return saveProfile({ servo_claim_status: 'pendente', servo_claim_note: note || null }, session);
}

export function badgeFor(profile) {
  const servo = profile?.servo;
  if (profile?.servo_claim_status !== 'aprovado' || !servo) return null;
  return { label: ROLE_LABELS[servo.role] || servo.role, role: servo.role, isMinister: servo.is_minister };
}
