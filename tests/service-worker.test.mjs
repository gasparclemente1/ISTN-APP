import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serviceWorkerScript } from '../lib/service-worker.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (script) => {
  const version = script.match(/__ELIAS_VERSION__ = "([^"]+)"/)[1];
  const shell = JSON.parse(script.match(/__ELIAS_SHELL__ = (\[.*\]);/)[1]);
  return { version, shell };
};

test('a lista guardada para uso offline tem todos os módulos da app e nenhum do painel', () => {
  const { shell } = read(serviceWorkerScript(root));
  const modules = [];
  const walk = (folder) => readdirSync(join(root, folder), { withFileTypes: true }).forEach((entry) => {
    if (entry.isDirectory()) walk(`${folder}/${entry.name}`);
    else if (entry.name.endsWith('.js')) modules.push(`/${folder}/${entry.name}`);
  });
  walk('src');
  modules.filter((path) => !path.includes('/admin')).forEach((path) => assert.ok(shell.includes(path), path));
  assert.ok(!shell.some((path) => path.includes('admin')));
  assert.ok(shell.includes('/') && shell.includes('/src/styles.css'));
});

test('mudar qualquer ficheiro da app muda a versão', () => {
  const copy = mkdtempSync(join(tmpdir(), 'elias-sw-'));
  try {
    for (const item of ['index.html', 'manifest.webmanifest', 'sw.js', 'src', 'design/assets/icons']) {
      cpSync(join(root, item), join(copy, item), { recursive: true });
    }
    const before = read(serviceWorkerScript(copy)).version;
    const file = join(copy, 'src', 'html.js');
    writeFileSync(file, '// alterado\n', { flag: 'a' });
    utimesSync(file, new Date(), new Date(Date.now() + 5000));
    assert.notEqual(read(serviceWorkerScript(copy)).version, before);
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
});
