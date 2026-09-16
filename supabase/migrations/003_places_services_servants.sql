-- Places, their service times, and the servants who lead them.
--
-- Follows product/data-model.md. Three changes, in one migration because the
-- church_services rows are built from columns this same migration retires.

-- ------------------------------------------------- igreja / casa de oração --

alter table public.churches
  add column if not exists place_type         text,
  add column if not exists became_church_on   date,
  add column if not exists address            text,
  add column if not exists whatsapp_group_url text,
  add column if not exists photo_url          text;

do $$ begin
  alter table public.churches
    add constraint churches_place_type_known
    check (place_type is null or place_type in ('igreja', 'casa_de_oracao'));
exception when duplicate_object then null; end $$;

-- Deliberately left null rather than defaulted to 'igreja'. A casa de oração
-- is what an igreja begins as, so calling all 83 unverified records igrejas
-- would tell some of them they are something they are not. The panel shows the
-- gap; a person fills it in when confirming the record.

comment on column public.churches.place_type is
  'igreja ou casa_de_oracao. Nulo enquanto ninguém tiver confirmado qual é.';

-- ----------------------------------------------------- horários de culto ----

-- A church may hold one service on Saturday and another on Sunday, which the
-- single service_day/service_time_local pair could not express.
create table if not exists public.church_services (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches(id) on delete cascade,
  weekday     smallint not null check (weekday between 0 and 6),
  start_time  time,
  label       text,
  updated_at  timestamptz not null default now(),
  unique (church_id, weekday, start_time)
);

create index if not exists church_services_church_idx on public.church_services (church_id);

-- Carry the existing single service across before those columns are retired.
-- Three records name a day with no time; they come across with a null time
-- rather than being dropped, because "meets on Sunday, time unknown" is real
-- information and the panel can then ask for the missing hour.
-- Guarded by not exists rather than on conflict: a unique constraint treats
-- nulls as distinct, so those three would duplicate on a second run.
insert into public.church_services (church_id, weekday, start_time)
select c.id,
       case c.service_day when 'Domingo' then 0 when 'Sábado' then 6 end,
       c.service_time_local::time
  from public.churches c
 where c.service_day in ('Domingo', 'Sábado')
   and not exists (select 1 from public.church_services s where s.church_id = c.id);

-- service_day and service_time_local are kept for now: the app still reads
-- them, and dropping a column destroys what it holds. They go once the app
-- reads church_services.

-- ------------------------------------------------------------- servos ------

create table if not exists public.servos (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  gender      text not null check (gender in ('masculino', 'feminino')),
  role        text not null check (role in (
                'apostolo', 'bispo', 'bispo_auxiliar', 'pastor', 'pastor_auxiliar',
                'discipulo', 'obreiro', 'futuro_obreiro',
                'dona', 'obreira', 'futura_obreira')),
  -- Derived, never written: stored separately it would one day read Obreiro
  -- and minister at the same time.
  is_minister boolean generated always as (
                role in ('apostolo', 'bispo', 'bispo_auxiliar', 'pastor',
                         'pastor_auxiliar', 'discipulo')
              ) stored,
  phone       text,
  church_id   uuid references public.churches(id) on delete set null,
  photo_url   text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- The ministry's own rule, enforced here so the structure refuses the error
  -- instead of recording it.
  constraint servos_role_matches_gender check (
    (gender = 'feminino'  and role in ('dona', 'obreira', 'futura_obreira'))
    or (gender = 'masculino' and role in ('apostolo', 'bispo', 'bispo_auxiliar',
                                          'pastor', 'pastor_auxiliar', 'discipulo',
                                          'obreiro', 'futuro_obreiro'))
  )
);

create index if not exists servos_church_idx on public.servos (church_id, active);

-- ------------------------------------------------ gatilhos e permissões ----

do $$
declare t text;
begin
  foreach t in array array['church_services', 'servos'] loop
    execute format('drop trigger if exists %I_stamp on public.%I', t, t);
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format('create trigger %I_stamp before update on public.%I for each row execute function public.stamp_updated_at()', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.record_audit()', t, t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- The congregation reads both without signing in: a service time and who leads
-- a church are what the directory is for.
drop policy if exists church_services_public_read on public.church_services;
create policy church_services_public_read on public.church_services for select using (true);

drop policy if exists servos_public_read on public.servos;
create policy servos_public_read on public.servos for select using (true);

-- Central edits anything; a local editor only its own church.
drop policy if exists church_services_write on public.church_services;
create policy church_services_write on public.church_services
  for all to authenticated
  using (public.is_central() or church_id = (select church_id from public.admin_profiles where id = auth.uid()))
  with check (public.is_central() or church_id = (select church_id from public.admin_profiles where id = auth.uid()));

drop policy if exists servos_write on public.servos;
create policy servos_write on public.servos
  for all to authenticated
  using (public.is_central() or church_id = (select church_id from public.admin_profiles where id = auth.uid()))
  with check (public.is_central() or church_id = (select church_id from public.admin_profiles where id = auth.uid()));
