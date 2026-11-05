import assert from 'node:assert/strict';
import { matchesRecord, recordPage, readAllPages, sortRecords } from '../src/admin-records.js';

test('pesquisa encontra palavras em qualquer ordem e sem acentos', () => {
  assert.ok(matchesRecord(['Sérgio Matuca', 'Huambo', 'Cidade Baixa'], [], 'baixa sergio'));
  assert.equal(matchesRecord(['Sérgio', 'Huambo'], [], 'sergio lisboa'), false);
});
test('pesquisa por telefone ignora espaços, mas não junta números nem ignora palavras', () => {
  assert.ok(matchesRecord(['Sérgio'], ['+244 934 018 899'], '934018899'));
  assert.ok(matchesRecord([], ['+244 934 018 899'], '+244 (934) 018-899'));
  assert.equal(matchesRecord([], ['1234', '5678'], '3456'), false);
  assert.equal(matchesRecord([], ['+244 934 018 899'], 'outra pessoa 934018899'), false);
});
test('paginação limita os resultados e ajusta a página depois de filtrar', () => {
  const rows = Array.from({ length: 76 }, (_, i) => i);
  const last = recordPage(rows, 4, 25);
  assert.deepEqual(last.rows, [75]);
  assert.equal(last.from, 76); assert.equal(last.to, 76);
  const filtered = recordPage(rows.slice(0, 2), 4, 25);
  assert.equal(filtered.page, 1); assert.deepEqual(filtered.rows, [0, 1]);
  assert.equal(recordPage([], 3, 25).from, 0);
  assert.equal(recordPage([], 3, 25).pages, 1);
});
test('ordenação por nome não altera a fila original', () => {
  const rows = [{ name: 'Zango 10' }, { name: 'Álvaro' }, { name: 'Zango 2' }];
  assert.deepEqual(sortRecords(rows, (r) => r.name).map((r) => r.name), ['Álvaro', 'Zango 2', 'Zango 10']);
  assert.equal(rows[0].name, 'Zango 10');
});
test('leitura em blocos inclui registos posteriores ao limite de 1000 linhas', async () => {
  const all = Array.from({ length: 1201 }, (_, id) => ({ id }));
  const calls = [];
  const rows = await readAllPages(async (url) => {
    calls.push(url); const query = new URLSearchParams(url.split('?')[1]);
    const start = Number(query.get('offset'));
    return all.slice(start, start + Number(query.get('limit')));
  }, 'servos?select=*&order=id.asc');
  assert.equal(rows.length, 1201); assert.equal(rows.at(-1).id, 1200);
  assert.equal(calls.length, 3); assert.match(calls.at(-1), /offset=1000/);
});
test('falha numa página não devolve silenciosamente uma lista incompleta', async () => {
  await assert.rejects(readAllPages(async (url) => {
    if (url.includes('offset=500')) throw new Error('ligação indisponível');
    return Array(500).fill({ id: 1 });
  }, 'churches?select=*&order=id.asc'), /ligação indisponível/);
});
