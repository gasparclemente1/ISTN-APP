-- Keep the church's public identity, services and seat in one transaction.
begin;
alter table public.churches add column if not exists name text;
do $$ begin
  alter table public.churches add constraint churches_name_length
    check (name is null or (length(btrim(name)) between 1 and 160));
exception when duplicate_object then null; end $$;

create or replace function public.save_church(
  p_church uuid, p_details jsonb, p_services jsonb,
  p_change_seat boolean default false, p_seat text default null
) returns void language plpgsql security invoker set search_path = public as $$
declare
  previous public.churches;
  edited public.churches;
begin
  if auth.uid() is null or not (public.is_central() or coalesce(public.editor_church_id() = p_church, false)) then
    raise exception 'Não tem permissão para alterar esta igreja.';
  end if;
  if p_change_seat and not public.is_central() then
    raise exception 'Só a equipa central define as sedes.';
  end if;
  if jsonb_typeof(p_details) is distinct from 'object' or jsonb_typeof(p_services) is distinct from 'array' then
    raise exception 'Dados ou horários inválidos.';
  end if;
  select * into previous from public.churches where id = p_church for update;
  if not found then raise exception 'Igreja não encontrada.'; end if;
  edited := jsonb_populate_record(previous, p_details);
  -- Only the form's editable fields are accepted. Country, ids, seat and
  -- verification identity cannot be replaced by a crafted JSON object.
  update public.churches set
    name = nullif(btrim(edited.name), ''),
    place_type = edited.place_type, became_church_on = edited.became_church_on,
    locality = edited.locality, region = edited.region, address = edited.address,
    leader_name = edited.leader_name, leader_phone = edited.leader_phone,
    other_leaders = edited.other_leaders, whatsapp_group_url = edited.whatsapp_group_url,
    note = edited.note, verification_status = edited.verification_status,
    verified_at = case when edited.verification_status = 'verified' then
      case when previous.verification_status = 'verified' then previous.verified_at else now() end else null end,
    verified_by = case when edited.verification_status = 'verified' then
      case when previous.verification_status = 'verified' then previous.verified_by else auth.uid() end else null end
  where id = p_church;
  if not found then raise exception 'Não tem permissão para alterar esta igreja.'; end if;
  perform public.replace_church_services(p_church, p_services);
  -- Clear legacy values too, otherwise removing every service brings the
  -- old service_day back through the public normalizer's fallback.
  update public.churches set service_day = null, service_time_local = null where id = p_church;
  if p_change_seat then perform public.set_church_seat(p_church, p_seat); end if;
end $$;
revoke all on function public.save_church(uuid,jsonb,jsonb,boolean,text) from public, anon;
grant execute on function public.save_church(uuid,jsonb,jsonb,boolean,text) to authenticated;
comment on column public.churches.name is 'Nome público escolhido no Admin; vazio usa a localidade.';
commit;
