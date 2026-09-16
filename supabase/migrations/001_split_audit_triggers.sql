-- Split the audit trigger in two, for projects created before this fix.
--
-- The original trigger ran BEFORE INSERT, and a BEFORE INSERT trigger still
-- fires for rows that "insert ... on conflict do nothing" then skips. Running
-- seed.sql a second time therefore logged 86 inserts that never happened,
-- which is how a freshly seeded database ended up with 172 audit rows.
--
-- Stamping updated_at and recording the audit are now separate triggers:
-- BEFORE UPDATE for the timestamp, AFTER for the log.

create or replace function public.stamp_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.record_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (table_name, record_id, action, changed_by, old_value, new_value)
  values (
    tg_table_name,
    coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id', 'unknown'),
    lower(tg_op),
    auth.uid(),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return null;
end $$;

drop trigger if exists churches_audit on public.churches;
drop trigger if exists churches_stamp on public.churches;
create trigger churches_stamp
  before update on public.churches
  for each row execute function public.stamp_updated_at();
create trigger churches_audit
  after insert or update or delete on public.churches
  for each row execute function public.record_audit();

drop trigger if exists live_config_audit on public.live_config;
drop trigger if exists live_config_stamp on public.live_config;
create trigger live_config_stamp
  before update on public.live_config
  for each row execute function public.stamp_updated_at();
create trigger live_config_audit
  after insert or update or delete on public.live_config
  for each row execute function public.record_audit();


-- Optional, and deliberately not part of the migration above.
--
-- Clears the duplicate import entries, keeping the earliest row for each
-- record. It deletes from an audit log, so run it only if you want that
-- history tidied; leaving the rows in place is harmless.
--
--   delete from public.audit_log a
--    where a.action = 'insert'
--      and exists (
--        select 1 from public.audit_log b
--         where b.action = 'insert'
--           and b.table_name = a.table_name
--           and b.record_id  = a.record_id
--           and b.id < a.id
--      );
