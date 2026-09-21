-- Announcements and posts, with comments and reactions.
--
-- Decided with the ISTN-SJ team:
-- - who may publish: the central team, a local editor for their own church,
--   the Apóstolo, and anyone the central team grants the right to in the panel;
-- - a post may be highlighted;
-- - only verified servants may comment; any account may react;
-- - anyone may read, with or without an account, as they read the directory.
--
-- Nothing here is a public feed anyone can write to: writing is a right the
-- team gives, and everything written can be hidden by the team that gave it.

begin;

-- ------------------------------------------------------ quem pode publicar --

-- Granted in the panel, to accounts whose servant claim the team approved. Only
-- the central team writes it (trigger below): a right one could give oneself
-- would be no right at all.
alter table public.app_users
  add column if not exists publish_scope text not null default 'nenhum';

do $$ begin
  alter table public.app_users
    add constraint app_users_publish_scope_known
    check (publish_scope in ('nenhum', 'igreja', 'global'));
exception when duplicate_object then null; end $$;

comment on column public.app_users.publish_scope is
  'nenhum, igreja (só a sua igreja) ou global (toda a ISTN). Só a equipa central o atribui.';

create or replace function public.is_apostolo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_users u join public.servos s on s.id = u.servo_id
     where u.id = auth.uid() and u.servo_claim_status = 'aprovado' and s.role = 'apostolo'
  );
$$;

create or replace function public.is_verified_servant()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_users
     where id = auth.uid() and servo_claim_status = 'aprovado' and servo_id is not null
  );
$$;

