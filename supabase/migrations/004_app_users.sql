-- Accounts for congregation members, and the servant verification claim.
--
-- Using the app needs no account. This table is only for people who chose one,
-- to carry preferences across devices and to ask for a servant badge.

create table if not exists public.app_users (
  id                 uuid primary key references auth.users on delete cascade,
  display_name       text,
  phone              text,
  country_code       text,
  home_church_id     uuid references public.churches(id) on delete set null,
  language           text not null default 'pt',
  meeting_reminders  boolean not null default true,
  servo_id           uuid references public.servos(id) on delete set null,
  servo_claim_status text not null default 'nenhum'
                     check (servo_claim_status in ('nenhum', 'pendente', 'aprovado', 'recusado')),
  servo_claim_note   text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- An approved claim must point at a servant, and only an approved one may.
  constraint app_users_claim_consistent check (
    (servo_claim_status = 'aprovado' and servo_id is not null)
    or (servo_claim_status <> 'aprovado' and servo_id is null)
  )
);

create table if not exists public.favorites (
  user_id     uuid not null references public.app_users(id) on delete cascade,
  teaching_id text not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, teaching_id)
);

-- ------------------------------------------------------- selo protegido ----

-- The badge is a trust signal: if a person could grant it to themselves it
-- would mean nothing. So even on their own row, a member may not write
-- servo_id or approve their own claim. They may only ask.
create or replace function public.protect_servo_claim()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_central() then
    return new;
  end if;
  new.servo_id := old.servo_id;
  -- The one transition a member may make: asking, or asking again after a refusal.
  if new.servo_claim_status is distinct from old.servo_claim_status
     and not (new.servo_claim_status = 'pendente' and old.servo_claim_status in ('nenhum', 'recusado')) then
    new.servo_claim_status := old.servo_claim_status;
  end if;
  return new;
end $$;

drop trigger if exists app_users_protect on public.app_users;
create trigger app_users_protect
  before update on public.app_users
  for each row execute function public.protect_servo_claim();

drop trigger if exists app_users_stamp on public.app_users;
create trigger app_users_stamp
  before update on public.app_users
  for each row execute function public.stamp_updated_at();

drop trigger if exists app_users_audit on public.app_users;
create trigger app_users_audit
  after insert or update or delete on public.app_users
  for each row execute function public.record_audit();

-- ----------------------------------------------------------------- RLS -----

alter table public.app_users enable row level security;
alter table public.favorites enable row level security;

-- Deliberately not the policy used for churches and meetings. There the
-- central team reads everything, and should. A member of the congregation is
-- not administrative data: the team sees only the rows it must act on, which
-- are the verification claims.
drop policy if exists app_users_self_read on public.app_users;
create policy app_users_self_read on public.app_users
  for select to authenticated
  using (id = auth.uid() or (public.is_central() and servo_claim_status in ('pendente', 'aprovado')));

drop policy if exists app_users_self_write on public.app_users;
create policy app_users_self_write on public.app_users
  for update to authenticated
  using (id = auth.uid() or public.is_central())
  with check (id = auth.uid() or public.is_central());

drop policy if exists app_users_self_insert on public.app_users;
create policy app_users_self_insert on public.app_users
  for insert to authenticated with check (id = auth.uid());

drop policy if exists favorites_self on public.favorites;
create policy favorites_self on public.favorites
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
