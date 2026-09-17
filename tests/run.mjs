// A test runner with no dependencies, so the suite runs on the Node the team
// already has (node:test only arrived in Node 18).
//
//   npm test
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const tests = [];
globalThis.test = (name, fn) => tests.push({ name, fn });

const folder = dirname(fileURLToPath(import.meta.url));
const only = process.argv[2];
for (const file of readdirSync(folder).filter((name) => name.endsWith('.test.mjs')).sort()) {
  if (only && !file.includes(only)) continue;
  const before = tests.length;
  await import(pathToFileURL(join(folder, file)).href);
  tests.slice(before).forEach((entry) => { entry.file = file; });
}

let failed = 0;
for (const { name, fn, file } of tests) {
  try {
    await fn();
    console.log(`  ✓ ${file} › ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  ✗ ${file} › ${name}\n    ${String(error?.stack || error).split('\n').slice(0, 6).join('\n    ')}`);
  }
}
console.log(`\n${tests.length - failed} de ${tests.length} testes passaram.`);
process.exitCode = failed ? 1 : 0;
