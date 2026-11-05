import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as records from '../src/admin-records.js';
import * as roles from '../src/roles.js';
import * as countries from '../src/countries.js';
import * as directory from '../src/directory.js';
import { escapeHtml } from '../src/html.js';

function workspace() {
  const root = { querySelectorAll: () => [] };
  const source = readFileSync(new URL('../src/admin.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/start\(\);\s*$/, '');
  const context = vm.createContext({ ...records, ...roles, ...countries, ...directory, escapeHtml, setLanguage: () => {}, document: { querySelector: () => root }, window: { addEventListener: () => {} } });
  vm.runInContext(source + '\nglobalThis.panel = { state, visibleChurches, visibleServos, listState, churchesView, servosView, pager };', context);
  const panel = context.panel;
  panel.state.profile = { role: 'central', church_id: 'ao' };
  panel.state.churches = [{ id: 'ao', country_code: 'AO', name: 'Kifica', leader_name: 'Sérgio', leader_phone: '+244 934 018 899' }, { id: 'pt', country_code: 'PT', name: 'Lisboa', verification_status: 'verified' }];
  panel.state.servos = [{ id: 'a', full_name: 'João', role: 'pastor', church_id: 'ao', phone: '+244 934 018 899' }, { id: 'b', full_name: 'Maria', role: 'dona', church_id: 'pt', active: false }];
  return panel;
}
test('directório combina pesquisa, país e estado sem perder as restrições do editor local', () => {
  const p = workspace(); const prefs = p.listState('churches');
  prefs.query = '934018899'; assert.equal(p.visibleChurches().length, 1);
  prefs.country = 'PT'; assert.equal(p.visibleChurches().length, 0);
  prefs.query = ''; prefs.status = 'verified'; assert.equal(p.visibleChurches()[0].id, 'pt');
  p.state.profile.role = 'local'; assert.equal(p.visibleChurches().length, 0);
});
test('servos combinam país, igreja, função e estado; editor local vê apenas a sua igreja', () => {
  const p = workspace(); const prefs = p.listState('servos');
  prefs.country = 'PT'; prefs.role = 'dona'; prefs.status = 'inactive';
  assert.equal(p.visibleServos()[0].id, 'b');
  prefs.church = 'ao'; assert.equal(p.visibleServos().length, 0);
  Object.assign(prefs, { country: '', role: '', status: '', church: '' });
  p.state.profile.role = 'local'; assert.equal(p.visibleServos().length, 1);
  assert.equal(p.visibleServos()[0].id, 'a');
});
test('resultados vazios e paginação mostram contagens válidas; dados são escapados', () => {
  const p = workspace(); p.listState('churches').query = 'inexistente';
  const html = p.churchesView(); assert.match(html, /0–0 de 0 registos/); assert.match(html, /disabled aria-label="Página seguinte"/);
  p.listState('churches').query = ''; p.state.churches[0].leader_name = '<script>bad()</script>';
  assert.ok(!p.churchesView().includes('<script>bad()'));
  assert.match(p.churchesView(), /&lt;script&gt;/);
});
