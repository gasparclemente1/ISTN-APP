// The directory of places, in one shape whatever it was read from.
//
// The database is the source: what the panel edits is what the congregation
// sees. data/igrejas.json — the team's general list of services, imported by
// scripts/import_churches.py — remains the server's fallback when the database
// cannot be reached, and is turned into the same shape here, with the same ids.
//
// Nothing is corrected on the way: names keep their abbreviations, phone
// numbers and addresses stay as written, and a place whose type nobody has
// confirmed is not called an igreja.
import { countryName } from './countries.js';
import { WEEKDAY_LABELS, zonedDateParts } from './meetings.js';
import { roleLabel, servantName } from './roles.js';
import { collator, foldText, matchesQuery } from './text.js';

export const PLACE_TYPE_LABELS = { igreja: 'Igreja', casa_de_oracao: 'Casa de oração' };
export const SEAT_LABELS = { mundial: 'Sede mundial', nacional: 'Sede nacional' };

// What to call a record. An unconfirmed place is only "presencial": calling it
// an igreja would tell a casa de oração it is something it is not.
export function placeKindLabel(church) {
  if (church.modality === 'online') return 'Igreja online';
  return PLACE_TYPE_LABELS[church.placeType] || 'Presencial';
}

// The week as a congregation reads a schedule: Monday first, Sunday — the
// main day — last.
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const SHORT_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const byWeekOrder = (a, b) => WEEK_ORDER.indexOf(a.weekday) - WEEK_ORDER.indexOf(b.weekday)
  || String(a.time || '99').localeCompare(String(b.time || '99'));

// Every service time is the place's own local time. For "today" the app needs
// the place's date, which in Brazil or Germany is not Luanda's.
const TIME_ZONES = {
  AO: 'Africa/Luanda', BR: 'America/Sao_Paulo', PT: 'Europe/Lisbon', MZ: 'Africa/Maputo', DE: 'Europe/Berlin',
  GB: 'Europe/London', FR: 'Europe/Paris', ST: 'Africa/Sao_Tome', ES: 'Europe/Madrid', BE: 'Europe/Brussels',
  NL: 'Europe/Amsterdam', CH: 'Europe/Zurich', NO: 'Europe/Oslo', PL: 'Europe/Warsaw', ZA: 'Africa/Johannesburg',
  CD: 'Africa/Kinshasa', CG: 'Africa/Brazzaville', TZ: 'Africa/Dar_es_Salaam', KE: 'Africa/Nairobi', SN: 'Africa/Dakar',
  US: 'America/New_York', CA: 'America/Toronto'
};
export const churchTimeZone = (church) => TIME_ZONES[church.countryCode] || 'Africa/Luanda';

