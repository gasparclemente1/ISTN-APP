// Uploading a photograph, rather than asking someone to paste a link to one
// that lives somewhere nobody controls and may disappear.
//
// The picture is shrunk in the browser first. A phone camera file is several
// megabytes; what the app shows never needs more than a fraction of that, and
// the congregation is largely on mobile data.
import { backendConfig } from './data.js';

const MAX_EDGE = 800;
const QUALITY = 0.82;

export function isImage(file) {
  return !!file && /^image\/(jpeg|png|webp)$/.test(file.type);
}

async function shrink(file, maxEdge) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
  if (!blob) throw new Error('Não foi possível processar a imagem.');
  return blob;
}

export const AUDIO_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/wav'];

// A prayer's recording, sent whole: unlike a photograph there is nothing
// useful to do to it in the browser, and anything done to it would be done to
// the Prophet's voice.
export async function uploadAudio(file, session) {
  if (!file || !AUDIO_TYPES.includes(file.type)) throw new Error('Escolha um áudio MP3, M4A, AAC, OGG ou WAV.');
  const { supabaseUrl, supabaseKey } = await backendConfig();
  if (!supabaseUrl) throw new Error('O armazenamento não está configurado neste servidor.');
  const extension = (file.name.match(/\.(mp3|m4a|aac|ogg|wav)$/i)?.[1] || 'mp3').toLowerCase();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  const response = await fetch(`${supabaseUrl}/storage/v1/object/oracoes/${path}`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${session?.access_token || supabaseKey}`,
      'Content-Type': file.type,
      'x-upsert': 'true'
    },
    body: file
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.message || `O carregamento falhou (${response.status}).`);
  }
  return { url: `${supabaseUrl}/storage/v1/object/public/oracoes/${path}`, bytes: file.size };
}

// How long the recording is, read from the file itself: nobody should have to
// count minutes by hand, and a wrong number would mislead whoever is choosing
// what to send.
export function audioDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const probe = new Audio();
    const done = (value) => { URL.revokeObjectURL(url); resolve(value); };
    probe.addEventListener('loadedmetadata', () => done(Number.isFinite(probe.duration) ? Math.round(probe.duration) : null));
    probe.addEventListener('error', () => done(null));
    probe.preload = 'metadata';
    probe.src = url;
  });
}

// folder is one of membros, servos, igrejas in the 'fotos' bucket; an
// announcement's images go to 'publicacoes', under the writer's own id, which
// is what that bucket's policy reads.
export async function uploadPhoto(file, folder, id, session, { bucket = 'fotos', maxEdge = MAX_EDGE } = {}) {
  if (!isImage(file)) throw new Error('Escolha uma imagem JPEG, PNG ou WebP.');
  const { supabaseUrl, supabaseKey } = await backendConfig();
  if (!supabaseUrl) throw new Error('O armazenamento não está configurado neste servidor.');
  const blob = await shrink(file, maxEdge);
  // The name changes on every upload so a replaced photograph is never served
  // from a cache showing the previous one.
  const path = folder ? `${folder}/${id}/${Date.now()}.jpg` : `${id}/${Date.now()}.jpg`;
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${session?.access_token || supabaseKey}`,
      'Content-Type': 'image/jpeg',
      'x-upsert': 'true'
    },
    body: blob
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.message || `O carregamento falhou (${response.status}).`);
  }
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
}
