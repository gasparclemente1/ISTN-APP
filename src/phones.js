// Dialling codes, so a contact is never typed with a prefix somebody
// remembered wrong: the code is chosen from the list of countries and the
// person writes only the part that is theirs.
//
// The codes are the ITU-T E.164 assignments — the same ones every phone
// carries — and not data the ISTN team keeps: the church's own records are the
// addresses and the names, which come from the team's list and from nowhere
// else. The ISO codes and the country names come from ./countries.js, which
// the whole app already reads; only the code to dial lives here.
//
// A number is stored as it always was: one line of text, "+244 923 000 000".
// The field splits it to show it and joins it back to save it, so nothing in
// the database changes and numbers written before this still open.
import { ISTN_COUNTRIES, countryList } from './countries.js';
import { escapeHtml } from './html.js';

// Countries sharing a code are listed under it, in the North American plan and
// wherever a territory dials through its neighbour. What follows the code is
// then the area code, which the person writes with the rest of the number.
const DIAL = {
  AD: '376', AE: '971', AF: '93', AG: '1', AI: '1', AL: '355', AM: '374', AO: '244', AR: '54', AS: '1',
  AT: '43', AU: '61', AW: '297', AX: '358', AZ: '994', BA: '387', BB: '1', BD: '880', BE: '32', BF: '226',
  BG: '359', BH: '973', BI: '257', BJ: '229', BL: '590', BM: '1', BN: '673', BO: '591', BQ: '599', BR: '55',
  BS: '1', BT: '975', BW: '267', BY: '375', BZ: '501', CA: '1', CC: '61', CD: '243', CF: '236', CG: '242',
  CH: '41', CI: '225', CK: '682', CL: '56', CM: '237', CN: '86', CO: '57', CR: '506', CU: '53', CV: '238',
  CW: '599', CX: '61', CY: '357', CZ: '420', DE: '49', DJ: '253', DK: '45', DM: '1', DO: '1', DZ: '213',
  EC: '593', EE: '372', EG: '20', EH: '212', ER: '291', ES: '34', ET: '251', FI: '358', FJ: '679', FK: '500',
  FM: '691', FO: '298', FR: '33', GA: '241', GB: '44', GD: '1', GE: '995', GF: '594', GG: '44', GH: '233',
  GI: '350', GL: '299', GM: '220', GN: '224', GP: '590', GQ: '240', GR: '30', GT: '502', GU: '1', GW: '245',
  GY: '592', HK: '852', HN: '504', HR: '385', HT: '509', HU: '36', ID: '62', IE: '353', IL: '972', IM: '44',
  IN: '91', IO: '246', IQ: '964', IR: '98', IS: '354', IT: '39', JE: '44', JM: '1', JO: '962', JP: '81',
  KE: '254', KG: '996', KH: '855', KI: '686', KM: '269', KN: '1', KP: '850', KR: '82', KW: '965', KY: '1',
  KZ: '7', LA: '856', LB: '961', LC: '1', LI: '423', LK: '94', LR: '231', LS: '266', LT: '370', LU: '352',
  LV: '371', LY: '218', MA: '212', MC: '377', MD: '373', ME: '382', MF: '590', MG: '261', MH: '692', MK: '389',
  ML: '223', MM: '95', MN: '976', MO: '853', MP: '1', MQ: '596', MR: '222', MS: '1', MT: '356', MU: '230',
  MV: '960', MW: '265', MX: '52', MY: '60', MZ: '258', NA: '264', NC: '687', NE: '227', NF: '672', NG: '234',
  NI: '505', NL: '31', NO: '47', NP: '977', NR: '674', NU: '683', NZ: '64', OM: '968', PA: '507', PE: '51',
  PF: '689', PG: '675', PH: '63', PK: '92', PL: '48', PM: '508', PN: '64', PR: '1', PS: '970', PT: '351',
  PW: '680', PY: '595', QA: '974', RE: '262', RO: '40', RS: '381', RU: '7', RW: '250', SA: '966', SB: '677',
  SC: '248', SD: '249', SE: '46', SG: '65', SH: '290', SI: '386', SJ: '47', SK: '421', SL: '232', SM: '378',
  SN: '221', SO: '252', SR: '597', SS: '211', ST: '239', SV: '503', SX: '1', SY: '963', SZ: '268', TC: '1',
  TD: '235', TG: '228', TH: '66', TJ: '992', TK: '690', TL: '670', TM: '993', TN: '216', TO: '676', TR: '90',
  TT: '1', TV: '688', TW: '886', TZ: '255', UA: '380', UG: '256', US: '1', UY: '598', UZ: '998', VA: '379',
  VC: '1', VE: '58', VG: '1', VI: '1', VN: '84', VU: '678', WF: '681', WS: '685', XK: '383', YE: '967',
  YT: '262', ZA: '27', ZM: '260', ZW: '263'
};

