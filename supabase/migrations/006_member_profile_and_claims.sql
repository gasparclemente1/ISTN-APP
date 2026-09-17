-- A fuller member profile, and a servant claim that names the role being asked for.
--
-- Until now a member could only press "pedir verificação": the request said
-- nothing about which role, so the team had nothing to check it against. The
-- member now states gender, role and church, and the central team approves or
-- refuses from the panel — approval creating the servant record and the badge
-- in one step.

alter table public.app_users
  add column if not exists gender       text,
  add column if not exists city         text,
  add column if not exists claimed_role text;

do $$ begin
  alter table public.app_users
    add constraint app_users_gender_known
    check (gender is null or gender in ('masculino', 'feminino'));
exception when duplicate_object then null; end $$;

-- The same rule servos enforces, less the Apóstolo: there is one, the founder,
-- and it is not a role anyone requests through an app.
-- Written with "is true" throughout: a check
-- constraint that evaluates to null passes, and with gender still null the
-- plain comparison would be null rather than false.
do $$ begin
  alter table public.app_users
    add constraint app_users_claimed_role_matches_gender
    check (
      claimed_role is null
      or (gender = 'feminino' and claimed_role in ('dona', 'obreira', 'futura_obreira')) is true
      or (gender = 'masculino' and claimed_role in ('bispo', 'bispo_auxiliar',
                                                    'pastor', 'pastor_auxiliar', 'discipulo',
                                                    'obreiro', 'futuro_obreiro')) is true
    );
exception when duplicate_object then null; end $$;

-- ------------------------------------------------- o que o membro pode mudar --

create or replace function public.protect_servo_claim()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_central() then
    return new;
  end if;

  -- Never the link to a servant record: that is what the badge reads.
  new.servo_id := old.servo_id;

  -- Two transitions are the member's own: asking (from nothing, or again after
  -- a refusal) and withdrawing a request still waiting. Nothing else, and in
  -- particular never approval.
  if new.servo_claim_status is distinct from old.servo_claim_status
     and not (
       (new.servo_claim_status = 'pendente' and old.servo_claim_status in ('nenhum', 'recusado'))
       or (new.servo_claim_status = 'nenhum' and old.servo_claim_status = 'pendente')
     ) then
    new.servo_claim_status := old.servo_claim_status;
  end if;

  -- While a request is under review or approved, what it rests on stays put.
  -- Changing role or gender underneath it would leave the team approving
  -- something other than what it read.
  if old.servo_claim_status in ('pendente', 'aprovado')
     and new.servo_claim_status = old.servo_claim_status then
    new.claimed_role := old.claimed_role;
    new.gender := old.gender;
  end if;

  return new;
end $$;

-- ------------------------------------------------------- aprovar e recusar --

-- One call, one transaction: create (or pick) the servant record and link the
-- account to it. Done as two requests from the panel, a failure between them
-- would leave a servant nobody's account points at.
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
    insert into public.servos (full_name, gender, role, phone, church_id, photo_url)
    values (coalesce(nullif(trim(member.display_name), ''), 'Sem nome'),
            member.gender, member.claimed_role, member.phone,
            member.home_church_id, member.photo_url)
    returning id into servant;
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

create or replace function public.reject_servo_claim(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_central() then
    raise exception 'Só a equipa central pode recusar pedidos.';
  end if;
  update public.app_users
     set servo_claim_status = 'recusado', servo_id = null
   where id = p_user and servo_claim_status = 'pendente';
  if not found then
    raise exception 'Este pedido já não está pendente.';
  end if;
end $$;

revoke all on function public.approve_servo_claim(uuid, uuid) from public, anon;
revoke all on function public.reject_servo_claim(uuid) from public, anon;
grant execute on function public.approve_servo_claim(uuid, uuid) to authenticated;
grant execute on function public.reject_servo_claim(uuid) to authenticated;
