// Uploading a photograph, rather than asking someone to paste a link to one
// that lives somewhere nobody controls and may disappear.
//
// The picture is shrunk in the browser first. A phone camera file is several
// megabytes; what the app shows never needs more than a fraction of that, and
// the congregation is largely on mobile data.
import { backendConfig } from './data.js';

const BUCKET = 'fotos';
const MAX_EDGE = 800;
const QUALITY = 0.82;

export function isImage(file) {
  return !!file && /^image\/(jpeg|png|webp)$/.test(file.type);
}

async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
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

// folder is one of membros, servos, igrejas; the storage policy reads it.
export async function uploadPhoto(file, folder, id, session) {
  if (!isImage(file)) throw new Error('Escolha uma imagem JPEG, PNG ou WebP.');
  const { supabaseUrl, supabaseKey } = await backendConfig();
  if (!supabaseUrl) throw new Error('O armazenamento não está configurado neste servidor.');
  const blob = await shrink(file);
  // The name changes on every upload so a replaced photograph is never served
  // from a cache showing the previous one.
  const path = `${folder}/${id}/${Date.now()}.jpg`;
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`, {
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
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`;
}
