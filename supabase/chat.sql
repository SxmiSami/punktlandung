-- Punktlandung: Chat mit Freunden (Einzel- und Gruppenchats)
-- In Supabase unter "SQL Editor" einfügen und auf "Run" klicken.
-- Vorher einmal supabase/schema.sql und supabase/lernzettel.sql ausführen.
-- Kann gefahrlos mehrmals ausgeführt werden.
--
-- Sicherheit: Nachrichten sieht nur, wer im Chat ist. Chats anlegen, Leute
-- hinzufügen und Verlassen geht nur über die Funktionen unten – direkt in die
-- Tabellen schreiben darf man nur eigene Nachrichten.

-- 1) Tabellen
create table if not exists public.chats (
  id          uuid primary key default gen_random_uuid(),
  is_group    boolean not null default false,
  name        text not null default '',          -- nur bei Gruppen
  direct_key  text unique,                       -- Einzelchat: "<id-a>:<id-b>" (sortiert)
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.chat_members (
  chat_id      uuid not null references public.chats (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  email        text not null default '',          -- trägt die Datenbank selbst ein
  name         text not null default '',          -- Anzeigename (aus den Einstellungen)
  joined_at    timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);
create index if not exists chat_members_user on public.chat_members (user_id);

create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  chat_id     uuid not null references public.chats (id) on delete cascade,
  sender      uuid default auth.uid() references auth.users (id) on delete set null,
  sender_name text not null default '',
  kind        text not null default 'text' check (kind in ('text', 'note', 'event', 'system')),
  body        text not null default '' check (char_length(body) <= 2000),
  payload     jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists chat_messages_chat_time on public.chat_messages (chat_id, created_at desc);
create index if not exists chat_messages_note_path on public.chat_messages ((payload->>'path')) where kind = 'note';

-- 2) Bin ich in diesem Chat?
create or replace function public.pl_chat_member(c uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.chat_members m where m.chat_id = c and m.user_id = auth.uid());
$$;

-- 3) Rechte und Regeln
revoke all on public.chats, public.chat_members, public.chat_messages from anon, authenticated;
grant select on public.chats to authenticated;
grant select on public.chat_members to authenticated;
grant select, delete on public.chat_messages to authenticated;
-- Absender und Zeit setzt die Datenbank selbst
grant insert (id, chat_id, sender_name, kind, body, payload) on public.chat_messages to authenticated;

alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "Eigene Chats sehen" on public.chats;
drop policy if exists "Mitglieder sehen" on public.chat_members;
drop policy if exists "Nachrichten lesen" on public.chat_messages;
drop policy if exists "Nachrichten schreiben" on public.chat_messages;
drop policy if exists "Eigene Nachrichten löschen" on public.chat_messages;

create policy "Eigene Chats sehen" on public.chats
  for select to authenticated using (public.pl_chat_member(id));
create policy "Mitglieder sehen" on public.chat_members
  for select to authenticated using (public.pl_chat_member(chat_id));
create policy "Nachrichten lesen" on public.chat_messages
  for select to authenticated using (public.pl_chat_member(chat_id));
-- Nur als man selbst, nur in eigene Chats, und Lernzettel nur aus dem eigenen Ordner
create policy "Nachrichten schreiben" on public.chat_messages
  for insert to authenticated with check (
    sender = auth.uid()
    and public.pl_chat_member(chat_id)
    and kind in ('text', 'note', 'event')
    and (kind <> 'note' or split_part(coalesce(payload->>'path', ''), '/', 1) = auth.uid()::text)
  );
create policy "Eigene Nachrichten löschen" on public.chat_messages
  for delete to authenticated using (sender = auth.uid() and kind <> 'system');

-- 4) Funktionen für die App
create or replace function public.pl_chat_direct(email text, my_name text default '')
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  other uuid;
  k text;
  cid uuid;
begin
  if me is null then raise exception 'pl_not_signed_in'; end if;
  select u.id into other from auth.users u where lower(u.email) = lower(trim(pl_chat_direct.email)) limit 1;
  if other is null then raise exception 'pl_no_user'; end if;
  if other = me then raise exception 'pl_self'; end if;
  k := least(me::text, other::text) || ':' || greatest(me::text, other::text);
  insert into public.chats (is_group, direct_key, created_by) values (false, k, me) on conflict (direct_key) do nothing;
  select c.id into cid from public.chats c where c.direct_key = k;
  insert into public.chat_members (chat_id, user_id, email, name)
    select cid, u.id, coalesce(u.email, ''), case when u.id = me then left(coalesce(my_name, ''), 40) else '' end
    from auth.users u where u.id in (me, other)
    on conflict (chat_id, user_id) do nothing;
  return cid;
