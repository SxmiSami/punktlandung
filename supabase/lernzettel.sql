-- Punktlandung: Online-Speicher für Lernzettel (Dateien + Teilen)
-- In Supabase unter "SQL Editor" einfügen und auf "Run" klicken.
-- Kann gefahrlos mehrmals ausgeführt werden.
--
-- Grenzen (kostenloser Supabase-Plan: 1 GB Speicher für alle zusammen):
--   65 MB pro Person   (ausgelegt auf 10 Personen)
--   25 MB pro Datei
--   900 MB für alle zusammen (Puffer zum 1 GB des kostenlosen Plans)
--   max. 10 Konten mit Cloud-Zugriff (schaltet der Admin, siehe supabase/admin.sql)
-- Geprüft wird vor dem Hochladen, eine Datei kann also noch drüber gehen:
-- 10 × (65 + 25) MB = 900 MB. Deshalb werden auch Uploads abgelehnt,
-- sobald alle zusammen 875 MB (900 − 25) belegt haben – so bleibt das 1 GB
-- auch mit mehr Konten sicher.
-- Wenn du die Grenzen änderst, auch in js/config.js anpassen.

-- 1) Speicher-Bucket (privat – nur über die Regeln unten erreichbar)
insert into storage.buckets (id, name, public, file_size_limit)
values ('lernzettel', 'lernzettel', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- 2) Wie viel hat eine Person schon belegt? (Bytes)
create or replace function public.pl_storage_used(uid uuid default auth.uid())
returns bigint
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint
  from storage.objects o
  where o.bucket_id = 'lernzettel' and (storage.foldername(o.name))[1] = uid::text;
$$;

-- Wie viel ist insgesamt belegt? (alle Personen zusammen, Bytes)
create or replace function public.pl_storage_total()
returns bigint
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint
  from storage.objects o
  where o.bucket_id = 'lernzettel';
$$;

-- Freund über die E-Mail-Adresse finden (gibt nur die ID zurück, keine weiteren Daten)
create or replace function public.pl_find_user(email text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select u.id from auth.users u where lower(u.email) = lower(trim(pl_find_user.email)) limit 1;
$$;

revoke all on function public.pl_storage_used(uuid) from public, anon;
revoke all on function public.pl_storage_total() from public, anon;
revoke all on function public.pl_find_user(text) from public, anon;
grant execute on function public.pl_storage_used(uuid) to authenticated;
grant execute on function public.pl_storage_total() to authenticated;
grant execute on function public.pl_find_user(text) to authenticated;

-- 3) Geteilte Lernzettel
create table if not exists public.note_shares (
  id              uuid primary key default gen_random_uuid(),
  owner           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipient       uuid not null references auth.users (id) on delete cascade,
  path            text not null,          -- <owner-id>/<zettel-id> im Bucket
  note_id         text not null,
  title           text not null default '',
  subject         text not null default '',
  subject_short   text not null default '',
  subject_color   text not null default '',
  mime            text not null default '',
  size            bigint not null default 0,
  owner_name      text not null default '',
  owner_email     text not null default '',
  recipient_email text not null default '',
  created_at      timestamptz not null default now(),
  unique (path, recipient)
);

-- E-Mail-Adressen trägt die Datenbank selbst ein (kann nicht gefälscht werden)
create or replace function public.pl_note_share_fill()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.owner_email := coalesce((select u.email from auth.users u where u.id = new.owner), '');
  new.recipient_email := coalesce((select u.email from auth.users u where u.id = new.recipient), '');
  return new;
end;
$$;
drop trigger if exists pl_note_share_fill on public.note_shares;
create trigger pl_note_share_fill before insert or update on public.note_shares
  for each row execute function public.pl_note_share_fill();

revoke all on public.note_shares from anon;
grant select, insert, update, delete on public.note_shares to authenticated;
alter table public.note_shares enable row level security;

drop policy if exists "Geteilte Zettel sehen" on public.note_shares;
drop policy if exists "Eigene Zettel teilen" on public.note_shares;
drop policy if exists "Eigene Freigaben ändern" on public.note_shares;
drop policy if exists "Freigaben entfernen" on public.note_shares;

create policy "Geteilte Zettel sehen" on public.note_shares
  for select using (auth.uid() = owner or auth.uid() = recipient);
create policy "Eigene Zettel teilen" on public.note_shares
  for insert with check (auth.uid() = owner and split_part(path, '/', 1) = auth.uid()::text and recipient <> auth.uid());
create policy "Eigene Freigaben ändern" on public.note_shares
  for update using (auth.uid() = owner) with check (auth.uid() = owner and split_part(path, '/', 1) = auth.uid()::text);
-- Besitzer kann die Freigabe zurücknehmen, Empfänger kann sie aus seiner Liste entfernen
create policy "Freigaben entfernen" on public.note_shares
  for delete using (auth.uid() = owner or auth.uid() = recipient);

