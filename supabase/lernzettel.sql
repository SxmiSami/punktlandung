-- Punktlandung: Online-Speicher für Lernzettel (Dateien + Teilen)
-- In Supabase unter "SQL Editor" einfügen und auf "Run" klicken.
-- Kann gefahrlos mehrmals ausgeführt werden.
--
-- Grenzen (kostenloser Supabase-Plan: 1 GB Speicher für alle zusammen):
--   250 MB pro Person  (4 Personen × 250 MB = 1 GB)
--   25 MB pro Datei
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

-- 4) Regeln für die Dateien
drop policy if exists "Lernzettel hochladen" on storage.objects;
drop policy if exists "Lernzettel lesen" on storage.objects;
drop policy if exists "Lernzettel löschen" on storage.objects;

-- Nur in den eigenen Ordner und nur, solange die 250 MB nicht voll sind
create policy "Lernzettel hochladen" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'lernzettel'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.pl_storage_used(auth.uid()) < 250 * 1024 * 1024
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
