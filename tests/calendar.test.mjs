import assert from 'node:assert/strict';
import { buildCalendar, escapeIcsText, foldIcsLine } from '../src/calendar.js';

const now = new Date('2026-09-17T09:00:00Z');
const lines = (ics) => ics.replace(/\r\n /g, '').split('\r\n');

test('uma entrada por reunião com hora, com fuso de Luanda e alarme', () => {
  const ics = buildCalendar([
    { id: 'geral', title: 'Live no Zoom, com o Apóstolo', recurrence: 'weekly', weekdays: [0, 3], start_time: '19:30', zoom_url: 'https://zoom.us/j/1', zoom_meeting_id: '784 134 3109', zoom_passcode: 'ISTN21' },
    { id: 'terca', title: 'Sem hora', recurrence: 'weekly', weekdays: [2], start_time: null, time_note: 'Após' }
  ], { now });
  const all = lines(ics);
  assert.equal(all.filter((line) => line === 'BEGIN:VEVENT').length, 1);
  assert.ok(all.includes('DTSTART;TZID=Africa/Luanda:20260920T193000'));
  assert.ok(all.includes('RRULE:FREQ=WEEKLY;BYDAY=SU,WE'));
  assert.ok(all.includes('TZOFFSETTO:+0100'));
  assert.ok(all.includes('SUMMARY:Live no Zoom\\, com o Apóstolo'));
  assert.ok(all.includes('UID:reuniao-geral@elias-istn-sj'));
  assert.ok(all.includes('TRIGGER:-PT15M'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('uma reunião depois da meia-noite fica no dia certo em todas as semanas', () => {
  // 00:30 de segunda em Luanda é 23:30 de domingo em UTC: em UTC o BYDAY=MO
  // puxaria todas as semanas seguintes um dia para a frente.
  const ics = buildCalendar([{ id: 'vigilia', title: 'Vigília', recurrence: 'weekly', weekdays: [1], start_time: '00:30' }], { now });
  assert.ok(lines(ics).includes('DTSTART;TZID=Africa/Luanda:20260921T003000'));
  assert.ok(lines(ics).includes('RRULE:FREQ=WEEKLY;BYDAY=MO'));
});

test('último sábado e anual têm as regras certas; um link inseguro não entra', () => {
  const ics = buildCalendar([
    { id: 'c', title: 'Crianças', recurrence: 'monthly_last', weekdays: [6], start_time: '19:30', zoom_url: 'javascript:alert(1)' },
    { id: 'v', title: 'Vigília', recurrence: 'yearly', event_date: '2026-12-31', start_time: '22:00' }
  ], { now });
  const all = lines(ics);
  assert.ok(all.includes('RRULE:FREQ=MONTHLY;BYDAY=-1SA'));
  assert.ok(all.includes('RRULE:FREQ=YEARLY'));
  assert.ok(!ics.includes('javascript'));
});

test('texto escapado e linhas dobradas a 75 octetos sem partir acentos', () => {
  assert.equal(escapeIcsText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  const folded = foldIcsLine(`SUMMARY:${'ção'.repeat(40)}`);
  const encoder = new TextEncoder();
  folded.split('\r\n').forEach((part) => assert.ok(encoder.encode(part).length <= 75));
  assert.equal(folded.replace(/\r\n /g, ''), `SUMMARY:${'ção'.repeat(40)}`);
});
