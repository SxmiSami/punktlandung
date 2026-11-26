# Synchronisierung einrichten (einmalig, ca. 5 Minuten)

Damit deine Noten auf allen Geräten gleich sind, braucht die App einen Online-Speicher. Dafür nutzen wir **Supabase** (kostenlos).

## 1. Projekt anlegen

1. Auf **https://supabase.com** gehen und auf **„Start your project“** klicken. Du kannst dich direkt mit deinem GitHub-Konto anmelden.
2. **„New project“** wählen:
   - **Name:** `punktlandung`
   - **Database Password:** irgendein sicheres Passwort (brauchst du für die App nicht, aber gut aufheben)
   - **Region:** `Central EU (Frankfurt)`
3. **„Create new project“** klicken und ca. 1–2 Minuten warten.

## 2. Tabelle anlegen

1. Links auf **„SQL Editor“** klicken.
2. Den kompletten Inhalt der Datei [`supabase/schema.sql`](supabase/schema.sql) einfügen.
3. Auf **„Run“** klicken. Es sollte „Success. No rows returned“ erscheinen.

## 3. Adresse der App eintragen

Damit die Bestätigungs-Mails zurück zur App führen:

1. Links auf **„Authentication“** → **„URL Configuration“**.
2. **Site URL:** `https://sxmisami.github.io/punktlandung/`
3. Unter **Redirect URLs** auf „Add URL“ und dieselbe Adresse noch einmal eintragen.
4. Speichern.

*Optional:* Unter **Authentication → Sign In / Providers → Email** kannst du **„Confirm email“** ausschalten. Dann musst du deine E-Mail nach dem Registrieren nicht erst bestätigen.

## 4. Schlüssel in die App eintragen

1. Links unten auf **„Project Settings“** → **„API“** (bzw. „Data API“ / „API Keys“).
2. Kopiere die **Project URL** (z. B. `https://abcdefgh.supabase.co`) und den **`anon` `public`** Key.
3. Trag beides in [`js/config.js`](js/config.js) ein, oder schick es Claude, dann wird es eingetragen und veröffentlicht.

> Der `anon public`-Key darf öffentlich sein, er ist genau dafür gedacht. Deine Daten schützt die Regel aus Schritt 2: Jeder kann nur seine eigenen Noten lesen.
> **Niemals** den `service_role`-Key eintragen oder weitergeben!

## 5. Lernzettel-Speicher einrichten

Damit Lernzettel online gespeichert und geteilt werden können:

1. Links auf **„SQL Editor“** klicken, **„New query“**.
2. Den kompletten Inhalt der Datei [`supabase/lernzettel.sql`](supabase/lernzettel.sql) einfügen.
3. Auf **„Run“** klicken. Es sollte „Success. No rows returned“ erscheinen.

Das legt den privaten Speicher „lernzettel“ an, begrenzt ihn auf **250 MB pro Person** und **25 MB pro Datei** und erlaubt das Teilen mit Freunden per E-Mail-Adresse.
Der kostenlose Plan hat **1 GB für alle zusammen**, also bei 4 Personen je 250 MB. Wer mehr braucht, kann einzelne Zettel „nur lokal“ speichern.

## 6. Chat einrichten

Damit ihr euch in der App schreiben könnt (einzeln oder in Gruppen):

1. Links auf **„SQL Editor“** klicken, **„New query“**.
2. Den kompletten Inhalt der Datei [`supabase/chat.sql`](supabase/chat.sql) einfügen.
3. Auf **„Run“** klicken. Es sollte „Success. No rows returned“ erscheinen.

Das legt die Tabellen für Chats und Nachrichten an. Nachrichten sieht nur, wer im Chat ist. Lernzettel, die in einen Chat geschickt werden, dürfen alle im Chat öffnen. Neue Nachrichten kommen sofort an (Supabase Realtime); falls Realtime nicht geht, holt die App sie alle 20 Sekunden.

## Danach

In der App unter **Einstellungen → Konto & Synchronisierung** ein Konto erstellen. Auf jedem weiteren Gerät einfach mit derselben E-Mail anmelden.

**Hinweis:** Kostenlose Supabase-Projekte werden nach einer Woche ohne Nutzung pausiert. In dem Fall bekommst du eine Mail und kannst es mit einem Klick im Supabase-Dashboard wieder starten. Deine Noten auf dem Gerät bleiben in der Zeit erhalten.
