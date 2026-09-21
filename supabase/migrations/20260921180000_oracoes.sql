-- As orações do Profeta Elias, por tema.
--
-- O que a equipa descreveu: o Profeta grava orações para o que as pessoas
-- estão a viver — depressão, coma, doença — e são os pastores que as procuram,
-- descarregam e enviam a quem precisa, quase sempre por WhatsApp. Quem recebe
-- muitas vezes nem tem a aplicação: o que lhe chega é o ficheiro.
--
-- Isso decide o desenho. Não é uma biblioteca para ouvir: é um catálogo para
-- encontrar depressa e entregar. Daí que o tema seja a chave de tudo — é a
-- pergunta que a pessoa traz — e que o áudio seja mesmo um ficheiro nosso, e
-- não um link para outro sítio, porque é no ecrã apagado, longe da aplicação,
-- que a oração vai ser ouvida.
--
-- Ler não precisa de conta, como tudo o resto aqui: quem está em aflição às
-- duas da manhã não devia esbarrar num pedido de registo. Publicar é de quem a
-- equipa autoriza a falar para toda a ISTN.

begin;

-- ------------------------------------------------------------- os temas ----

create table if not exists public.prayer_themes (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  sort_order integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.prayer_themes is
  'Os temas de oração, como a equipa os nomeou. A ordem é a que a equipa deu, não a alfabética.';

-- Os seis que a equipa nomeou, pelas palavras dela e pela ordem dela.
-- "on conflict do nothing": correr a migração outra vez não desfaz um nome que
-- a equipa tenha entretanto corrigido.
insert into public.prayer_themes (slug, name, sort_order) values
  ('financas-portas-abertas', 'Finanças e portas abertas', 1),
  ('libertacao-geral',        'Libertação Geral',          2),
  ('cancer-coma',             'Câncer & Coma',             3),
  ('doencas',                 'Doenças',                   4),
  ('oracao-geral',            'Oração geral',              5),
  ('outros',                  'Outros',                    6)
on conflict (slug) do nothing;

-- ---------------------------------------------------------- as orações -----

create table if not exists public.prayers (
  id               uuid primary key default gen_random_uuid(),
  theme_id         uuid references public.prayer_themes(id) on delete set null,
  title            text not null check (length(btrim(title)) > 0),
  -- Para quem procura: em que caso se usa esta oração. Aparece por baixo do
  -- título e é o que a procura lê, além do título e do tema.
  description      text,
  audio_url        text not null check (audio_url ~* '^https://'),
  duration_seconds integer check (duration_seconds is null or duration_seconds between 1 and 36000),
  file_bytes       bigint,
  hidden           boolean not null default false,
  published_at     timestamptz not null default now(),
  created_by       uuid references auth.users,
  updated_at       timestamptz not null default now()
);

create index if not exists prayers_theme_idx on public.prayers (theme_id, published_at desc);
create index if not exists prayers_reading_idx on public.prayers (hidden, published_at desc);

-- Quem pode acrescentar e corrigir orações: a equipa central, o Apóstolo, e
-- quem a equipa autorizou a publicar para toda a ISTN. É a mesma autorização
-- que já existe no painel — quem fala em nome da ISTN inteira — e não um
-- direito novo que alguém tenha de ir atribuir outra vez.
create or replace function public.can_manage_prayers()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_central()
      or public.is_apostolo()
      or exists (select 1 from public.app_users where id = auth.uid() and publish_scope = 'global');
$$;

create or replace function public.stamp_prayer_author()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := old.created_by;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['prayer_themes', 'prayers'] loop
    execute format('drop trigger if exists %I_stamp on public.%I', t, t);
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format('create trigger %I_stamp before update on public.%I for each row execute function public.stamp_updated_at()', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.record_audit()', t, t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

drop trigger if exists prayers_author on public.prayers;
create trigger prayers_author before insert or update on public.prayers
  for each row execute function public.stamp_prayer_author();

-- ---------------------------------------------------------------- RLS ------

revoke all on public.prayer_themes from anon;
revoke all on public.prayers from anon;
grant select on public.prayer_themes to anon, authenticated;
grant select on public.prayers to anon, authenticated;

drop policy if exists prayer_themes_public_read on public.prayer_themes;
create policy prayer_themes_public_read on public.prayer_themes for select using (true);

drop policy if exists prayer_themes_write on public.prayer_themes;
create policy prayer_themes_write on public.prayer_themes
  for all to authenticated
  using (public.can_manage_prayers()) with check (public.can_manage_prayers());

-- Escondida, só quem a pode gerir continua a vê-la — para a poder repor.
drop policy if exists prayers_public_read on public.prayers;
create policy prayers_public_read on public.prayers
  for select using (not hidden or public.can_manage_prayers());

drop policy if exists prayers_write on public.prayers;
create policy prayers_write on public.prayers
  for all to authenticated
  using (public.can_manage_prayers()) with check (public.can_manage_prayers());

-- ------------------------------------------------------- os ficheiros ------

-- Voz em 64 kbps mono dá meio megabyte por minuto: 25 MB chegam para uma
-- oração de quarenta minutos, e travam um ficheiro enviado por engano com a
-- qualidade de um estúdio.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('oracoes', 'oracoes', true, 26214400, array['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/wav'])
on conflict (id) do update
  set public = true,
      file_size_limit = 26214400,
      allowed_mime_types = array['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/wav'];

drop policy if exists oracoes_public_read on storage.objects;
create policy oracoes_public_read on storage.objects
  for select using (bucket_id = 'oracoes');

drop policy if exists oracoes_write on storage.objects;
create policy oracoes_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'oracoes' and public.can_manage_prayers());

drop policy if exists oracoes_update on storage.objects;
create policy oracoes_update on storage.objects
  for update to authenticated
  using (bucket_id = 'oracoes' and public.can_manage_prayers());

drop policy if exists oracoes_delete on storage.objects;
create policy oracoes_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'oracoes' and public.can_manage_prayers());

commit;