end;
$$;

create or replace function public.pl_chat_group(name text, emails text[], my_name text default '')
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  nm text := left(trim(coalesce(pl_chat_group.name, '')), 60);
  e text;
  cid uuid;
begin
  if me is null then raise exception 'pl_not_signed_in'; end if;
  if nm = '' then raise exception 'pl_no_name'; end if;
  foreach e in array coalesce(emails, '{}') loop
    if not exists (select 1 from auth.users u where lower(u.email) = lower(trim(e))) then
      raise exception 'pl_no_user:%', trim(e);
    end if;
  end loop;
  insert into public.chats (is_group, name, created_by) values (true, nm, me) returning id into cid;
  insert into public.chat_members (chat_id, user_id, email, name)
    select cid, u.id, coalesce(u.email, ''), left(coalesce(my_name, ''), 40) from auth.users u where u.id = me;
  insert into public.chat_members (chat_id, user_id, email)
    select cid, u.id, coalesce(u.email, '') from auth.users u
    where lower(u.email) in (select lower(trim(x)) from unnest(coalesce(emails, '{}')) x) and u.id <> me
    on conflict (chat_id, user_id) do nothing;
  insert into public.chat_messages (chat_id, sender, sender_name, kind, body, payload)
    values (cid, me, left(coalesce(my_name, ''), 40), 'system', 'created', jsonb_build_object('name', nm));
  return cid;
end;
$$;

create or replace function public.pl_chat_add(chat uuid, email text, my_name text default '')
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  who uuid;
  who_email text;
begin
  if not public.pl_chat_member(chat) then raise exception 'pl_not_member'; end if;
  if not exists (select 1 from public.chats c where c.id = chat and c.is_group) then raise exception 'pl_not_group'; end if;
  select u.id, u.email into who, who_email from auth.users u where lower(u.email) = lower(trim(pl_chat_add.email)) limit 1;
  if who is null then raise exception 'pl_no_user'; end if;
  if exists (select 1 from public.chat_members m where m.chat_id = chat and m.user_id = who) then raise exception 'pl_already'; end if;
  insert into public.chat_members (chat_id, user_id, email) values (chat, who, coalesce(who_email, ''));
  insert into public.chat_messages (chat_id, sender, sender_name, kind, body, payload)
    values (chat, me, left(coalesce(my_name, ''), 40), 'system', 'added', jsonb_build_object('who', who_email));
end;
$$;

create or replace function public.pl_chat_rename(chat uuid, name text, my_name text default '')
returns void
language plpgsql security definer set search_path = ''
as $$
declare nm text := left(trim(coalesce(pl_chat_rename.name, '')), 60);
begin
  if not public.pl_chat_member(chat) then raise exception 'pl_not_member'; end if;
  if nm = '' then raise exception 'pl_no_name'; end if;
  update public.chats c set name = nm where c.id = chat and c.is_group;
  if not found then raise exception 'pl_not_group'; end if;
  insert into public.chat_messages (chat_id, sender, sender_name, kind, body, payload)
    values (chat, auth.uid(), left(coalesce(my_name, ''), 40), 'system', 'renamed', jsonb_build_object('name', nm));
end;
$$;

create or replace function public.pl_chat_leave(chat uuid, my_name text default '')
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.pl_chat_member(chat) then return; end if;
  if exists (select 1 from public.chats c where c.id = chat and c.is_group) then
    insert into public.chat_messages (chat_id, sender, sender_name, kind, body)
      values (chat, auth.uid(), left(coalesce(my_name, ''), 40), 'system', 'left');
  end if;
  delete from public.chat_members m where m.chat_id = chat and m.user_id = auth.uid();
  -- Niemand mehr drin → Chat samt Nachrichten löschen
  if not exists (select 1 from public.chat_members m where m.chat_id = chat) then
    delete from public.chats c where c.id = chat;
  end if;
end;
$$;

