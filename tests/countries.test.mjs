import assert from 'node:assert/strict';
import { ISTN_COUNTRIES, countryList, countryName } from '../src/countries.js';

test('os países têm os nomes que a igreja escreve, em português europeu', () => {
  assert.equal(countryName('KE'), 'Quénia');
  assert.equal(countryName('PL'), 'Polónia');
  assert.equal(countryName('AO'), 'Angola');
  assert.equal(countryName('ST'), 'São Tomé e Príncipe');
  // Os dois Congos pelos nomes que as pessoas usam, não pelos de catálogo.
  assert.equal(countryName('CD'), 'República Democrática do Congo');
  assert.equal(countryName('CG'), 'República do Congo');
  assert.equal(countryName(''), '');
});

test('a lista é fechada, ordenada e cobre os países onde a ISTN-SJ está', () => {
  const list = countryList();
  assert.ok(list.length > 200);
  const names = list.map((country) => country.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'pt')));
  assert.ok(list.every((country) => /^[A-Z]{2}$/.test(country.code)));
  ISTN_COUNTRIES.forEach((code) => {
    assert.ok(list.some((country) => country.code === code), `${code} tem de estar na lista`);
  });
});
