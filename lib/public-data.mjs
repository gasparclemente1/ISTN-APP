// What the congregation reads — meetings and the directory — fetched by the
// server from Supabase and kept for a minute.
//
// Going through the server rather than straight from the browser lets one
// query serve everyone, lets the calendar feed use the same rows, and lets the
// service worker keep the directory for offline use. The server asks with the
// publishable key only, so it can never see more than a visitor could.
//
// The two differ when the database cannot be reached:
// - meetings are never replaced by a bundled copy: an old Zoom link sends
//   people to a room that is not the meeting. A recent answer is reused for a
//   few hours, and after that the app says it cannot load the schedule;
// - the directory falls back to the announcement files it was built from,
//   marked as such, because an old phone number still reaches someone.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeChurch, rowsFromSourceRecords, sortChurches } from '../src/directory.js';
import { getJson, restGet } from './supabase.mjs';

const MINUTE = 60 * 1000;

const MEETING_COLUMNS = 'id,title,kind,zoom_url,zoom_meeting_id,zoom_passcode,start_time,time_note,recurrence,weekdays,event_date,sort_order';
const CHURCH_COLUMNS = 'id,record_id,modality,place_type,country_code,country,region,locality,address,leader_name,leader_phone,'
  + 'whatsapp_group_url,photo_url,note,source,verification_status,verified_at,service_day,service_time_local,'
  + 'church_services(weekday,start_time,label)';
const SERVANT_COLUMNS = 'id,full_name,role,church_id,photo_url,active';

export function createPublicData({
  config,
  root = process.cwd(),
  fetchJson = getJson,
  readLocal = (name) => readFile(join(root, 'data', name), 'utf8').then(JSON.parse),
  now = () => Date.now(),
  freshFor = MINUTE,
  staleFor = 6 * 60 * MINUTE
}) {
  const configured = Boolean(config.supabaseUrl && config.supabaseKey);
  const cache = new Map();
  const pending = new Map();

  // Fresh answer from cache; otherwise one request shared by everyone asking at
  // the same moment; otherwise, on failure, a cached answer not older than
  // staleFor, marked stale.
  function remember(key, load) {
    const hit = cache.get(key);
    if (hit && now() - hit.at < freshFor) return Promise.resolve(hit.value);
    if (pending.has(key)) return pending.get(key);
    const request = load()
      .then((value) => { cache.set(key, { at: now(), value }); return value; })
      .catch((error) => {
        if (hit && now() - hit.at < staleFor) return { ...hit.value, stale: true };
        throw error;
      })
      .finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  }

  const stamp = () => new Date(now()).toISOString();

  async function localDirectory() {
    const [physical, online] = await Promise.all([
      readLocal('church-service-source-records.json'),
      readLocal('online-communities-source-records.json')
    ]);
    const churches = sortChurches(rowsFromSourceRecords(physical, online).map((row) => normalizeChurch(row)));
    return { churches, updatedAt: stamp(), source: 'arquivo' };
  }

  return {
    configured,

    meetings() {
      if (!configured) {
        return Promise.reject(Object.assign(new Error('A ligação à base de dados não está configurada.'), { status: 503 }));
      }
      return remember('meetings', async () => ({
        meetings: await restGet(config, `meetings?select=${MEETING_COLUMNS}&active=eq.true&order=kind.asc,sort_order.asc`, fetchJson),
        updatedAt: stamp(),
        source: 'supabase'
      }));
    },

    directory() {
      if (!configured) return remember('directory', localDirectory);
      return remember('directory', async () => {
        const [rows, servants, contacts] = await Promise.all([
          restGet(config, `churches?select=${CHURCH_COLUMNS}`, fetchJson),
          // Servants are extra: the directory still works if this one fails.
          restGet(config, `servos?select=${SERVANT_COLUMNS}&active=eq.true&order=role.asc,full_name.asc`, fetchJson).catch(() => []),
          // Only the numbers their servants chose to show; the database returns
          // no others to the publishable key anyway.
          restGet(config, 'servo_contacts?select=servo_id,phone,phone_public&phone_public=eq.true', fetchJson).catch(() => [])
        ]);
        const phones = new Map((contacts || []).filter((contact) => contact.phone_public !== false).map((contact) => [contact.servo_id, contact.phone]));
        const withPhones = servants.map((servo) => ({ ...servo, phone: phones.get(servo.id) || null }));
        return { churches: sortChurches(rows.map((row) => normalizeChurch(row, withPhones))), updatedAt: stamp(), source: 'supabase' };
      }).catch(localDirectory);
    }
  };
}
