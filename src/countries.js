// Every country, named in the reader's language by the browser itself.
//
// Only the ISO 3166 codes are kept here. The names come from Intl.DisplayNames,
// so they are correct Portuguese without a translated list to maintain, and the
// same codes are what churches.country_code and app_users.country_code store.
// Uninhabited territories (Antarctica, Bouvet, Heard, South Georgia, the French
// Southern Lands, US Minor Outlying Islands) are left out: nobody lives there
// to choose them.

const CODES = (
  'AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ '
  + 'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM '
  + 'FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE '
  + 'JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN '
  + 'MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS '
  + 'PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK '
  + 'TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'
).split(' ');

// Countries where the ISTN-SJ is present, offered first so most people never
// scroll past two hundred names to find their own.
export const ISTN_COUNTRIES = ['AO', 'BR', 'CA', 'CD', 'CH', 'DE', 'ES', 'FR', 'GB', 'KE', 'MZ', 'NO', 'PL', 'PT', 'SN', 'ST', 'TZ', 'US', 'ZA'];

// The standard names for the two Congos ("Congo - Kinshasa", "Congo - Brazzaville")
// read as catalogue entries. The ISTN is present in one of them, so both get the
// names people actually use.
const OVERRIDES = { pt: { CD: 'República Democrática do Congo', CG: 'República do Congo' } };

let cache = null;

export function countryList(locale = 'pt') {
  if (cache?.locale === locale) return cache.list;
  const names = new Intl.DisplayNames([locale], { type: 'region' });
  const list = CODES
    .map((code) => ({ code, name: OVERRIDES[locale]?.[code] || names.of(code) || code }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  cache = { locale, list };
  return list;
}

export function countryName(code, locale = 'pt') {
  if (!code) return '';
  return countryList(locale).find((country) => country.code === code)?.name || code;
}
