-- A church is born in the panel, not only in an import.
--
-- Until now the directory could only be edited: every place came from the
-- team's list, and a church opened this month had to wait for someone to write
-- SQL. The central team now adds one from the panel, and it is born complete —
-- identity, country, service times — in a single transaction, so a failure
-- halfway leaves nothing behind.
--
-- The modality joins the fields a church can be saved with: a place that met
-- online until a hall was found becomes presencial without anyone touching the
-- database by hand.

begin;

create or replace function public.save_church(
  p_church uuid, p_details jsonb, p_services jsonb,
  p_change_seat boolean default false, p_seat text default null,
  p_country_code text default null
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
  -- Only the form's editable fields are accepted. Ids, seat, country and
  -- verification identity cannot be replaced by a crafted JSON object; the
  -- modality is checked by the table's own constraint.
  update public.churches set
    name = nullif(btrim(edited.name), ''),
    modality = edited.modality,
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

  -- The country only changes when the panel sends a different code. The name
  -- the source list wrote ("Inglaterra") is then dropped, so the name shown
  -- comes from the list itself and the two can never disagree.
  if p_country_code is not null and p_country_code is distinct from previous.country_code then
    if p_country_code !~ '^[A-Z]{2}$' then
      raise exception 'País desconhecido: %.', p_country_code;
    end if;
    begin
      update public.churches set country_code = p_country_code, country = null where id = p_church;
    exception when unique_violation then
      raise exception 'Esse país já tem uma sede nacional. Tire-a primeiro ao outro lugar.';
    end;
  end if;

  perform public.replace_church_services(p_church, p_services);
  -- Clear legacy values too, otherwise removing every service brings the
  -- old service_day back through the public normalizer's fallback.
  update public.churches set service_day = null, service_time_local = null where id = p_church;
  if p_change_seat then perform public.set_church_seat(p_church, p_seat); end if;
end $$;

revoke all on function public.save_church(uuid, jsonb, jsonb, boolean, text, text) from public, anon;
grant execute on function public.save_church(uuid, jsonb, jsonb, boolean, text, text) to authenticated;

-- The new church's identifier is what its address in the app will be
-- (/igrejas/ao-kifica), so it is checked here rather than trusted: lower case,
-- digits and hyphens, and never one that already exists.
create or replace function public.create_church(
  p_record_id text, p_modality text, p_country_code text,
  p_details jsonb default '{}'::jsonb, p_services jsonb default '[]'::jsonb
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  born uuid;
begin
  if not public.is_central() then
    raise exception 'Só a equipa central acrescenta igrejas.';
  end if;
  if p_record_id is null or p_record_id !~ '^[a-z0-9][a-z0-9-]{1,60}$' then
    raise exception 'Identificador inválido: %.', coalesce(p_record_id, 'vazio');
  end if;
  if p_modality is null or p_modality not in ('physical', 'online') then
    raise exception 'Modalidade desconhecida: %.', coalesce(p_modality, 'vazia');
  end if;
  if p_country_code is null or p_country_code !~ '^[A-Z]{2}$' then
    raise exception 'País desconhecido: %.', coalesce(p_country_code, 'vazio');
  end if;

  begin
    insert into public.churches (record_id, modality, country_code, verification_status, source)
    values (p_record_id, p_modality, p_country_code, 'needs_review', 'Acrescentada no painel')
    returning id into born;
  exception when unique_violation then
    raise exception 'Já existe uma igreja com o identificador %.', p_record_id;
  end;

  -- The rest of the form goes through the same door as an edit, so a new
  -- church and an edited one can never be filled by different rules.
  perform public.save_church(born, p_details, p_services);
  return born;
end $$;

revoke all on function public.create_church(text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.create_church(text, text, text, jsonb, jsonb) to authenticated;

commit;
