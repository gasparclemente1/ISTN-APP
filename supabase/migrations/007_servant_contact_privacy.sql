-- A servant's phone number is not public, and a link is only ever https.
--
-- 003 let anyone read every column of servos without signing in, phone
-- included: the publishable key ships to every browser, so any visitor could
-- list the numbers of every bispo, pastor and obreira. The directory never
-- needed them — it shows the church's contact, not each servant's.
--
-- Row level security decides which rows, not which columns, so the number moves
-- to its own table. It is private unless the servant chooses otherwise:
-- - the team reads it (the central team every number, a local editor those of
--   their own church) to do its work;
-- - the public reads it only where phone_public is true;
-- - phone_public is the servant's own choice, made from their verified account.
--   The team can correct a number but can never publish it, and a number the
--   team changes goes back to private, since the choice was about the old one.
--
-- The second part is defence in depth for the app's links. The panel already
-- refuses anything but https, but a value written some other way (the SQL
-- editor, a future script) would otherwise reach a page as a "javascript:" link.

begin;

-- ------------------------------------------------------ contacto dos servos --

create table if not exists public.servo_contacts (
  servo_id     uuid primary key references public.servos(id) on delete cascade,
  phone        text,
  phone_public boolean not null default false,
  updated_at   timestamptz not null default now()
);

alter table public.servo_contacts
  add column if not exists phone_public boolean not null default false;

comment on column public.servo_contacts.phone_public is
  'Se o número aparece no diretório público. Só o próprio servo o decide, a partir da sua conta verificada.';

-- Copied across before the column goes, in the same transaction, so no number
-- is lost if anything below fails.
do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'servos' and column_name = 'phone') then
    insert into public.servo_contacts (servo_id, phone)
    select id, phone from public.servos where phone is not null
    on conflict (servo_id) do nothing;
    alter table public.servos drop column phone;
  end if;
end $$;

-- The church a local editor looks after; null for anyone else. security definer
-- so policies can ask without being granted read access to admin_profiles.
create or replace function public.editor_church_id()
returns uuid language sql stable security definer set search_path = public as $$
  select church_id from public.admin_profiles where id = auth.uid();
$$;

drop trigger if exists servo_contacts_stamp on public.servo_contacts;
drop trigger if exists servo_contacts_audit on public.servo_contacts;
create trigger servo_contacts_stamp
  before update on public.servo_contacts
  for each row execute function public.stamp_updated_at();
create trigger servo_contacts_audit
  after insert or update or delete on public.servo_contacts
  for each row execute function public.record_audit();

-- The account linked to this servant, once the team approved the claim.
create or replace function public.is_servant_self(p_servo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_users
     where id = auth.uid() and servo_id = p_servo and servo_claim_status = 'aprovado'
  );
$$;

-- Nobody but the servant may turn visibility on; a number changed by anyone
-- else is private again until the servant says otherwise.
create or replace function public.protect_phone_visibility()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_servant_self(new.servo_id) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.phone_public := false;
  elsif new.phone is distinct from old.phone then
    new.phone_public := false;
  else
    new.phone_public := old.phone_public;
  end if;
  return new;
end $$;

drop trigger if exists servo_contacts_protect on public.servo_contacts;
create trigger servo_contacts_protect
  before insert or update on public.servo_contacts
  for each row execute function public.protect_phone_visibility();

alter table public.servo_contacts enable row level security;
revoke all on public.servo_contacts from anon;
grant select on public.servo_contacts to anon;

-- Anyone may read a number its servant chose to show, and only that.
drop policy if exists servo_contacts_public_read on public.servo_contacts;
create policy servo_contacts_public_read on public.servo_contacts
  for select using (phone_public);

-- The servant reads and writes their own number and its visibility.
drop policy if exists servo_contacts_self on public.servo_contacts;
create policy servo_contacts_self on public.servo_contacts
  for all to authenticated
  using (public.is_servant_self(servo_id))
  with check (public.is_servant_self(servo_id));

drop policy if exists servo_contacts_team on public.servo_contacts;
create policy servo_contacts_team on public.servo_contacts
  for all to authenticated
  using (
    public.is_central()
    or exists (select 1 from public.servos s
                where s.id = servo_id and s.church_id = public.editor_church_id())
  )
  with check (
    public.is_central()
    or exists (select 1 from public.servos s
                where s.id = servo_id and s.church_id = public.editor_church_id())
  );

-- record_audit keys rows on "id"; this table's key is servo_id.
create or replace function public.record_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (table_name, record_id, action, changed_by, old_value, new_value)
  values (
    tg_table_name,
    coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id',
             to_jsonb(new) ->> 'servo_id', to_jsonb(old) ->> 'servo_id', 'unknown'),
    lower(tg_op),
    auth.uid(),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return null;
end $$;

-- Approval copied the member's phone into servos.phone, which no longer exists.
create or replace function public.approve_servo_claim(p_user uuid, p_servo uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  member public.app_users;
  servant uuid;
begin
  if not public.is_central() then
    raise exception 'Só a equipa central pode aprovar pedidos.';
  end if;

  select * into member from public.app_users where id = p_user for update;
  if not found then
    raise exception 'Utilizador não encontrado.';
  end if;
  if member.servo_claim_status <> 'pendente' then
    raise exception 'Este pedido já não está pendente.';
  end if;

  if p_servo is null then
    if member.claimed_role is null or member.gender is null then
      raise exception 'O pedido não indica função e género.';
    end if;
    insert into public.servos (full_name, gender, role, church_id, photo_url)
    values (coalesce(nullif(trim(member.display_name), ''), 'Sem nome'),
            member.gender, member.claimed_role,
            member.home_church_id, member.photo_url)
    returning id into servant;
    if member.phone is not null then
      insert into public.servo_contacts (servo_id, phone) values (servant, member.phone);
    end if;
  else
    perform 1 from public.servos where id = p_servo;
    if not found then
      raise exception 'O servo indicado não existe.';
    end if;
    servant := p_servo;
  end if;

  update public.app_users
     set servo_id = servant, servo_claim_status = 'aprovado'
   where id = p_user;
  return servant;
end $$;

revoke all on function public.approve_servo_claim(uuid, uuid) from public, anon;
grant execute on function public.approve_servo_claim(uuid, uuid) to authenticated;

-- ------------------------------------------------------------ só https -----

-- "not valid": enforced for every new write, without refusing the migration
-- over a row written before the rule existed. The panel shows such a row; a
-- person fixes it on the next save.
do $$ begin
  alter table public.meetings add constraint meetings_zoom_url_https
    check (zoom_url is null or zoom_url ~* '^https://') not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.churches add constraint churches_whatsapp_group_url_https
    check (whatsapp_group_url is null or whatsapp_group_url ~* '^https://') not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.churches add constraint churches_photo_url_https
    check (photo_url is null or photo_url ~* '^https://') not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.servos add constraint servos_photo_url_https
    check (photo_url is null or photo_url ~* '^https://') not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.app_users add constraint app_users_photo_url_https
    check (photo_url is null or photo_url ~* '^https://') not valid;
exception when duplicate_object then null; end $$;

commit;
