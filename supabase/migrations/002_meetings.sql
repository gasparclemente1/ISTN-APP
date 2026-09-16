-- Several meetings, each with its own Zoom room and its own recurrence.
--
-- live_config held a single room and one weekly schedule. The ministry also
-- runs the ministers' live every Tuesday, the children's live on the last
-- Saturday of each month, the new year vigil every 31 December, and one-off
-- specials — none of which that shape could express.
--
-- Four recurrence patterns cover everything asked for:
--   weekly        weekdays, e.g. {1,4} for Monday and Thursday
--   monthly_last  the last <weekdays[1]> of each month
--   yearly        the month and day of event_date, any year
--   once          event_date exactly

create table if not exists public.meetings (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  kind            text not null default 'especial' check (kind in ('geral', 'especial')),
  zoom_url        text,
  zoom_meeting_id text,
  zoom_passcode   text,
  start_time      time,
  time_note       text,
  recurrence      text not null check (recurrence in ('weekly', 'monthly_last', 'yearly', 'once')),
  weekdays        smallint[] not null default '{}',
  event_date      date,
  active          boolean not null default true,
  sort_order      integer not null default 0,
  updated_at      timestamptz not null default now(),

  -- A meeting must carry the fields its own pattern needs.
  -- coalesce, because array_length of an empty array is null, and a check
  -- constraint that evaluates to null passes.
  constraint meetings_pattern_complete check (
    (recurrence = 'weekly'       and coalesce(array_length(weekdays, 1), 0) >= 1)
    or (recurrence = 'monthly_last' and coalesce(array_length(weekdays, 1), 0) = 1)
    or (recurrence in ('yearly', 'once') and event_date is not null)
  ),
  -- Either a fixed start time, or an explanation of when it begins.
  constraint meetings_has_timing check (start_time is not null or time_note is not null)
);

create index if not exists meetings_active_idx on public.meetings (active, sort_order);

drop trigger if exists meetings_stamp on public.meetings;
drop trigger if exists meetings_audit on public.meetings;
create trigger meetings_stamp
  before update on public.meetings
  for each row execute function public.stamp_updated_at();
create trigger meetings_audit
  after insert or update or delete on public.meetings
  for each row execute function public.record_audit();

alter table public.meetings enable row level security;

drop policy if exists meetings_public_read on public.meetings;
create policy meetings_public_read on public.meetings
  for select using (true);

drop policy if exists meetings_write on public.meetings;
create policy meetings_write on public.meetings
  for update to authenticated using (public.is_central());

drop policy if exists meetings_insert on public.meetings;
create policy meetings_insert on public.meetings
  for insert to authenticated with check (public.is_central());

drop policy if exists meetings_delete on public.meetings;
create policy meetings_delete on public.meetings
  for delete to authenticated using (public.is_central());


-- The meetings the ministry runs today. The general ones reuse the room that
-- live_config already held; the specials have no room assigned yet, so the
-- panel shows them as needing one.
insert into public.meetings (title, kind, zoom_url, zoom_meeting_id, zoom_passcode, start_time, time_note, recurrence, weekdays, event_date, sort_order)
select * from (values
  ('Live no Zoom com o Apóstolo Marcelino Mário Bento', 'geral',
   'https://us02web.zoom.us/j/7841343109?pwd=NW1qd1EwZEhIRlBiZFpLUjExVWY0Zz09', '784 134 3109', 'ISTN21',
   '19:30'::time, null, 'weekly', '{0,3,5,6}'::smallint[], null::date, 10),

  ('Live no Zoom com o Apóstolo Marcelino Mário Bento', 'geral',
   'https://us02web.zoom.us/j/7841343109?pwd=NW1qd1EwZEhIRlBiZFpLUjExVWY0Zz09', '784 134 3109', 'ISTN21',
   '20:30'::time, null, 'weekly', '{1,4}'::smallint[], null::date, 11),

  ('Live no Zoom com o Apóstolo Marcelino Mário Bento', 'geral',
   'https://us02web.zoom.us/j/7841343109?pwd=NW1qd1EwZEhIRlBiZFpLUjExVWY0Zz09', '784 134 3109', 'ISTN21',
   null::time, 'Após a live dos ministros', 'weekly', '{2}'::smallint[], null::date, 12),

  ('Live dos Ministros', 'especial', null, null, null,
   '20:00'::time, null, 'weekly', '{2}'::smallint[], null::date, 20),

  ('Live das Crianças', 'especial', null, null, null,
   '19:30'::time, null, 'monthly_last', '{6}'::smallint[], null::date, 21),

  ('Vigília de Fim de Ano', 'especial', null, null, null,
   null::time, 'A confirmar pela equipa', 'yearly', '{}'::smallint[], date '2026-12-31', 22)
) as seed
where not exists (select 1 from public.meetings);
