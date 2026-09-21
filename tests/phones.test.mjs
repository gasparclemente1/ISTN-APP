import assert from 'node:assert/strict';
import { ISTN_COUNTRIES } from '../src/countries.js';
import { DEFAULT_COUNTRY, countryForDial, dialFor, dialList, joinPhone, phoneControl, phoneFromValues, splitPhone } from '../src/phones.js';

test('os países onde a ISTN-SJ está têm o indicativo certo', () => {
  assert.deepEqual(ISTN_COUNTRIES.map(dialFor), [
    '+244', // AO Angola
    '+55', //  BR Brasil
    '+1', //   CA Canadá
    '+243', // CD República Democrática do Congo
    '+41', //  CH Suíça
    '+49', //  DE Alemanha
    '+34', //  ES Espanha
    '+33', //  FR França
    '+44', //  GB Reino Unido
    '+254', // KE Quénia
    '+258', // MZ Moçambique
    '+47', //  NO Noruega
    '+48', //  PL Polónia
    '+351', // PT Portugal
    '+221', // SN Senegal
    '+239', // ST São Tomé e Príncipe
    '+255', // TZ Tanzânia
    '+1', //   US Estados Unidos
    '+27' //   ZA África do Sul
  ]);
  assert.equal(dialFor(''), '');
  assert.equal(dialFor('ZZ'), '');
});

test('a lista tem um indicativo por país, e todos os países da aplicação', () => {
  const list = dialList();
  assert.ok(list.length > 200);
  assert.ok(list.every((item) => /^\+\d{1,4}$/.test(item.dial)));
  assert.ok(list.every((item) => item.name && /^[A-Z]{2}$/.test(item.code)));
  // Pela mesma ordem da lista de países: pelo nome, em português.
  const names = list.map((item) => item.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'pt')));
  ISTN_COUNTRIES.forEach((code) => assert.ok(list.some((item) => item.code === code), `${code} tem de ter indicativo`));
});

test('um indicativo partilhado mostra um nome só, e nunca nenhum', () => {
  assert.equal(countryForDial('+1'), 'US');
  assert.equal(countryForDial('+7'), 'RU');
  assert.equal(countryForDial('+44'), 'GB');
  assert.equal(countryForDial('+244'), 'AO');
  assert.equal(countryForDial(''), '');
  dialList().forEach((item) => assert.ok(countryForDial(item.dial), `${item.dial} tem de nomear um país`));
});

test('ler um número já guardado devolve o indicativo e o resto', () => {
  assert.deepEqual(splitPhone('+244 923 000 111'), { country: 'AO', dial: '+244', national: '923 000 111' });
  assert.deepEqual(splitPhone('+351912345678'), { country: 'PT', dial: '+351', national: '912345678' });
  // O indicativo mais longo ganha: +599 antes de +59, +1 não engole o +1809.
  assert.equal(splitPhone('+5999 518 8888').dial, '+599');
  assert.equal(splitPhone('+1 809 555 0100').dial, '+1');
  assert.equal(splitPhone('+593 99 123 4567').dial, '+593');
});

test('um número escrito sem indicativo abre no país que lhe for dado', () => {
  assert.deepEqual(splitPhone('923 000 111'), { country: 'AO', dial: '+244', national: '923 000 111' });
  assert.deepEqual(splitPhone('912 345 678', 'PT'), { country: 'PT', dial: '+351', national: '912 345 678' });
  // Sem número nenhum, a folha abre no país indicado, ou no da sede.
  assert.deepEqual(splitPhone('', 'BR'), { country: 'BR', dial: '+55', national: '' });
  assert.deepEqual(splitPhone(null), { country: DEFAULT_COUNTRY, dial: '+244', national: '' });
  assert.deepEqual(splitPhone('', 'ZZ'), { country: 'AO', dial: '+244', national: '' });
  // Um "+" seguido de um indicativo que não existe fica como está, para não se perder.
  assert.equal(splitPhone('+999 111 222').national, '+999 111 222');
});

test('guardar volta a juntar o indicativo ao número, numa linha só', () => {
  assert.equal(joinPhone('+244', '923 000 111'), '+244 923 000 111');
  assert.equal(joinPhone('244', ' 923  000 111 '), '+244 923 000 111');
  // Um indicativo sozinho não é contacto nenhum.
  assert.equal(joinPhone('+244', ''), '');
  assert.equal(joinPhone('+244', '   '), '');
  assert.equal(joinPhone('', '923 000 111'), '923 000 111');
  // Letras não entram num número de telefone, nem o espaço que deixam para trás.
  assert.equal(joinPhone('+351', '912 ABC 678'), '+351 912 678');
  assert.equal(phoneFromValues({ phone_dial: '+258', phone_national: '84 000 0000' }), '+258 84 000 0000');
  assert.equal(phoneFromValues({ leader_phone_dial: '+27', leader_phone_national: '82 000 0000' }, 'leader_phone'), '+27 82 000 0000');
});

test('o que o campo desenha: a lista, e o número já lá guardado', () => {
  const html = phoneControl({ name: 'phone', value: '+351 912 345 678' });
  assert.match(html, /<select name="phone_dial" data-phone-dial/);
  assert.match(html, /<option value="\+351" selected>\+351 — Portugal<\/option>/);
  assert.match(html, /value="912 345 678"/);
  // Os países onde a ISTN está aparecem primeiro, para ninguém percorrer duzentos nomes.
  assert.ok(html.indexOf('Onde a ISTN-SJ está presente') < html.indexOf('Todos os países'));
  // Um campo vazio abre no país indicado.
  assert.match(phoneControl({ country: 'BR' }), /<option value="\+55" selected>/);
  assert.match(phoneControl({ value: '' }), /<option value="\+244" selected>/);
});
