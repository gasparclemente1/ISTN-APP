-- Saving a church's service times in one transaction.
--
-- The panel replaced a church's times with two requests: delete them all, then
-- insert the new list. When the second failed — two rows for the same day and
-- hour, a dropped connection, a permission refused — the church was left with
-- no service times at all, and the congregation saw "horário a confirmar".
--
-- security invoker, so row level security still decides: a local editor can
-- replace the times of their own church and of no other. Any error rolls the
-- whole call back and the previous times stay as they were.

create or replace function public.replace_church_services(p_church uuid, p_services jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare
  kept integer;
begin
  if jsonb_typeof(coalesce(p_services, '[]'::jsonb)) <> 'array' then
    raise exception 'Os horários têm de ser uma lista.';
  end if;

  -- The church must be one this person may edit; otherwise the delete below
  -- silently matches nothing and the insert is refused, which would read as a
  -- confusing permission error.
  perform 1 from public.churches where id = p_church;
  if not found then
    raise exception 'Igreja não encontrada.';
  end if;

  delete from public.church_services where church_id = p_church;

  insert into public.church_services (church_id, weekday, start_time, label)
  select p_church,
         (service ->> 'weekday')::smallint,
         nullif(service ->> 'start_time', '')::time,
         nullif(trim(service ->> 'label'), '')
    from jsonb_array_elements(coalesce(p_services, '[]'::jsonb)) as service;

  get diagnostics kept = row_count;
  if kept <> jsonb_array_length(coalesce(p_services, '[]'::jsonb)) then
    raise exception 'Nem todos os horários foram guardados.';
  end if;
end $$;

revoke all on function public.replace_church_services(uuid, jsonb) from public, anon;
grant execute on function public.replace_church_services(uuid, jsonb) to authenticated;
