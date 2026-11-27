-- Punktlandung: Admin (nur ein Konto)
-- In Supabase unter "SQL Editor" einfügen und auf "Run" klicken.
-- Kann gefahrlos mehrmals ausgeführt werden. Vorher muss supabase/lernzettel.sql gelaufen sein.
--
-- Der Admin darf:
--   - alle Konten (nur E-Mail, angemeldet seit, zuletzt angemeldet) sehen
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
create or replace function public.pl_admin_users()
returns table (email text, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.pl_is_admin() then
    raise exception 'Nur für den Admin' using errcode = '42501';
  end if;
  return query
    select u.email::text, u.created_at, u.last_sign_in_at
    from auth.users u
    order by u.created_at desc;
end;
$$;

revoke all on function public.pl_is_admin() from public, anon;
revoke all on function public.pl_admin_users() from public, anon;
grant execute on function public.pl_is_admin() to authenticated;
grant execute on function public.pl_admin_users() to authenticated;

-- 3) Für alle geteilte Dateien entfernen: wer sie geteilt hat – oder der Admin
drop policy if exists "Eigene Veröffentlichung beenden" on public.public_files;
create policy "Eigene Veröffentlichung beenden" on public.public_files
  for delete to authenticated using (auth.uid() = owner or public.pl_is_admin());
