import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  countriesIn, countryFlag, countryPresence, filterChurches, findChurch, groupDirectory, nextService, normalizeChurch,
  placeKindLabel, regionsIn, rowsFromDirectoryFile, serviceDaysIn, serviceLabel, sharedPhones, sortChurches, weekdayIn
} from '../src/directory.js';
import { foldText, matchesQuery } from '../src/text.js';

const file = JSON.parse(readFileSync(new URL('../data/igrejas.json', import.meta.url)));
const churches = sortChurches(rowsFromDirectoryFile(file).map((row) => normalizeChurch(row)));
const byId = (id) => churches.find((church) => church.id === id);

test('a lista geral: um registo por lugar, com todos os cultos e os ids de antes', () => {
  assert.equal(churches.length, 73);
  assert.equal(churches.filter((church) => church.modality === 'online').length, 10);
  const kifica = byId('ao-kifica');
  assert.deepEqual(kifica.formerIds, ['source_record_001', 'source_record_064']);
  // Quinta, sábado e domingo: a semana lida de segunda a domingo.
  assert.deepEqual(kifica.services.map((service) => [service.weekday, service.time]), [[4, '15:00'], [6, '09:00'], [0, '09:00']]);
  assert.equal(byId('online-estados-unidos-da-america').formerIds[0], 'online_record_001');
});

test('nada é inventado: moradas, nomes e números como a equipa os escreveu', () => {
  const kifica = byId('ao-kifica');
  assert.equal(kifica.address, 'Rua 149, Bairro Kifica, Distrito do Benfica. Município de Talatona. Luanda,Angola.');
  assert.equal(kifica.leaderName, 'Bp. Rufino Boaz');
  assert.equal(kifica.leaderPhone, '+244 922 846 000');
  assert.equal(kifica.verificationStatus, 'needs_review');
  // A "morada" que é só o nome do lugar não é uma morada.
  assert.equal(byId('ao-sapu-2').address, null);
  assert.equal(churches.filter((church) => church.modality === 'physical' && church.address).length, 17);
});

test('Alto Garças: um lugar, dois responsáveis, os dois contactáveis', () => {
  const alto = byId('br-alto-garcas');
  assert.equal(alto.leaderName, 'Bp. Paulo Rodolfo');
  assert.deepEqual(alto.otherLeaders, [{ name: 'Pr. Adeilson', phone: '+55 66 99637 5054' }]);
  assert.deepEqual(filterChurches(churches, { query: 'adeilson' }).map((church) => church.id), ['br-alto-garcas']);
});

test('uma sede mundial e, no máximo, uma sede nacional por país', () => {
  assert.deepEqual(churches.filter((church) => church.seat === 'mundial').map((church) => church.id), ['ao-kifica']);
  const national = churches.filter((church) => church.seat === 'nacional');
  assert.equal(new Set(national.map((church) => church.country)).size, national.length);
  assert.ok(filterChurches(churches, { query: 'sede mundial' }).some((church) => church.id === 'ao-kifica'));
});

test('um lugar sem tipo confirmado não é chamado igreja', () => {
  assert.equal(placeKindLabel({ modality: 'physical', placeType: null }), 'Presencial');
  assert.equal(placeKindLabel({ modality: 'physical', placeType: 'casa_de_oracao' }), 'Casa de oração');
  assert.equal(placeKindLabel({ modality: 'physical', placeType: 'igreja' }), 'Igreja');
  assert.equal(placeKindLabel({ modality: 'online' }), 'Igreja online');
});

