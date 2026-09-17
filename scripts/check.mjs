// Syntax check for every script the server or the browser loads, so a typo in
// a module nobody listed by hand still fails the build.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const files = ['server.mjs', 'sw.js'];
const walk = (folder) => readdirSync(folder, { withFileTypes: true }).forEach((entry) => {
  const path = join(folder, entry.name);
  if (entry.isDirectory()) walk(path);
  else if (/\.m?js$/.test(entry.name)) files.push(path);
});
['src', 'lib', 'tests', 'scripts'].forEach(walk);

let failed = 0;
for (const file of files) {
  try {
    // Through stdin with an explicit type: older Node ignores package.json's
    // "type" for --check on a file. The service worker is a classic script.
    const args = file === 'sw.js' ? ['--check'] : ['--input-type=module', '--check'];
    execFileSync(process.execPath, args, { input: readFileSync(file), stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    failed += 1;
    console.error(`✗ ${file}\n${error.stderr}`);
  }
}
console.log(`${files.length - failed} de ${files.length} ficheiros sem erros de sintaxe.`);
process.exitCode = failed ? 1 : 0;
