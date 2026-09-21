-- Três coisas que a equipa pediu, decididas juntas em 21/09/2026:
--
-- 1. Comunidades (ML — Mulher no Lar, Acção Social, Grupo Jovem): uma etiqueta
--    no anúncio, a mesma em toda a ISTN. Não é um grupo com membros nem com
--    página própria — é a forma de dizer de quem é o anúncio e de o filtrar.
--    Fica numa tabela, e não numa lista escrita no código, para que a equipa
--    possa acrescentar outra comunidade sem esperar por uma nova versão da
--    aplicação.
--
-- 2. Quem reagiu, pelo nome, como no Facebook. As reações já eram legíveis por
--    toda a gente; faltava ligar cada uma à pessoa sem abrir app_users, que
--    guarda o email, o telefone e a cidade. Daí uma vista com exatamente as
--    mesmas colunas que post_authors já mostra — nome, foto, função e selo.
--
-- 3. Ocultar o contacto: a escolha deixa de ser só do servo verificado e passa
--    a ser de qualquer conta. O interruptor vive agora em app_users, e o
--    número no diretório (servo_contacts, migração 007) segue-o.

begin;

-- ------------------------------------------------------------ comunidades --

create table if not exists public.communities (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  short_name  text,
  description text,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.communities is
  'Comunidades da ISTN-SJ (ML, Acção Social, Grupo Jovem…). São de toda a ISTN, não de cada igreja, e servem de etiqueta dos anúncios.';

-- As três que a equipa nomeou. "on conflict do nothing": correr a migração
-- outra vez não desfaz um nome que a equipa tenha entretanto corrigido.
insert into public.communities (slug, name, short_name, description, sort_order) values
  ('ml',           'Mulher no Lar', 'ML',            'Movimento das mulheres da igreja.', 1),
  ('accao-social', 'Acção Social',  'Acção Social',  'O que a igreja faz por quem precisa.', 2),
  ('grupo-jovem',  'Grupo Jovem',   'Grupo Jovem',   'Os jovens da ISTN-SJ.', 3)
on conflict (slug) do nothing;

alter table public.posts
  add column if not exists community_id uuid references public.communities(id) on delete set null;

comment on column public.posts.community_id is
  'A comunidade de que é o anúncio. Nulo: é para toda a gente.';

create index if not exists posts_community_idx on public.posts (community_id, published_at desc);

drop trigger if exists communities_stamp on public.communities;
create trigger communities_stamp
  before update on public.communities
  for each row execute function public.stamp_updated_at();

drop trigger if exists communities_audit on public.communities;
create trigger communities_audit
  after insert or update or delete on public.communities
  for each row execute function public.record_audit();

alter table public.communities enable row level security;
revoke all on public.communities from anon;
grant select on public.communities to anon, authenticated;

-- Toda a gente lê a lista, com conta ou sem ela, como lê o diretório.
drop policy if exists communities_public_read on public.communities;
create policy communities_public_read on public.communities for select using (true);

-- Criar, renomear ou desativar uma comunidade é da equipa central: uma
-- etiqueta que qualquer um pudesse inventar deixaria de querer dizer alguma
-- coisa.
drop policy if exists communities_central_write on public.communities;
create policy communities_central_write on public.communities
  for all to authenticated
  using (public.is_central()) with check (public.is_central());

-- ------------------------------------------------------- quem reagiu -------

-- As mesmas colunas que post_authors mostra, e nada mais: app_users continua
-- fechada. A vista corre como o seu dono, por isso não precisa de acesso a
-- app_users para quem a lê; o que filtra as linhas é a política de leitura de
-- post_reactions, que já era pública.
create or replace view public.post_reaction_people as
  select r.post_id,
         r.kind,
         r.created_at,
         u.id as user_id,
         coalesce(nullif(btrim(u.display_name), ''), 'Sem nome') as display_name,
         u.photo_url,
         s.role as servo_role,
         (u.servo_claim_status = 'aprovado' and u.servo_id is not null) as verified
    from public.post_reactions r
    join public.app_users u on u.id = r.user_id
    left join public.servos s on s.id = u.servo_id
   where exists (
     select 1 from public.posts p
      where p.id = r.post_id and public.post_is_readable(p.hidden, p.author_id, p.church_id)
   );

grant select on public.post_reaction_people to anon, authenticated;

-- ------------------------------------------------- ocultar o contacto ------

alter table public.app_users
  add column if not exists phone_public boolean not null default false;

comment on column public.app_users.phone_public is
  'Se o número da pessoa pode ser mostrado a outros. Por omissão não. Só o próprio o decide.';

-- Quem já era servo e tinha escolhido mostrar o número continua a mostrá-lo:
-- a escolha foi feita, não se pede outra vez.
update public.app_users u
   set phone_public = true
  from public.servo_contacts c
 where c.servo_id = u.servo_id
   and u.servo_claim_status = 'aprovado'
   and c.phone_public
   and not u.phone_public;

-- O diretório continua a ler servo_contacts (migração 007). Para que não haja
-- duas respostas à mesma pergunta, a escolha vive em app_users e a linha do
-- diretório segue-a. O número em si só viaja quando é o próprio a mudá-lo na
-- sua conta: o que a equipa corrigiu no painel não é apagado por isto.
-- security definer: o gatilho escreve numa tabela cuja política de escrita é
-- só do próprio, e protect_phone_visibility volta a confirmar a escolha.
create or replace function public.mirror_phone_visibility()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.servo_id is null or new.servo_claim_status <> 'aprovado' then
    return null;
  end if;
  insert into public.servo_contacts (servo_id, phone, phone_public)
  values (new.servo_id, new.phone, new.phone_public)
  on conflict (servo_id) do update
    set phone_public = excluded.phone_public,
        phone = case when new.phone is distinct from old.phone
                     then excluded.phone
                     else public.servo_contacts.phone end;
  return null;
end $$;

-- Sem "update of <colunas>": um gatilho assim só dispara quando a coluna é
-- nomeada na ordem, e não quando é outro gatilho a mudá-la. O que interessa é
-- o valor, e é isso que o "when" compara.
drop trigger if exists app_users_mirror_phone on public.app_users;
create trigger app_users_mirror_phone
  after update on public.app_users
  for each row
  when (new.servo_id is not null
        and (new.phone is distinct from old.phone
             or new.phone_public is distinct from old.phone_public
             or new.servo_id is distinct from old.servo_id
             or new.servo_claim_status is distinct from old.servo_claim_status))
  execute function public.mirror_phone_visibility();

-- 007 punha o número outra vez privado sempre que não era o próprio servo a
-- escrever a linha — o que agora incluiria o gatilho acima, quando é a
-- aprovação de um pedido a criá-la. As duas regras de 007 mantêm-se: ninguém
-- senão o servo escolhe, e um número corrigido por outra mão volta a privado,
-- porque o consentimento era sobre o número antigo. O que muda é que a escolha
-- já registada na conta é transportada em vez de ser deitada fora: quem
-- escreve a linha não escolhe, repete.
create or replace function public.protect_phone_visibility()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner_choice boolean;
begin
  if public.is_servant_self(new.servo_id) then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.phone is distinct from old.phone then
    new.phone_public := false;
    return new;
  end if;

  select u.phone_public into owner_choice
    from public.app_users u
   where u.servo_id = new.servo_id and u.servo_claim_status = 'aprovado'
   limit 1;
  if owner_choice is not null then
    new.phone_public := owner_choice;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.phone_public := false;
  else
    new.phone_public := old.phone_public;
  end if;
  return new;
end $$;

-- E o contrário: uma linha do diretório que muda de visibilidade — por mão do
-- próprio servo, ou pela regra acima quando a equipa corrige o número — diz-lo
-- à conta, para que o interruptor no perfil nunca afirme o contrário do que o
-- diretório mostra. Fica num gatilho AFTER, e não dentro do BEFORE: uma
-- alteração feita antes da escrita voltaria, pelo espelho, à mesma linha que a
-- ordem em curso está a alterar, e o PostgreSQL recusa-a.
create or replace function public.sync_phone_choice_back()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.app_users
     set phone_public = new.phone_public
   where servo_id = new.servo_id
     and servo_claim_status = 'aprovado'
     and phone_public is distinct from new.phone_public;
  return null;
end $$;

drop trigger if exists servo_contacts_sync_choice on public.servo_contacts;
create trigger servo_contacts_sync_choice
  after update on public.servo_contacts
  for each row
  when (new.phone_public is distinct from old.phone_public)
  execute function public.sync_phone_choice_back();

commit;