test('da base de dados: vários horários, servos, sede, outros responsáveis e ids de antes', () => {
  const church = normalizeChurch({
    id: 'uuid-1', record_id: 'ao-kifica', former_record_ids: ['source_record_001'], modality: 'physical', place_type: 'igreja', seat: 'mundial',
    country_code: 'AO', locality: 'Kifica', other_leaders: [{ name: 'Pr. Outro', phone: '+244 900 000 000' }, { name: '', phone: '' }],
    church_services: [{ weekday: 0, start_time: '09:00:00', label: null }, { weekday: 6, start_time: null, label: 'Culto dos servos' }]
  }, [{ church_id: 'uuid-1', full_name: 'Rufino Boaz', role: 'bispo' }, { church_id: 'uuid-1', full_name: 'Inativo', role: 'obreiro', active: false }, { church_id: 'outra', full_name: 'X', role: 'pastor' }]);
  assert.equal(church.id, 'ao-kifica');
  assert.equal(church.dbId, 'uuid-1');
  assert.equal(church.country, 'Angola');
  assert.equal(church.seat, 'mundial');
  assert.deepEqual(church.formerIds, ['source_record_001']);
  assert.deepEqual(church.otherLeaders, [{ name: 'Pr. Outro', phone: '+244 900 000 000' }]);
  assert.deepEqual(church.services.map(serviceLabel), ['Sábado, hora a confirmar · Culto dos servos', 'Domingo, 09:00']);
  assert.deepEqual(church.servants.map((servant) => servant.name), ['Bp. Rufino Boaz']);
  // A seat the app does not know is no seat at all.
  assert.equal(normalizeChurch({ record_id: 'x', seat: 'provincial' }).seat, null);
});

test('o nome do país é o que a equipa escreveu, não o do código', () => {
  assert.equal(normalizeChurch({ record_id: 'x', country_code: 'KE', country: 'Quénia' }).country, 'Quénia');
  assert.equal(normalizeChurch({ record_id: 'x', country_code: 'GB', country: 'Inglaterra' }).country, 'Inglaterra');
  assert.equal(normalizeChurch({ record_id: 'x', country_code: 'AO' }).country, 'Angola');
});

test('um link ou «A minha ISTN» antigos encontram o lugar pelo id que ele tinha', () => {
  assert.equal(findChurch(churches, 'source_record_064').id, 'ao-kifica');
  assert.equal(findChurch(churches, 'ao-kifica').id, 'ao-kifica');
  assert.equal(findChurch(churches, 'source_record_053').id, 'br-sao-paulo-sede-estadual');
  assert.equal(findChurch(churches, 'nao-existe'), null);
  assert.equal(findChurch(null, 'ao-kifica'), null);
});

test('pesquisa sem acentos, por palavras, só nos campos que as pessoas procuram', () => {
  assert.equal(foldText('  São Tomé  e Príncipe '), 'sao tome e principe');
  assert.ok(matchesQuery(['Kifica', 'Luanda'], 'luanda kifica'));
  assert.ok(!matchesQuery(['Kifica', 'Luanda'], 'luanda benfica'));
  assert.equal(filterChurches(churches, { query: 'phone' }).length, 0);
  assert.equal(filterChurches(churches, { query: 'modality' }).length, 0);
  assert.ok(filterChurches(churches, { query: 'sao paulo' }).length > 0);
  // A morada também se procura: o bairro escrito na morada da sede mundial.
  assert.ok(filterChurches(churches, { query: 'talatona' }).some((church) => church.id === 'ao-kifica'));
});

test('filtro por dia de culto: só quem tem culto nesse dia, e sem adivinhar horários', () => {
  const tuesday = filterChurches(churches, { day: 2 });
  assert.ok(tuesday.length > 0);
  assert.ok(tuesday.every((church) => church.services.some((service) => service.weekday === 2)));
  assert.ok(tuesday.some((church) => church.id === 'ao-cazenga-kalawenda'));
  assert.ok(!filterChurches(churches, { day: '0' }).some((church) => church.modality === 'online'));
  assert.equal(filterChurches(churches, { day: '' }).length, churches.length);
  assert.deepEqual(serviceDaysIn(churches), [2, 3, 4, 6, 0]);
});