-- 3b) Cloud-Zugriff: nur freigeschaltete Konten dürfen Dateien hochladen (max. 10).
--     Anmelden können sich beliebig viele – ohne Freischaltung bleiben Dateien nur auf dem Gerät.
do $$
begin
  if to_regclass('public.cloud_access') is null then
    create table public.cloud_access (
      user_id     uuid primary key references auth.users (id) on delete cascade,
      granted_at  timestamptz not null default now()
    );
    -- Nur beim ersten Mal: die 10 ältesten Konten freischalten, damit niemand plötzlich ausgesperrt ist
    insert into public.cloud_access (user_id)
      select u.id from auth.users u order by u.created_at limit 10;
  end if;
end $$;
-- Keine Regeln = kein direkter Zugriff; nur über die Funktionen (hier und in admin.sql)
alter table public.cloud_access enable row level security;

create or replace function public.pl_has_cloud()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.cloud_access a where a.user_id = auth.uid());
$$;
revoke all on function public.pl_has_cloud() from public, anon;
grant execute on function public.pl_has_cloud() to authenticated;

-- 4) Regeln für die Dateien
drop policy if exists "Lernzettel hochladen" on storage.objects;
drop policy if exists "Lernzettel lesen" on storage.objects;
drop policy if exists "Lernzettel löschen" on storage.objects;

-- Nur mit Cloud-Zugriff, nur in den eigenen Ordner und nur, solange die 65 MB (eigene) und 875 MB (alle) nicht voll sind
create policy "Lernzettel hochladen" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'lernzettel'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.pl_has_cloud()
    and public.pl_storage_used(auth.uid()) < 65 * 1024 * 1024
    and public.pl_storage_total() < 875 * 1024 * 1024
  );

-- Eigene Dateien und Dateien, die mit einem geteilt wurden
create policy "Lernzettel lesen" on storage.objects
  for select to authenticated using (
    bucket_id = 'lernzettel'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.note_shares s where s.path = storage.objects.name and s.recipient = auth.uid())
    )
  );

create policy "Lernzettel löschen" on storage.objects
  for delete to authenticated using (
    bucket_id = 'lernzettel' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 5) Für alle geteilte Dateien (seit 0.9.0)
--    Jede angemeldete Person sieht diese Liste und darf die Dateien lesen.
create table if not exists public.public_files (
  id              uuid primary key default gen_random_uuid(),
  owner           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  path            text not null unique,   -- <owner-id>/<datei-id> im Bucket
  note_id         text not null,
  title           text not null default '',
  subject         text not null default '',
  subject_short   text not null default '',
  subject_color   text not null default '',
  exam_title      text not null default '',
  exam_date       text not null default '',
  mime            text not null default '',
  size            bigint not null default 0,
  owner_name      text not null default '',
  owner_email     text not null default '',
  created_at      timestamptz not null default now()
);

create or replace function public.pl_public_file_fill()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.owner_email := coalesce((select u.email from auth.users u where u.id = new.owner), '');
  return new;
end;
$$;
drop trigger if exists pl_public_file_fill on public.public_files;
create trigger pl_public_file_fill before insert or update on public.public_files
  for each row execute function public.pl_public_file_fill();

revoke all on public.public_files from anon;
grant select, insert, update, delete on public.public_files to authenticated;
alter table public.public_files enable row level security;

drop policy if exists "Öffentliche Dateien sehen" on public.public_files;
drop policy if exists "Eigene Dateien veröffentlichen" on public.public_files;
drop policy if exists "Eigene Veröffentlichung ändern" on public.public_files;
drop policy if exists "Eigene Veröffentlichung beenden" on public.public_files;

create policy "Öffentliche Dateien sehen" on public.public_files
  for select to authenticated using (true);
create policy "Eigene Dateien veröffentlichen" on public.public_files
  for insert to authenticated with check (auth.uid() = owner and split_part(path, '/', 1) = auth.uid()::text);
create policy "Eigene Veröffentlichung ändern" on public.public_files
  for update to authenticated using (auth.uid() = owner) with check (auth.uid() = owner and split_part(path, '/', 1) = auth.uid()::text);
create policy "Eigene Veröffentlichung beenden" on public.public_files
  for delete to authenticated using (auth.uid() = owner);

-- Leseregel für die Dateien erweitern: auch für alle geteilte Dateien
drop policy if exists "Lernzettel lesen" on storage.objects;
create policy "Lernzettel lesen" on storage.objects
  for select to authenticated using (
    bucket_id = 'lernzettel'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.note_shares s where s.path = storage.objects.name and s.recipient = auth.uid())
      or exists (select 1 from public.public_files p where p.path = storage.objects.name)
    )
  );
