import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { countriesIn, filterChurches, normalizeChurch, placeKindLabel, regionsIn, rowsFromSourceRecords, serviceLabel, sharedPhones, sortChurches } from '../src/directory.js';
import { foldText, matchesQuery } from '../src/text.js';

const read = (name) => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url)));
const churches = sortChurches(rowsFromSourceRecords(read('church-service-source-records.json'), read('online-communities-source-records.json')).map((row) => normalizeChurch(row)));

test('os ficheiros de origem ficam com os mesmos ids que o seed lhes deu', () => {
  assert.equal(churches.length, 85);
  assert.ok(churches.some((church) => church.id === 'source_record_001' && church.name === 'Kifica'));
  const usa = churches.find((church) => church.id === 'online_record_001');
  assert.equal(usa.country, 'Estados Unidos da América');
  assert.equal(usa.modality, 'online');
  assert.equal(usa.leaderPhone, '+244 923 409 830');
});

test('nada é corrigido: abreviaturas e números ficam como vieram', () => {
  const kifica = churches.find((church) => church.id === 'source_record_001');
  assert.equal(kifica.leaderName, 'Bp. Rufino Boaz');
  assert.equal(kifica.verificationStatus, 'needs_review');
  assert.deepEqual(kifica.services, [{ weekday: 0, time: '09:00', label: null }]);
});

test('um lugar sem tipo confirmado não é chamado igreja', () => {
  assert.equal(placeKindLabel({ modality: 'physical', placeType: null }), 'Local presencial');
  assert.equal(placeKindLabel({ modality: 'physical', placeType: 'casa_de_oracao' }), 'Casa de oração');
  assert.equal(placeKindLabel({ modality: 'physical', placeType: 'igreja' }), 'Igreja');
  assert.equal(placeKindLabel({ modality: 'online' }), 'Comunidade online');
});

test('da base de dados: vários horários, servos da igreja e ids estáveis', () => {
  const church = normalizeChurch({
    id: 'uuid-1', record_id: 'source_record_001', modality: 'physical', place_type: 'igreja', country_code: 'AO', locality: 'Kifica',
    church_services: [{ weekday: 0, start_time: '09:00:00', label: null }, { weekday: 6, start_time: null, label: 'Culto dos servos' }]
  }, [{ church_id: 'uuid-1', full_name: 'Rufino Boaz', role: 'bispo' }, { church_id: 'uuid-1', full_name: 'Inativo', role: 'obreiro', active: false }, { church_id: 'outra', full_name: 'X', role: 'pastor' }]);
  assert.equal(church.id, 'source_record_001');
  assert.equal(church.dbId, 'uuid-1');
  assert.equal(church.country, 'Angola');
  assert.deepEqual(church.services.map(serviceLabel), ['Domingo, 09:00', 'Sábado, hora a confirmar · Culto dos servos']);
  assert.deepEqual(church.servants.map((servant) => servant.name), ['Bp. Rufino Boaz']);
});

test('pesquisa sem acentos, por palavras, só nos campos que as pessoas procuram', () => {
  assert.equal(foldText('  São Tomé  e Príncipe '), 'sao tome e principe');
  assert.ok(matchesQuery(['Kifica', 'Luanda'], 'luanda kifica'));
  assert.ok(!matchesQuery(['Kifica', 'Luanda'], 'luanda benfica'));
  assert.equal(filterChurches(churches, { query: 'phone' }).length, 0);
  assert.equal(filterChurches(churches, { query: 'modality' }).length, 0);
  assert.ok(filterChurches(churches, { query: 'sao paulo' }).length > 0);
});

test('países ordenados e regiões dependentes do país', () => {
  const countries = countriesIn(churches);
  assert.deepEqual(countries, [...countries].sort((a, b) => a.localeCompare(b, 'pt')));
  assert.ok(regionsIn(churches, 'Portugal').includes('Lisboa'));
  assert.ok(!regionsIn(churches, 'Portugal').includes('Luanda'));
  assert.ok(filterChurches(churches, { country: 'Portugal', region: 'Lisboa' }).every((church) => church.region === 'Lisboa'));
});

test('números repetidos em vários registos são assinalados para revisão', () => {
  const shared = sharedPhones(churches);
  assert.ok(shared.has('244923409830'));
  assert.ok(shared.get('244923409830').length >= 3);
});