test('países e regiões para os filtros', () => {
  const countries = countriesIn(churches);
  assert.deepEqual(countries, [...countries].sort((a, b) => a.localeCompare(b, 'pt')));
  assert.equal(countries.length, 18);
  assert.ok(regionsIn(churches, 'Portugal').includes('Lisboa'));
  assert.ok(!regionsIn(churches, 'Portugal').includes('Luanda'));
  assert.ok(regionsIn(churches, 'Brasil').includes('Goiás'));
  assert.ok(filterChurches(churches, { country: 'Portugal', region: 'Lisboa' }).every((church) => church.region === 'Lisboa'));
});

test('a lista: o país da sede mundial primeiro, a sede antes dos lugares, as igrejas online no fim', () => {
  const groups = groupDirectory(churches);
  assert.equal(groups[0].title, 'Angola');
  assert.equal(groups[0].flag, '🇦🇴');
  assert.equal(groups[0].churches[0].id, 'ao-kifica');
  const last = groups[groups.length - 1];
  assert.equal(last.title, 'Igrejas online');
  assert.ok(last.online && last.churches.every((church) => church.modality === 'online'));
  const middle = groups.slice(1, -1).map((group) => group.title);
  assert.deepEqual(middle, [...middle].sort((a, b) => a.localeCompare(b, 'pt')));
  groups.filter((group) => !group.online).forEach((group) => {
    const seatIndex = group.churches.findIndex((church) => church.seat);
    if (seatIndex >= 0) assert.equal(seatIndex, 0, `a sede de ${group.title} vem primeiro`);
    const places = group.churches.filter((church) => !church.seat).map((church) => church.name);
    assert.deepEqual(places, [...places].sort((a, b) => a.localeCompare(b, 'pt')));
  });
  assert.equal(groups.reduce((total, group) => total + group.churches.length, 0), churches.length);
});

test('o mapa: países com lugares de culto e países só com igreja online', () => {
  const presence = countryPresence(churches);
  assert.equal(presence.length, 18);
  assert.equal(presence[0].country, 'Angola');
  assert.ok(presence.find((entry) => entry.country === 'Noruega').physical === 0);
  assert.equal(presence.reduce((sum, entry) => sum + entry.physical + entry.online, 0), 73);
  assert.equal(countryFlag('BR'), '🇧🇷');
  assert.equal(countryFlag(''), '');
});

test('«Hoje» e o próximo culto contam-se na hora do lugar', () => {
  const kifica = byId('ao-kifica');
  // Quinta-feira, 17 de setembro de 2026, 10:00 em Luanda.
  assert.deepEqual(nextService(kifica, new Date('2026-09-17T09:00:00Z')), { weekday: 4, time: '15:00', label: null, inDays: 0 });
  // Às 16:00 o culto de quinta já começou: o próximo é o de sábado.
  assert.equal(nextService(kifica, new Date('2026-09-17T15:00:00Z')).weekday, 6);
  // Quinta 02:00 em Luanda é ainda quarta-feira em São Paulo.
  assert.equal(weekdayIn('Africa/Luanda', new Date('2026-09-17T01:00:00Z')), 4);
  assert.equal(weekdayIn('America/Sao_Paulo', new Date('2026-09-17T01:00:00Z')), 3);
  assert.equal(nextService(byId('online-noruega'), new Date()), null);
});

test('números repetidos em vários registos são assinalados para revisão', () => {
  const shared = sharedPhones(churches);
  assert.ok(shared.has('244923409830'));
  assert.ok(shared.get('244923409830').length >= 3);
});

test('o nome escolhido pelo Admin aparece e pode ser pesquisado sem perder a localidade', () => {
  const church = normalizeChurch({ id: '1', name: '  ISTN Esperança  ', locality: 'Kifica', country_code: 'AO', seat: 'mundial' });
  assert.equal(church.name, 'ISTN Esperança');
  assert.equal(church.locality, 'Kifica');
  assert.equal(church.seat, 'mundial');
  assert.equal(filterChurches([church], { query: 'Esperança' }).length, 1);
  assert.equal(filterChurches([church], { query: 'Kifica' }).length, 1);
  assert.equal(normalizeChurch({ name: '  ', locality: 'Kifica' }).name, 'Kifica');
});
