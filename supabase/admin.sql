-- Punktlandung: Admin (nur ein Konto)
-- In Supabase unter "SQL Editor" einfügen und auf "Run" klicken.
-- Kann gefahrlos mehrmals ausgeführt werden. Vorher muss supabase/lernzettel.sql gelaufen sein.
--
-- Der Admin darf:
--   - alle Konten (nur E-Mail, angemeldet seit, zuletzt angemeldet, belegter Cloud-Speicher) sehen
--   - den Cloud-Speicher für Dateien pro Konto ein- und ausschalten (max. 10 Konten)
--   - für alle geteilte Dateien wieder entfernen (sonst darf das nur, wer sie geteilt hat)
-- Die Datei selbst bleibt dabei im privaten Speicher der Person, die sie geteilt hat.

-- 1) Bin ich der Admin?
create or replace function public.pl_is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid() and lower(u.email) = 'samuel.hollenhorst@gmail.com'
  );
$$;

-- 2) Alle Konten (nur für den Admin)
drop function if exists public.pl_admin_users();
create or replace function public.pl_admin_users()
returns table (id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, cloud boolean, used bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.pl_is_admin() then
    raise exception 'Nur für den Admin' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, u.created_at, u.last_sign_in_at,
           exists (select 1 from public.cloud_access a where a.user_id = u.id),
           public.pl_storage_used(u.id)
    from auth.users u
    order by u.created_at desc;
end;
$$;

-- Cloud-Zugriff für ein Konto ein- oder ausschalten. Gibt zurück, wie viele Konten danach Zugriff haben.
-- Ausschalten löscht keine Dateien: die Person kann nur nichts Neues mehr hochladen.
create or replace function public.pl_admin_set_cloud(uid uuid, enabled boolean)
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare n int;
begin
  if not public.pl_is_admin() then
    raise exception 'Nur für den Admin' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('pl_cloud_access'));
  if enabled then
    if not exists (select 1 from public.cloud_access a where a.user_id = uid) then
      select count(*) into n from public.cloud_access;
      if n >= 10 then
        raise exception 'Schon 10 Konten mit Cloud-Zugriff' using errcode = 'P0001';
      end if;
      insert into public.cloud_access (user_id) values (uid);
    end if;
  else
    delete from public.cloud_access a where a.user_id = uid;
  end if;
  select count(*) into n from public.cloud_access;
  return n;
end;
$$;

revoke all on function public.pl_is_admin() from public, anon;
revoke all on function public.pl_admin_set_cloud(uuid, boolean) from public, anon;
grant execute on function public.pl_admin_set_cloud(uuid, boolean) to authenticated;
revoke all on function public.pl_admin_users() from public, anon;
grant execute on function public.pl_is_admin() to authenticated;
grant execute on function public.pl_admin_users() to authenticated;

-- 3) Für alle geteilte Dateien entfernen: wer sie geteilt hat – oder der Admin
drop policy if exists "Eigene Veröffentlichung beenden" on public.public_files;
create policy "Eigene Veröffentlichung beenden" on public.public_files
  for delete to authenticated using (auth.uid() = owner or public.pl_is_admin());
