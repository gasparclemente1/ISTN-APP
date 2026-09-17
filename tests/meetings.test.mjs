import assert from 'node:assert/strict';
import { nextMeeting, nextOccurrence, recurrenceLabel, untimedMeetingsOn, upcomingMeetings, zonedToInstant } from '../src/meetings.js';

const LUANDA = 'Africa/Luanda';
const at = (iso) => new Date(iso);

// The general schedule the ministry announced, as migration 002 seeds it.
const GERAL = [
  { id: 'a', title: 'Live geral', recurrence: 'weekly', weekdays: [0, 3, 5, 6], start_time: '19:30:00' },
  { id: 'b', title: 'Live geral', recurrence: 'weekly', weekdays: [1, 4], start_time: '20:30:00' },
  { id: 'c', title: 'Live geral', recurrence: 'weekly', weekdays: [2], start_time: null, time_note: 'Após a live dos ministros' },
  { id: 'd', title: 'Live dos Ministros', recurrence: 'weekly', weekdays: [2], start_time: '20:00' }
];

test('semanal: a próxima é hoje à noite, em hora de Luanda', () => {
  // Quinta-feira, 17 de setembro de 2026, 10:00 em Luanda (09:00 UTC).
  const next = nextMeeting(GERAL, LUANDA, at('2026-09-17T09:00:00Z'));
  assert.equal(next.meeting.id, 'b');
  assert.equal(next.start.toISOString(), '2026-09-17T19:30:00.000Z');
  assert.equal(next.isLive, false);
});

test('fica "a decorrer" durante duas horas depois do início', () => {
  const live = nextMeeting(GERAL, LUANDA, at('2026-09-17T20:15:00Z'));
  assert.equal(live.meeting.id, 'b');
  assert.equal(live.isLive, true);
  const after = nextMeeting(GERAL, LUANDA, at('2026-09-17T21:31:00Z'));
  assert.equal(after.meeting.id, 'a');
  assert.equal(after.start.toISOString(), '2026-09-18T18:30:00.000Z');
});

test('terça: a live dos ministros tem hora; a geral só uma explicação', () => {
  const tuesday = at('2026-09-22T08:00:00Z');
  assert.equal(nextMeeting(GERAL, LUANDA, tuesday).meeting.id, 'd');
  assert.deepEqual(untimedMeetingsOn(GERAL, LUANDA, tuesday).map((meeting) => meeting.id), ['c']);
  assert.deepEqual(untimedMeetingsOn(GERAL, LUANDA, at('2026-09-23T08:00:00Z')), []);
  assert.equal(nextOccurrence(GERAL[2], LUANDA, tuesday), null);
});

test('último sábado do mês passa corretamente para o mês seguinte', () => {
  const criancas = { recurrence: 'monthly_last', weekdays: [6], start_time: '19:30' };
  assert.equal(nextOccurrence(criancas, LUANDA, at('2026-09-20T12:00:00Z')).start.toISOString(), '2026-09-26T18:30:00.000Z');
  assert.equal(nextOccurrence(criancas, LUANDA, at('2026-09-27T12:00:00Z')).start.toISOString(), '2026-10-31T18:30:00.000Z');
  assert.equal(recurrenceLabel(criancas), 'Último sábado de cada mês');
});

test('anual e única: a data certa, e nada depois de passar', () => {
  const vigilia = { recurrence: 'yearly', event_date: '2026-12-31', start_time: '22:00' };
  assert.equal(nextOccurrence(vigilia, LUANDA, at('2027-01-05T00:00:00Z')).start.toISOString(), '2027-12-31T21:00:00.000Z');
  const unica = { recurrence: 'once', event_date: '2026-09-01', start_time: '19:00' };
  assert.equal(nextOccurrence(unica, LUANDA, at('2026-09-17T00:00:00Z')), null);
  assert.equal(recurrenceLabel(unica), 'Apenas a 01/09/2026');
});

test('reuniões inativas não aparecem', () => {
  const list = [{ ...GERAL[0], active: false }];
  assert.deepEqual(upcomingMeetings(list, LUANDA, at('2026-09-17T09:00:00Z')), []);
});

test('hora de parede → instante respeita a mudança de hora num fuso com verão', () => {
  // 29 de março de 2026, Lisboa passa de UTC+0 para UTC+1 à 01:00.
  assert.equal(zonedToInstant({ year: 2026, month: 3, day: 29, hour: 10, minute: 0 }, 'Europe/Lisbon').toISOString(), '2026-03-29T09:00:00.000Z');
  assert.equal(zonedToInstant({ year: 2026, month: 3, day: 28, hour: 10, minute: 0 }, 'Europe/Lisbon').toISOString(), '2026-03-28T10:00:00.000Z');
});
