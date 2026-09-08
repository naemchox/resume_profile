-- Image sync via Supabase Storage (replaces inlining image bytes in the user_state row).
-- Run ONCE in Supabase → SQL Editor. Creates a private bucket 'user-images' and RLS so each
-- signed-in user can read/write ONLY files under their own {uid}/ folder. App path = {uid}/{hash}.
-- Safe to re-run (idempotent).

-- 1) Private bucket. file_size_limit + allowed_mime_types are enforced by Storage SERVER-SIDE,
-- before bytes hit disk — the 2MB RAW_GIF_MAX cap in the client JS is bypassable via DevTools / a
-- direct SDK call with a valid JWT, so this is the real lock against a user dumping huge files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-images', 'user-images', false, 2097152, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do nothing;

-- Enforce the cap on an ALREADY-created bucket too (on conflict do nothing above won't update it).
update storage.buckets
   set file_size_limit = 2097152,
       allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif']
 where id = 'user-images';

-- 2) Per-user RLS on storage.objects (the first path segment must equal the caller's uid)
drop policy if exists "user-images own select" on storage.objects;
drop policy if exists "user-images own insert" on storage.objects;
drop policy if exists "user-images own update" on storage.objects;
drop policy if exists "user-images own delete" on storage.objects;

create policy "user-images own select" on storage.objects for select to authenticated
  using (bucket_id = 'user-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "user-images own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'user-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "user-images own update" on storage.objects for update to authenticated
  using (bucket_id = 'user-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'user-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "user-images own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'user-images' and (storage.foldername(name))[1] = auth.uid()::text);
