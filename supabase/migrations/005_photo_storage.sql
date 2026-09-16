-- Somewhere to put uploaded photographs.
--
-- The app stored photo_url and expected someone to paste a link, which meant
-- the picture lived somewhere nobody controlled and could vanish. Files now go
-- to Supabase storage, and photo_url holds the address of what was uploaded.

alter table public.app_users
  add column if not exists photo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Two megabytes is generous for what the app displays; the browser shrinks a
-- photograph before it is sent, so a phone camera file never arrives whole.

-- --------------------------------------------------------------- acesso ----

-- Anyone may look: these pictures appear in the public directory.
drop policy if exists fotos_public_read on storage.objects;
create policy fotos_public_read on storage.objects
  for select using (bucket_id = 'fotos');

-- Folder decides who may write. A member owns only the file named after them;
-- servants' and churches' photographs belong to the team.
drop policy if exists fotos_member_write on storage.objects;
create policy fotos_member_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fotos'
    and (
      (storage.foldername(name))[1] = 'membros' and (storage.foldername(name))[2] = auth.uid()::text
      or (storage.foldername(name))[1] in ('servos', 'igrejas') and public.is_central()
    )
  );

drop policy if exists fotos_member_update on storage.objects;
create policy fotos_member_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'fotos'
    and (
      (storage.foldername(name))[1] = 'membros' and (storage.foldername(name))[2] = auth.uid()::text
      or (storage.foldername(name))[1] in ('servos', 'igrejas') and public.is_central()
    )
  );

drop policy if exists fotos_member_delete on storage.objects;
create policy fotos_member_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'fotos'
    and (
      (storage.foldername(name))[1] = 'membros' and (storage.foldername(name))[2] = auth.uid()::text
      or (storage.foldername(name))[1] in ('servos', 'igrejas') and public.is_central()
    )
  );
