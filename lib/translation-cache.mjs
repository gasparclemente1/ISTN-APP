import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export function validTranslation(value) {
  return value && typeof value.title === 'string' && value.title.length <= 2000
    && typeof value.body === 'string' && value.body.length <= 30000
    && typeof value.sourceLanguage === 'string' && /^[a-z]{2,3}(?:-[a-zA-Z0-9]+)*$/.test(value.sourceLanguage)
    && ['pt', 'en', 'fr', 'es'].includes(value.targetLanguage);
}

// Public translations only. One cache file per server process/instance, outside
// the static allow-list. If storage is unavailable, memory caching still works.
export function createTranslationCache({ file = '', now = Date.now, ttl = 30 * 86400000, capacity = 500 } = {}) {
  const entries = new Map();
  let writes = Promise.resolve();
  const ready = (async () => {
    if (!file) return;
    try {
      if ((await stat(file)).size > 32 * 1024 * 1024) return;
      const saved = JSON.parse(await readFile(file, 'utf8'));
      if (!Array.isArray(saved)) return;
      for (const row of saved.slice(-capacity)) {
        if (Array.isArray(row) && /^[a-f0-9]{64}$/.test(row[0]) &&
            Number.isFinite(row[1]?.at) && now() >= row[1].at && now() - row[1].at < ttl && validTranslation(row[1].value)) entries.set(row[0], row[1]);
      }
    } catch { /* Missing/corrupt/unwritable cache must not break reading. */ }
  })();
  return {
    async get(key) {
      await ready;
      const hit = entries.get(key);
      if (!hit || now() - hit.at >= ttl) { entries.delete(key); return null; }
      return hit.value;
    },
    async set(key, value) {
      await ready;
      if (!validTranslation(value)) return;
      if (entries.size >= capacity && !entries.has(key)) entries.delete(entries.keys().next().value);
      entries.set(key, { at: now(), value });
      if (!file) return;
      writes = writes.then(async () => {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(`${file}.tmp`, JSON.stringify([...entries]), { mode: 0o600 });
        await rename(`${file}.tmp`, file);
      }).catch(() => { /* Continue with the in-memory cache. */ });
      await writes;
    }
  };
}
