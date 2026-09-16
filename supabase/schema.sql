-- ELIAS / ISTN-SJ — admin database schema
--
-- Run once in the Supabase SQL editor, then run seed.sql.
-- Everything the congregation reads is world-readable; everything the team
-- edits requires a signed-in account whose role is recorded in admin_profiles.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- roles ----

do $$ begin
  create type public.admin_role as enum ('central', 'local');
exception when duplicate_object then null; end $$;

create table if not exists public.admin_profiles (
  id          uuid primary key references auth.users on delete cascade,
  full_name   text,
  role        public.admin_role not null default 'local',
  church_id   uuid,
  created_at  timestamptz not null default now()
);

create or replace function public.is_central()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_profiles
    where id = auth.uid() and role = 'central'
  );
$$;

-- ------------------------------------------------------------ churches ----

create table if not exists public.churches (
  id                  uuid primary key default gen_random_uuid(),
  record_id           text unique,
  modality            text not null check (modality in ('physical', 'online')),
  country_code        text,
  country             text,
  region              text,
  locality            text,
  service_day         text,
  service_time_local  text,
  leader_name         text,
  leader_phone        text,
  note                text,
  source              text,
  verification_status text not null default 'needs_review'
                      check (verification_status in ('needs_review', 'verified')),
  verified_at         timestamptz,
  verified_by         uuid references auth.users,
  updated_at          timestamptz not null default now()
);

alter table public.admin_profiles
  add constraint admin_profiles_church_fk
  foreign key (church_id) references public.churches(id) on delete set null;

-- --------------------------------------------------------- live config ----

-- One row. The schedule keeps the JSON shape the app already renders.
create table if not exists public.live_config (
  id                uuid primary key default gen_random_uuid(),
  singleton         boolean not null default true unique check (singleton),
  title             text not null,
  subtitle          text,
  time_zone         text not null default 'Africa/Luanda',
  zoom_url          text,
  zoom_meeting_id   text,
  zoom_passcode     text,
  youtube_url       text,
  note              text,
  duration_minutes  integer not null default 120,
  schedule          jsonb not null default '[]'::jsonb,
  updated_at        timestamptz not null default now()
);

-- ------------------------------------------------------------- audit ------

create table if not exists public.audit_log (
  id          bigserial primary key,
  table_name  text not null,
  record_id   text not null,
  action      text not null,
  changed_by  uuid references auth.users,
  changed_at  timestamptz not null default now(),
  old_value   jsonb,
  new_value   jsonb
);

create or replace function public.stamp_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Records who changed what, when, and both values, as the spec requires.
-- A trigger rather than application code, so no edit path can skip it.
--
-- AFTER, not BEFORE: a BEFORE INSERT trigger still fires for rows that
-- "insert ... on conflict do nothing" goes on to skip, which would log
-- changes that never happened every time the seed is re-run.
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

-- --------------------------------------------------------------- RLS ------

alter table public.churches       enable row level security;
alter table public.live_config    enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.audit_log      enable row level security;

-- The congregation reads the directory and the schedule without signing in.
drop policy if exists churches_public_read on public.churches;
create policy churches_public_read on public.churches
  for select using (true);

drop policy if exists live_config_public_read on public.live_config;
create policy live_config_public_read on public.live_config
  for select using (true);

-- Central team edits anything; a local editor edits only its own congregation.
drop policy if exists churches_write on public.churches;
create policy churches_write on public.churches
  for update to authenticated
  using (
    public.is_central()
    or id = (select church_id from public.admin_profiles where id = auth.uid())
  );

drop policy if exists churches_insert on public.churches;
create policy churches_insert on public.churches
  for insert to authenticated with check (public.is_central());

drop policy if exists live_config_write on public.live_config;
create policy live_config_write on public.live_config
  for update to authenticated using (public.is_central());

-- A signed-in person sees only their own profile; the central team sees all.
drop policy if exists admin_profiles_read on public.admin_profiles;
create policy admin_profiles_read on public.admin_profiles
  for select to authenticated
  using (id = auth.uid() or public.is_central());

drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log
  for select to authenticated using (public.is_central());