-- Gelesen bis jetzt (Serverzeit, damit falsch gehende Uhren nichts durcheinanderbringen)
create or replace function public.pl_chat_read(chat uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.chat_members m set last_read_at = now() where m.chat_id = chat and m.user_id = auth.uid();
$$;

-- Eigenen Anzeigenamen in allen Chats setzen
create or replace function public.pl_chat_set_name(my_name text)
returns void
language sql security definer set search_path = ''
as $$
  update public.chat_members m set name = left(coalesce(my_name, ''), 40) where m.user_id = auth.uid();
$$;

-- Übersicht: letzte Nachricht und Zahl der ungelesenen pro Chat
create or replace function public.pl_chat_overview()
returns table (chat_id uuid, last_id uuid, last_sender uuid, last_name text, last_kind text, last_body text, last_payload jsonb, last_at timestamptz, unread int)
language sql stable security invoker set search_path = ''
as $$
  select m.chat_id, l.id, l.sender, l.sender_name, l.kind, l.body, l.payload, l.created_at,
    (select count(*)::int from public.chat_messages x
      where x.chat_id = m.chat_id and x.created_at > m.last_read_at and x.sender is distinct from auth.uid())
  from public.chat_members m
  left join lateral (
    select y.id, y.sender, y.sender_name, y.kind, y.body, y.payload, y.created_at
    from public.chat_messages y where y.chat_id = m.chat_id order by y.created_at desc limit 1
  ) l on true
  where m.user_id = auth.uid();
$$;

-- Alle Leute mit Konto (für „Neuer Chat“): E-Mail und Name aus den Einstellungen
create or replace function public.pl_chat_people()
returns table (email text, name text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'pl_not_signed_in'; end if;
  return query
    select u.email::text,
      left(trim(coalesce(
        nullif(trim(d.data->'settings'->>'name'), ''),
        (select m.name from public.chat_members m where m.user_id = u.id and m.name <> '' limit 1),
        ''
      )), 40)
    from auth.users u
    left join public.user_data d on d.user_id = u.id
    where u.id <> auth.uid() and coalesce(u.email, '') <> '';
end;
$$;

revoke all on function public.pl_chat_people() from public, anon;
grant execute on function public.pl_chat_people() to authenticated;

revoke all on function public.pl_chat_member(uuid) from public, anon;
revoke all on function public.pl_chat_direct(text, text) from public, anon;
revoke all on function public.pl_chat_group(text, text[], text) from public, anon;
revoke all on function public.pl_chat_add(uuid, text, text) from public, anon;
revoke all on function public.pl_chat_rename(uuid, text, text) from public, anon;
revoke all on function public.pl_chat_leave(uuid, text) from public, anon;
revoke all on function public.pl_chat_read(uuid) from public, anon;
revoke all on function public.pl_chat_set_name(text) from public, anon;
revoke all on function public.pl_chat_overview() from public, anon;
grant execute on function public.pl_chat_member(uuid) to authenticated;
grant execute on function public.pl_chat_direct(text, text) to authenticated;
grant execute on function public.pl_chat_group(text, text[], text) to authenticated;
grant execute on function public.pl_chat_add(uuid, text, text) to authenticated;
grant execute on function public.pl_chat_rename(uuid, text, text) to authenticated;
grant execute on function public.pl_chat_leave(uuid, text) to authenticated;
grant execute on function public.pl_chat_read(uuid) to authenticated;
grant execute on function public.pl_chat_set_name(text) to authenticated;
grant execute on function public.pl_chat_overview() to authenticated;

-- 5) Lernzettel, die in einen Chat geschickt wurden, dürfen alle im Chat öffnen
create or replace function public.pl_chat_can_read(p text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.chat_messages msg
    join public.chat_members m on m.chat_id = msg.chat_id and m.user_id = auth.uid()
    where msg.kind = 'note' and msg.payload->>'path' = p
  );
$$;
revoke all on function public.pl_chat_can_read(text) from public, anon;
grant execute on function public.pl_chat_can_read(text) to authenticated;

drop policy if exists "Lernzettel aus Chats lesen" on storage.objects;
create policy "Lernzettel aus Chats lesen" on storage.objects
  for select to authenticated using (bucket_id = 'lernzettel' and public.pl_chat_can_read(name));

-- 6) Nachrichten live zustellen (Realtime)
do $$
begin
  begin alter publication supabase_realtime add table public.chat_messages; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.chat_members; exception when duplicate_object then null; end;
exception when undefined_object then
  raise notice 'Realtime-Publikation fehlt – Nachrichten kommen dann alle paar Sekunden statt sofort.';
end;
$$;
