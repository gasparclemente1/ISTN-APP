// Reads a local .env into process.env, for development. Values already in the
// environment win, so a hosting dashboard always overrides the file. No
// dependency: the format used here is only KEY=value lines and # comments.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function parseEnv(text) {
  const values = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '');
    values[match[1]] = value;
  }
  return values;
}

export function loadEnvFile(root, env = process.env) {
  const path = join(root, '.env');
  if (!existsSync(path)) return;
  for (const [key, value] of Object.entries(parseEnv(readFileSync(path, 'utf8')))) {
    if (env[key] === undefined) env[key] = value;
  }
}
