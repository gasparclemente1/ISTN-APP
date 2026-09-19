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

test('fica "a decorrer" até às 6h de Luanda, e só então aparece a próxima', () => {
  // Quinta 20:30 em Luanda: a live começou.
  const live = nextMeeting(GERAL, LUANDA, at('2026-09-17T20:15:00Z'));
  assert.equal(live.meeting.id, 'b');
  assert.equal(live.isLive, true);
  // Às 23:30 e às 05:59 de sexta ainda é a live de quinta.
  assert.equal(nextMeeting(GERAL, LUANDA, at('2026-09-17T22:30:00Z')).isLive, true);
  const beforeSix = nextMeeting(GERAL, LUANDA, at('2026-09-18T04:59:00Z'));
  assert.equal(beforeSix.meeting.id, 'b');
  assert.equal(beforeSix.start.toISOString(), '2026-09-17T19:30:00.000Z');
  assert.equal(beforeSix.until.toISOString(), '2026-09-18T05:00:00.000Z');
  // Às 06:00 de sexta, a próxima: sexta às 19:30.
  const after = nextMeeting(GERAL, LUANDA, at('2026-09-18T05:00:00Z'));
  assert.equal(after.meeting.id, 'a');
  assert.equal(after.isLive, false);
  assert.equal(after.start.toISOString(), '2026-09-18T18:30:00.000Z');
});

test('depois da meia-noite, a live da véspera continua a ser a que está a decorrer', () => {
  // Quarta 01:00 em Luanda: a live dos ministros começou terça às 20:00.
  const tuesdayNight = nextMeeting(GERAL, LUANDA, at('2026-09-23T00:00:00Z'));
  assert.equal(tuesdayNight.meeting.id, 'd');
  assert.equal(tuesdayNight.isLive, true);
  // A vigília de 31 de dezembro às 22:00 ainda está a decorrer às 3h de 1 de janeiro.
  const vigilia = { id: 'v', recurrence: 'yearly', event_date: '2026-12-31', start_time: '22:00' };
  const newYear = nextOccurrence(vigilia, LUANDA, at('2027-01-01T02:00:00Z'));
  assert.equal(newYear.isLive, true);
  assert.equal(newYear.start.toISOString(), '2026-12-31T21:00:00.000Z');
});

test('duas reuniões no mesmo dia: a que começou por último é a que está a decorrer', () => {
  const morning = { id: 'm', recurrence: 'once', event_date: '2026-09-19', start_time: '10:00' };
  const list = [morning, ...GERAL];
  // Sábado às 20:00 em Luanda: a da manhã ainda conta até às 6h, mas a live
  // das 19:30 começou depois.
  assert.equal(nextMeeting(list, LUANDA, at('2026-09-19T19:00:00Z')).meeting.id, 'a');
  assert.equal(nextMeeting(list, LUANDA, at('2026-09-19T12:00:00Z')).meeting.id, 'm');
});

test('uma reunião de madrugada tem pelo menos as duas horas habituais', () => {
  const early = { id: 'e', recurrence: 'once', event_date: '2026-09-20', start_time: '05:00' };
  const occurrence = nextOccurrence(early, LUANDA, at('2026-09-20T04:30:00Z'));
  assert.equal(occurrence.isLive, true);
  assert.equal(occurrence.until.toISOString(), '2026-09-20T06:00:00.000Z');
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
