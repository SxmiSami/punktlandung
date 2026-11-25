-- Punktlandung: Tabelle für die Synchronisierung
-- In Supabase unter "SQL Editor" einfügen und auf "Run" klicken.

create table if not exists public.user_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null,
  updated_at timestamptz not null default now()
);

-- Jeder darf nur seine eigenen Daten sehen und ändern
alter table public.user_data enable row level security;

drop policy if exists "Eigene Daten lesen" on public.user_data;
drop policy if exists "Eigene Daten anlegen" on public.user_data;
drop policy if exists "Eigene Daten ändern" on public.user_data;
drop policy if exists "Eigene Daten löschen" on public.user_data;

create policy "Eigene Daten lesen" on public.user_data
  for select using (auth.uid() = user_id);

create policy "Eigene Daten anlegen" on public.user_data
  for insert with check (auth.uid() = user_id);

create policy "Eigene Daten ändern" on public.user_data
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Eigene Daten löschen" on public.user_data
  for delete using (auth.uid() = user_id);
