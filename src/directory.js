// The directory of places, in one shape whatever it was read from.
//
// The database is the source: what the panel edits is what the congregation
// sees. The bundled announcement files remain only as the server's fallback
// when the database cannot be reached, and are turned into the same shape here
// — with the same record ids the seed gave them, so a shared link to a church
// keeps working whichever source answered.
//
// Nothing is corrected on the way: names keep their abbreviations, phone
// numbers stay as written, and a place whose type nobody has confirmed is not
// called an igreja.
import { countryName } from './countries.js';
import { WEEKDAY_LABELS } from './meetings.js';
import { roleLabel, servantName } from './roles.js';
import { collator, foldText, matchesQuery } from './text.js';

export const PLACE_TYPE_LABELS = { igreja: 'Igreja', casa_de_oracao: 'Casa de oração' };

// What to call a record. An unconfirmed place is only a "local presencial":
// calling it an igreja would tell a casa de oração it is something it is not.
export function placeKindLabel(church) {
  if (church.modality === 'online') return 'Comunidade online';
  return PLACE_TYPE_LABELS[church.placeType] || 'Local presencial';
}

const time = (value) => (value ? String(value).slice(0, 5) : null);

function weekdayOf(label) {
  const index = WEEKDAY_LABELS.findIndex((day) => foldText(day) === foldText(label));
  return index >= 0 ? index : null;
}

// A database row (churches, with church_services and servos embedded or passed
// alongside) → the record the app draws.
export function normalizeChurch(row, servants = []) {
  const services = Array.isArray(row.church_services) && row.church_services.length
    ? row.church_services.map((service) => ({ weekday: Number(service.weekday), time: time(service.start_time), label: service.label || null }))
    // Rows the services migration has not reached yet still carry the old pair.
    : row.service_day && weekdayOf(row.service_day) !== null
      ? [{ weekday: weekdayOf(row.service_day), time: time(row.service_time_local), label: null }]
      : [];
  services.sort((a, b) => a.weekday - b.weekday || String(a.time).localeCompare(String(b.time)));

  const country = countryName(row.country_code) || row.country || '';
  return {
    id: row.record_id || row.id,
    dbId: row.id || null,
    modality: row.modality === 'online' ? 'online' : 'physical',
    placeType: row.place_type || null,
    countryCode: row.country_code || null,
    country,
    region: row.region || null,
    locality: row.locality || null,
    name: row.locality || country || 'Sem localidade',
    address: row.address || null,
    leaderName: row.leader_name || null,
    leaderPhone: row.leader_phone || null,
    whatsappGroupUrl: row.whatsapp_group_url || null,
    photoUrl: row.photo_url || null,
    note: row.note || null,
    source: row.source || null,
    verificationStatus: row.verification_status === 'verified' ? 'verified' : 'needs_review',
    verifiedAt: row.verified_at || null,
    services,
    servants: servants
      .filter((servo) => servo.church_id === row.id && servo.active !== false)
      .map((servo) => ({ name: servantName(servo), role: servo.role, roleLabel: roleLabel(servo.role), photoUrl: servo.photo_url || null }))
  };
}

// The announcement files → database-shaped rows, exactly as
// scripts/generate_seed.py writes them into the seed.
export function rowsFromSourceRecords(physical = [], online = []) {
  return [
    ...physical.map((record) => ({
      record_id: record.record_id, modality: 'physical', country_code: record.country_code || null,
      region: record.region, locality: record.locality, service_day: record.service_day,
      service_time_local: record.service_time_local, leader_name: record.leader_name,
      leader_phone: record.leader_phone, source: record.source, verification_status: record.verification_status
    })),
    ...online.map((record, index) => ({
      record_id: `online_record_${String(index + 1).padStart(3, '0')}`, modality: 'online',
      country: record.country, leader_name: record.contact, leader_phone: record.phone,
      note: record.note, verification_status: record.verification_status
    }))
  ];
}

export function sortChurches(churches) {
  return [...churches].sort((a, b) => collator.compare(a.country, b.country)
    || collator.compare(a.region || '', b.region || '')
    || collator.compare(a.name, b.name));
}

export function countriesIn(churches) {
  return [...new Set(churches.map((church) => church.country).filter(Boolean))].sort(collator.compare);
}

export function regionsIn(churches, country) {
  return [...new Set(churches.filter((church) => !country || church.country === country).map((church) => church.region).filter(Boolean))].sort(collator.compare);
}

export function filterChurches(churches, { query = '', country = '', region = '' } = {}) {
  return churches.filter((church) => (!country || church.country === country)
    && (!region || church.region === region)
    && matchesQuery([church.name, church.locality, church.region, church.country, church.address, church.leaderName, placeKindLabel(church)], query));
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