// Reading a number back gives a code, not a country: several countries answer
// to the same one. The field has to show a single name, so each shared code
// names the country it is usually written for. Nothing depends on the choice —
// the number dials the same either way — it only decides which name the list
// shows as chosen.
const PRIMARY = { 1: 'US', 7: 'RU', 44: 'GB', 47: 'NO', 61: 'AU', 64: 'NZ', 212: 'MA', 262: 'RE', 358: 'FI', 590: 'GP', 599: 'CW' };

// Where the church is: the code a number opens on when there is nothing else
// to go by.
export const DEFAULT_COUNTRY = 'AO';

export const dialFor = (code) => (DIAL[code] ? `+${DIAL[code]}` : '');

let cache = null;

// The countries that have a code, by name, each with the code to dial.
export function dialList(locale = 'pt-PT') {
  if (cache?.locale === locale) return cache.list;
  const list = countryList(locale)
    .filter((country) => DIAL[country.code])
    .map((country) => ({ ...country, dial: `+${DIAL[country.code]}` }));
  cache = { locale, list };
  return list;
}

export function countryForDial(dial) {
  const digits = String(dial || '').replace(/\D/g, '');
  if (!digits) return '';
  if (PRIMARY[digits]) return PRIMARY[digits];
  return Object.keys(DIAL).find((code) => DIAL[code] === digits) || '';
}

// The longest code that starts the number, so +1 never swallows a +593 and
// +599 is read before +59 could be. A number written without a code — as some
// were, before the list existed — keeps every digit as the number itself, and
// opens on the country given.
export function splitPhone(value, fallbackCountry = DEFAULT_COUNTRY) {
  const text = String(value || '').trim();
  const fallback = DIAL[fallbackCountry] ? fallbackCountry : DEFAULT_COUNTRY;
  if (!text) return { country: fallback, dial: dialFor(fallback), national: '' };
  if (!text.startsWith('+')) return { country: fallback, dial: dialFor(fallback), national: text };
  const digits = text.slice(1).replace(/\D/g, '');
  const codes = [...new Set(Object.values(DIAL))].sort((a, b) => b.length - a.length);
  const code = codes.find((candidate) => digits.startsWith(candidate));
  if (!code) return { country: fallback, dial: dialFor(fallback), national: text };
  // The rest as it was typed, spaces and all, minus the code at the front.
  const rest = text.replace(/^\+\s*/, '').replace(new RegExp(`^${code.split('').join('\\s*')}\\s*`), '');
  return { country: countryForDial(code), dial: `+${code}`, national: rest.trim() };
}

// One line of text again, the way it was always stored. Nothing to dial means
// nothing at all: a code on its own is not a contact.
export function joinPhone(dial, national) {
  const code = String(dial || '').replace(/\D/g, '');
  const rest = String(national || '').replace(/[^\d\s()-]/g, '').replace(/\s+/g, ' ').trim();
  if (!rest.replace(/\D/g, '')) return '';
  return code ? `+${code} ${rest}` : rest;
}

// What a form sends back: the code from the list and the number beside it.
export const phoneFromValues = (values, name = 'phone') => joinPhone(values[`${name}_dial`], values[`${name}_national`]);

// And the same read straight from the page, for the rows the panel adds and
// removes, which carry no names.
export function phoneFromFields(scope) {
  if (!scope) return '';
  return joinPhone(scope.querySelector('[data-phone-dial]')?.value, scope.querySelector('[data-phone-national]')?.value);
}

// The code first, so that a narrow select still shows it when the country's
// name does not fit: the code is the part that must be read.
// An empty name is for the rows the panel adds and removes: they carry no
// names, so nothing of theirs reaches the form's own fields, and they are read
// back through phoneFromFields.
export function phoneControl({ name = 'phone', value = '', country = DEFAULT_COUNTRY, autocomplete = 'tel-national', required = false } = {}) {
  const current = splitPhone(value, country);
  const all = dialList();
  const option = (item) => `<option value="${item.dial}" ${item.dial === current.dial && item.code === current.country ? 'selected' : ''}>${escapeHtml(`${item.dial} — ${item.name}`)}</option>`;
  const here = all.filter((item) => ISTN_COUNTRIES.includes(item.code));
  return `<span class="phone-input">
    <select ${name ? `name="${name}_dial"` : ''} data-phone-dial aria-label="Indicativo do país">
      <optgroup label="Onde a ISTN-SJ está presente">${here.map(option).join('')}</optgroup>
      <optgroup label="Todos os países">${all.map(option).join('')}</optgroup>
    </select>
    <input type="tel" ${name ? `name="${name}_national"` : ''} data-phone-national value="${escapeHtml(current.national)}"
      inputmode="tel" autocomplete="${escapeHtml(autocomplete)}" placeholder="900 000 000" ${required ? 'required' : ''} />
  </span>`;
}
