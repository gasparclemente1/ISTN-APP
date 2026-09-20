-- The church's country is chosen from a list, never typed.
--
-- Typed by hand, the same country arrives as "Brasil", "brasil" and "Brazil",
-- and the directory shows three groups where there is one. The panel now
-- offers the list in src/countries.js (ISO 3166, names in European
-- Portuguese), and the country travels as a parameter of its own — not inside
-- the details object, which save_church deliberately refuses to trust.

begin;

do $$ begin
  alter table public.churches
    add constraint churches_country_code_format
    check (country_code is null or country_code ~ '^[A-Z]{2}$');
exception when duplicate_object then null; end $$;

comment on column public.churches.country_code is
  'Código ISO 3166 de duas letras, escolhido da lista do painel. O nome mostrado vem daí.';
comment on column public.churches.country is
  'Nome do país como a equipa o escreveu na lista de origem. Vazio: usa-se o nome do código.';

-- Replaced, not overloaded: two functions with the same name would leave
-- PostgREST to guess which one a call means.
drop function if exists public.save_church(uuid, jsonb, jsonb, boolean, text);

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
      -- Only one national seat per country: moving this place would give the
      -- new country a second one.
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

commit;