export function weekdayIn(timeZone, now = new Date()) {
  const { year, month, day } = zonedDateParts(now, timeZone);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

// 🇦🇴 from "AO": two regional indicator letters.
export const countryFlag = (code) => (/^[A-Z]{2}$/.test(code || '')
  ? String.fromCodePoint(...[...code].map((letter) => 0x1f1a5 + letter.charCodeAt(0)))
  : '');

const time = (value) => (value ? String(value).slice(0, 5) : null);

function weekdayOf(label) {
  const index = WEEKDAY_LABELS.findIndex((day) => foldText(day) === foldText(label));
  return index >= 0 ? index : null;
}

// A database row (churches, with church_services and servos embedded or passed
// alongside) → the record the app draws.
export function normalizeChurch(row, servants = []) {
  const listed = Array.isArray(row.church_services) ? row.church_services : Array.isArray(row.services) ? row.services : [];
  const services = listed.length
    ? listed.map((service) => ({ weekday: Number(service.weekday), time: time(service.start_time), label: service.label || null }))
    // Rows the services migration has not reached yet still carry the old pair.
    : row.service_day && weekdayOf(row.service_day) !== null
      ? [{ weekday: weekdayOf(row.service_day), time: time(row.service_time_local), label: null }]
      : [];
  services.sort(byWeekOrder);

  // The name the team wrote ("Quénia", "Inglaterra") before the one the
  // browser knows for the code ("Quênia", "Reino Unido").
  const country = row.country || countryName(row.country_code) || '';
  return {
    id: row.record_id || row.id,
    dbId: row.id || null,
    formerIds: Array.isArray(row.former_record_ids) ? row.former_record_ids : [],
    modality: row.modality === 'online' ? 'online' : 'physical',
    placeType: row.place_type || null,
    seat: SEAT_LABELS[row.seat] ? row.seat : null,
    countryCode: row.country_code || null,
    country,
    region: row.region || null,
    locality: row.locality || null,
    name: row.name?.trim() || row.locality || country || 'Sem localidade',
    address: row.address || null,
    leaderName: row.leader_name || null,
    leaderPhone: row.leader_phone || null,
    otherLeaders: (Array.isArray(row.other_leaders) ? row.other_leaders : [])
      .filter((leader) => leader?.name || leader?.phone)
      .map((leader) => ({ name: leader.name || null, phone: leader.phone || null })),
    whatsappGroupUrl: row.whatsapp_group_url || null,
    photoUrl: row.photo_url || null,
    note: row.note || null,
    source: row.source || null,
    verificationStatus: row.verification_status === 'verified' ? 'verified' : 'needs_review',
    verifiedAt: row.verified_at || null,
    services,
    servants: servants
      .filter((servo) => servo.church_id === row.id && servo.active !== false)
      .map((servo) => ({ name: servantName(servo), role: servo.role, roleLabel: roleLabel(servo.role), photoUrl: servo.photo_url || null, phone: servo.phone || null }))
  };
}

// data/igrejas.json → database-shaped rows, as the migration writes them.
export function rowsFromDirectoryFile(file) {
  return (file?.churches || []).map((church) => ({ ...church, church_services: church.services || [] }));
}

// A place by its id, or by an id it had before the import joined its
// records: links shared last month and "A minha ISTN" saved on a phone still
// find it.
export function findChurch(churches, id) {
  if (!id || !churches) return null;
  return churches.find((church) => church.id === id) || churches.find((church) => church.formerIds.includes(id)) || null;
}

const SEAT_RANK = { mundial: 0, nacional: 1 };
const seatRank = (church) => SEAT_RANK[church.seat] ?? 2;

// The world seat's country first, the others alphabetically; inside each, the
// seat before the places, and the places by name. Online churches come after
// every country with a place to go to.
export function sortChurches(churches) {
  const home = churches.find((church) => church.seat === 'mundial')?.country;
  const countryRank = (church) => (church.modality === 'online' ? 2 : church.country === home ? 0 : 1);
  return [...churches].sort((a, b) => countryRank(a) - countryRank(b)
    || collator.compare(a.country, b.country)
    || seatRank(a) - seatRank(b)
    || collator.compare(a.name, b.name));
}

// The list as it is shown: one group per country with places to go to, and
// the online churches together at the end.
export function groupDirectory(churches) {
  const groups = [];
  sortChurches(churches).forEach((church) => {
    const key = church.modality === 'online' ? 'online' : church.country;
    let group = groups.find((item) => item.key === key);
    if (!group) {
      group = church.modality === 'online'
        ? { key, title: 'Igrejas online', flag: '', online: true, churches: [] }
        : { key, title: church.country || 'País a confirmar', flag: countryFlag(church.countryCode), online: false, churches: [] };
      groups.push(group);
    }
    group.churches.push(church);
  });
  return groups;
}

export function countriesIn(churches) {
  return [...new Set(churches.map((church) => church.country).filter(Boolean))].sort(collator.compare);
}

export function regionsIn(churches, country) {
  return [...new Set(churches.filter((church) => !country || church.country === country).map((church) => church.region).filter(Boolean))].sort(collator.compare);
}

// The weekdays on which some place holds a service, in reading order.
export function serviceDaysIn(churches) {
  const days = new Set(churches.flatMap((church) => church.services.map((service) => service.weekday)));
  return WEEK_ORDER.filter((weekday) => days.has(weekday));
}

// Countries with the ISTN, for the map: how many places to go to and how many
// online churches each has.
export function countryPresence(churches) {
  const byCountry = new Map();
  churches.forEach((church) => {
    const entry = byCountry.get(church.country) || { country: church.country, code: church.countryCode, physical: 0, online: 0 };
    entry[church.modality === 'online' ? 'online' : 'physical'] += 1;
    byCountry.set(church.country, entry);
  });
  return [...byCountry.values()].sort((a, b) => (b.physical - a.physical) || collator.compare(a.country, b.country));
}

// `day` is a weekday (0 = Sunday) or '' for any. A place with no known times
// is kept out of a day's list rather than guessed into it.
export function filterChurches(churches, { query = '', country = '', region = '', day = '' } = {}) {
  const weekday = day === '' || day === null || day === undefined ? null : Number(day);
  return churches.filter((church) => (!country || church.country === country)
    && (!region || church.region === region)
    && (weekday === null || church.services.some((service) => service.weekday === weekday))
    && matchesQuery([church.name, church.locality, church.region, church.country, church.address, church.leaderName,
      ...church.otherLeaders.map((leader) => leader.name), placeKindLabel(church), SEAT_LABELS[church.seat]], query));
}

// Numbers that appear on more than one record — often the same leader
// announced for several places, sometimes a copying mistake. Shown to the team
// for review; never merged or corrected automatically.
export function sharedPhones(churches) {
  const byDigits = new Map();
  churches.forEach((church) => {
    const digits = String(church.leaderPhone || '').replace(/\D/g, '');
    if (digits.length < 8) return;
    if (!byDigits.has(digits)) byDigits.set(digits, []);
    byDigits.get(digits).push(church);
  });
  return new Map([...byDigits].filter(([, list]) => list.length > 1));
}

export function serviceLabel(service) {
  const day = WEEKDAY_LABELS[service.weekday] || '';
  const when = service.time ? `${day}, ${service.time}` : `${day}, hora a confirmar`;
  return service.label ? `${when} · ${service.label}` : when;
}

// The next service from `now`, in the place's own time: today's if it has not
// started yet, otherwise the soonest in the days ahead.
export function nextService(church, now = new Date()) {
  if (!church.services.length) return null;
  const zone = churchTimeZone(church);
  const today = weekdayIn(zone, now);
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const ahead = (service) => {
    const days = (service.weekday - today + 7) % 7;
    return days === 0 && service.time && service.time <= clock ? 7 : days;
  };
  return [...church.services].sort((a, b) => ahead(a) - ahead(b) || String(a.time || '99').localeCompare(String(b.time || '99')))
    .map((service) => ({ ...service, inDays: ahead(service) }))[0];
}
