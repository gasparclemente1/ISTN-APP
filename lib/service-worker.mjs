// Serves sw.js stamped with the app's current version and file list.
//
// The service worker used to carry a hand-written version that nobody changed
// and served scripts stale-while-revalidate, so after a deploy a phone ran the
// old app.js against the new data.js — the directory came up empty until a
// second reload. Now the version is a hash of the files themselves: any change
// makes a new service worker, which downloads the whole new set before taking
// over, and within a version every file comes from the same set.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const FIXED = ['index.html', 'manifest.webmanifest', 'src/styles.css', 'design/assets/icons/icon-192.png', 'design/assets/icons/icon-512.png'];

function publicModules(root) {
  const files = [];
  const walk = (folder) => readdirSync(join(root, folder), { withFileTypes: true }).forEach((entry) => {
    const path = `${folder}/${entry.name}`;
    if (entry.isDirectory()) walk(path);
    // The admin panel is never cached: editing through a stale script is worse
    // than being offline.
    else if (entry.name.endsWith('.js') && !entry.name.startsWith('admin')) files.push(path);
  });
  walk('src');
  return files.sort();
}

let memo = { signature: '', body: '' };

export function serviceWorkerScript(root) {
  const files = [...FIXED, ...publicModules(root), 'sw.js'];
  const signature = files.map((file) => {
    const stats = statSync(join(root, file));
    return `${file}:${stats.size}:${stats.mtimeMs}`;
  }).join('|');
  if (memo.signature === signature) return memo.body;

  const hash = createHash('sha1');
  files.forEach((file) => hash.update(file).update(readFileSync(join(root, file))));
  const version = hash.digest('hex').slice(0, 12);
  const shell = ['/', ...files.filter((file) => file !== 'sw.js').map((file) => `/${relative(root, join(root, file)).split(sep).join('/')}`)];
  const body = `self.__ELIAS_VERSION__ = ${JSON.stringify(version)};\nself.__ELIAS_SHELL__ = ${JSON.stringify(shell)};\n${readFileSync(join(root, 'sw.js'), 'utf8')}`;
  memo = { signature, body };
  return body;
}