-- p_church null means the whole ISTN.
create or replace function public.can_publish(p_church uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_central()
    or public.is_apostolo()
    or exists (select 1 from public.app_users where id = auth.uid() and publish_scope = 'global')
    or (p_church is not null and (
         p_church = public.editor_church_id()
         or exists (select 1 from public.app_users
                     where id = auth.uid() and publish_scope = 'igreja' and home_church_id = p_church)
       ));
$$;

-- Hiding and deleting what others wrote: the central team anywhere, a local
-- editor within their own church.
create or replace function public.can_moderate(p_church uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_central()
    or (p_church is not null and p_church = public.editor_church_id());
$$;

-- --------------------------------------------------------------- posts -----

create table if not exists public.posts (
  id              uuid primary key default gen_random_uuid(),
  author_id       uuid not null references auth.users on delete cascade,
  -- null: the whole ISTN. Otherwise the church it belongs to.
  church_id       uuid references public.churches(id) on delete cascade,
  title           text,
  body            text not null check (length(btrim(body)) > 0),
  highlighted     boolean not null default false,
  highlight_until date,
  hidden          boolean not null default false,
  hidden_by       uuid references auth.users,
  hidden_at       timestamptz,
  published_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists posts_reading_idx on public.posts (hidden, published_at desc);
create index if not exists posts_church_idx on public.posts (church_id, published_at desc);

create table if not exists public.post_images (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  url        text not null check (url ~* '^https://'),
  caption    text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists post_images_post_idx on public.post_images (post_id, sort_order);

create table if not exists public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  author_id  uuid not null references auth.users on delete cascade,
  body       text not null check (length(btrim(body)) > 0 and length(body) <= 2000),
  hidden     boolean not null default false,
  hidden_by  uuid references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);

create table if not exists public.post_reactions (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  kind       text not null default 'amem' check (kind in ('amem', 'gosto', 'oracao')),
  created_at timestamptz not null default now(),
  -- One reaction per person per post: changing it replaces it.
  primary key (post_id, user_id)
);

-- ------------------------------------------------------------- gatilhos ----

-- Only the central team grants or withdraws the right to publish.
create or replace function public.protect_publish_scope()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_central() then
    return new;
  end if;
  new.publish_scope := old.publish_scope;
  return new;
end $$;

drop trigger if exists app_users_protect_publish on public.app_users;
create trigger app_users_protect_publish
  before update on public.app_users
  for each row execute function public.protect_publish_scope();

-- The author is always the person writing, and never changes afterwards.
create or replace function public.stamp_author()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
  else
    new.author_id := old.author_id;
  end if;
  return new;
end $$;

-- Who hid something, and when, recorded by the database rather than trusted
-- from the request.
create or replace function public.stamp_hidden()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.hidden and not old.hidden then
    new.hidden_by := auth.uid();
    if to_jsonb(new) ? 'hidden_at' then new.hidden_at := now(); end if;
  elsif not new.hidden and old.hidden then
    new.hidden_by := null;
    if to_jsonb(new) ? 'hidden_at' then new.hidden_at := null; end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  -- Reactions are left out of the audit log on purpose: thousands of taps are
  -- not a history anyone reads, and the log is for edits people must answer for.
  foreach t in array array['posts', 'post_images', 'post_comments'] loop
    execute format('drop trigger if exists %I_stamp on public.%I', t, t);
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.record_audit()', t, t);
  end loop;
  foreach t in array array['posts', 'post_images', 'post_comments', 'post_reactions'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create trigger posts_stamp before update on public.posts for each row execute function public.stamp_updated_at();
create trigger post_comments_stamp before update on public.post_comments for each row execute function public.stamp_updated_at();

drop trigger if exists posts_author on public.posts;
create trigger posts_author before insert or update on public.posts for each row execute function public.stamp_author();
drop trigger if exists post_comments_author on public.post_comments;
create trigger post_comments_author before insert or update on public.post_comments for each row execute function public.stamp_author();

drop trigger if exists posts_hidden on public.posts;
create trigger posts_hidden before update on public.posts for each row execute function public.stamp_hidden();
drop trigger if exists post_comments_hidden on public.post_comments;
create trigger post_comments_hidden before update on public.post_comments for each row execute function public.stamp_hidden();

-- ---------------------------------------------------------------- RLS ------

-- Anyone reads what is not hidden, with or without an account. The author and
-- whoever moderates that church keep seeing a hidden one, so the panel can
-- list it and put it back — and so that hiding is not refused for making the
-- row invisible to the very person hiding it.
create or replace function public.post_is_readable(p_hidden boolean, p_author uuid, p_church uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not p_hidden or p_author = auth.uid() or public.can_moderate(p_church);
$$;

drop policy if exists posts_public_read on public.posts;
create policy posts_public_read on public.posts
  for select using (public.post_is_readable(hidden, author_id, church_id));

drop policy if exists post_images_public_read on public.post_images;
create policy post_images_public_read on public.post_images
  for select using (exists (select 1 from public.posts p where p.id = post_id and public.post_is_readable(p.hidden, p.author_id, p.church_id)));

drop policy if exists post_comments_public_read on public.post_comments;
create policy post_comments_public_read on public.post_comments
  for select using (
    exists (select 1 from public.posts p
             where p.id = post_id
               and public.post_is_readable(p.hidden, p.author_id, p.church_id)
               and public.post_is_readable(post_comments.hidden, post_comments.author_id, p.church_id))
  );

drop policy if exists post_reactions_public_read on public.post_reactions;
create policy post_reactions_public_read on public.post_reactions for select using (true);

-- Writing a post: only where the person may publish. The author column is set
-- by the trigger, so with check does not have to trust it.
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts
  for insert to authenticated with check (public.can_publish(church_id));

-- Editing: the author, or whoever moderates that church.
drop policy if exists posts_update on public.posts;
create policy posts_update on public.posts
  for update to authenticated
  using (author_id = auth.uid() or public.can_moderate(church_id))
  with check (author_id = auth.uid() or public.can_moderate(church_id));

drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts
  for delete to authenticated
  using (author_id = auth.uid() or public.can_moderate(church_id));

drop policy if exists post_images_write on public.post_images;
create policy post_images_write on public.post_images
  for all to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and (p.author_id = auth.uid() or public.can_moderate(p.church_id))))
  with check (exists (select 1 from public.posts p where p.id = post_id and (p.author_id = auth.uid() or public.can_moderate(p.church_id))));

-- Commenting: verified servants only, as the team decided.
drop policy if exists post_comments_insert on public.post_comments;
create policy post_comments_insert on public.post_comments
  for insert to authenticated
  with check (
    (public.is_verified_servant() or public.is_central())
    and exists (select 1 from public.posts p where p.id = post_id and not p.hidden)
  );

drop policy if exists post_comments_update on public.post_comments;
create policy post_comments_update on public.post_comments
  for update to authenticated
  using (author_id = auth.uid() or public.can_moderate((select church_id from public.posts p where p.id = post_id)))
  with check (author_id = auth.uid() or public.can_moderate((select church_id from public.posts p where p.id = post_id)));

drop policy if exists post_comments_delete on public.post_comments;
create policy post_comments_delete on public.post_comments
  for delete to authenticated
  using (author_id = auth.uid() or public.can_moderate((select church_id from public.posts p where p.id = post_id)));

-- Reacting: any account, on its own row only.
drop policy if exists post_reactions_self on public.post_reactions;
create policy post_reactions_self on public.post_reactions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ------------------------------------------------- quem escreveu, em público --

-- A post or comment shows its author's name and, for a servant, their rank and
-- seal. app_users itself stays private, so this view exposes exactly those
-- fields and nothing else (no email, phone, city or church).
-- "drop" e não "create or replace": uma migração posterior acrescenta colunas a
-- esta vista, e um "replace" que as perdesse seria recusado pelo PostgreSQL —
-- o que impediria esta migração de voltar a correr, como DEPLOY.md exige.
drop view if exists public.post_authors;
create view public.post_authors as
  select u.id,
         coalesce(nullif(btrim(u.display_name), ''), 'Sem nome') as display_name,
         u.photo_url,
         s.role as servo_role,
         (u.servo_claim_status = 'aprovado' and u.servo_id is not null) as verified
    from public.app_users u
    left join public.servos s on s.id = u.servo_id
   where exists (select 1 from public.posts p where p.author_id = u.id)
      or exists (select 1 from public.post_comments c where c.author_id = u.id);

grant select on public.post_authors to anon, authenticated;

-- ----------------------------------------------------- imagens das publicações

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('publicacoes', 'publicacoes', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists publicacoes_public_read on storage.objects;
create policy publicacoes_public_read on storage.objects
  for select using (bucket_id = 'publicacoes');

-- Files live under publicacoes/<author id>/…, so a person can only add to and
-- clean up their own folder; the team can remove anything.
drop policy if exists publicacoes_write on storage.objects;
create policy publicacoes_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'publicacoes'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (
      public.can_publish(null)
      or public.editor_church_id() is not null
      or exists (select 1 from public.app_users where id = auth.uid() and publish_scope <> 'nenhum')
    )
  );

drop policy if exists publicacoes_delete on storage.objects;
create policy publicacoes_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'publicacoes' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_central()));

commit;
