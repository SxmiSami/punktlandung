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

## 7. Untis einrichten (optional)

Damit die App deinen Stundenplan aus WebUntis holen und Ausfälle anzeigen kann, braucht Supabase einen kleinen Vermittler (eine „Edge Function“). WebUntis lässt Abfragen direkt aus dem Browser nämlich nicht zu.

1. Links auf **„Edge Functions“** klicken → **„Deploy a new function“** → **„Via Editor“**.
2. Als Namen genau **`untis`** eintragen.
3. Den kompletten Inhalt der Datei [`supabase/functions/untis/index.ts`](supabase/functions/untis/index.ts) in den Editor einfügen (den Beispielcode vorher löschen).
4. Auf **„Deploy function“** klicken.
5. Danach bei der Funktion auf **„Details“** bzw. **„Settings“** gehen und **„Verify JWT with legacy secret“** (bzw. „Enforce JWT verification“) **ausschalten**, dann speichern. Sonst lässt Supabase die Anfragen der App nicht durch.

Alternativ mit dem Terminal: `npx supabase functions deploy untis --no-verify-jwt --project-ref <deine-Projekt-ID>`

In der App dann unter **Einstellungen → Stundenplan → Untis** auf **„Verbinden“** tippen. Am einfachsten geht das mit dem Link aus WebUntis: **Profil → Freigaben → Zugriff über Untis Mobile → Anzeigen**.

**Nach einem App-Update, das die Funktion ändert** (steht dann im CHANGELOG): In Supabase unter **Edge Functions → untis → Code** den Inhalt wieder durch die aktuelle [`supabase/functions/untis/index.ts`](supabase/functions/untis/index.ts) ersetzen und **„Deploy“** klicken. „Verify JWT“ bleibt aus.

> Die Untis-Zugangsdaten bleiben nur auf deinem Gerät. Die Funktion bekommt sie bei jedem Abruf mitgeschickt, gibt sie an WebUntis weiter und speichert sie nicht. Sie spricht nur mit Adressen, die auf `.webuntis.com` enden – und beim Herunterladen von Dateien aus Untis mit dem Datei-Speicher, auf den Untis selbst verweist.

## 8. OneNote einrichten (optional)

Auch ohne diesen Schritt kannst du bei jedem Fach einen **Link** zu deinem OneNote-Abschnitt einfügen und ihn von dort öffnen. Für die Anmeldung mit dem Schulkonto, also für die Seiten in der App, neue Seiten in den Neuigkeiten und „Bei Dateien speichern“, braucht Punktlandung eine kostenlose **App-Registrierung bei Microsoft**. Diese Seite ist von Microsoft, nicht von Supabase.

Mach das am besten mit deinem **Schulkonto**: Dann gehört die App zu deiner Schule, und ihr dürft meist ohne Administrator zustimmen.

1. [entra.microsoft.com](https://entra.microsoft.com) mit dem Schulkonto öffnen → **Anwendungen → App-Registrierungen → Neue Registrierung**.
   Kommt „Keine Berechtigung“ oder ist der Knopf ausgegraut, hat die Schule das für Schüler:innen abgeschaltet. Dann muss die IT die Registrierung anlegen (die Schritte hier weitergeben).
2. **Name:** `Punktlandung`. **Unterstützte Kontotypen:** „Nur Konten in diesem Organisationsverzeichnis“.
3. **Umleitungs-URI:** Plattform **„Single-Page-Anwendung (SPA)“** (nicht „Web“), Adresse `https://sxmisami.github.io/punktlandung/` (mit `/` am Ende). Die genaue Adresse steht auch in der App unter **Einstellungen → OneNote**.
   Zum Ausprobieren am PC unter **Authentifizierung** zusätzlich `http://localhost:5173/` als SPA-Adresse eintragen.
4. **Registrieren** klicken. Auf der Übersichtsseite die **Anwendungs-ID (Client)** und die **Verzeichnis-ID (Mandant)** kopieren.
5. **API-Berechtigungen → Berechtigung hinzufügen → Microsoft Graph → Delegierte Berechtigungen** und diese auswählen: `Notes.Read.All`, `Team.ReadBasic.All` und `offline_access` (`User.Read` ist schon drin). Keine davon braucht laut Microsoft eine Administrator-Zustimmung.
6. In [`js/config.js`](js/config.js) eintragen und hochladen (`git push`):
   ```js
   microsoft: { clientId: '<Anwendungs-ID>', tenant: '<Verzeichnis-ID>' },
   ```

In der App dann unter **Einstellungen → OneNote** auf **„Anmelden“** tippen und danach bei jedem Fach unter **OneNote → Verknüpfen** den passenden Abschnitt wählen. Abschnitte, die zum Fach passen, stehen oben.

**„Administratorgenehmigung erforderlich“?** Dann lässt deine Schule Schüler:innen Apps nicht selbst zustimmen. Die App zeigt dann einen **Link für die IT** (Einstellungen → OneNote → „Kopieren“). Wer Administrator ist, öffnet ihn einmal und stimmt für die ganze Schule zu. Danach klappt die Anmeldung für alle.

> - Die Microsoft-Anmeldung bleibt nur auf deinem Gerät. Punktlandung liest OneNote nur und ändert dort nichts.
> - Ohne eigenen Server lässt Microsoft eine Anmeldung höchstens **24 Stunden** gelten. Danach steht in der App „Erneut anmelden“, das ist meist nur ein Tipp.
> - Mit dem Stift Geschriebenes gibt Microsoft über die Schnittstelle nicht mit. „Hier ansehen“ und „Bei Dateien“ zeigen Text, Bilder und eingefügte PDFs. Für Handschrift gibt es „OneNote-App“.
> - Liegen in der Dateiablage eines Teams über 5000 Dateien, lässt Microsoft das Notizbuch dort nicht über die Schnittstelle lesen. Öffnen per Link geht trotzdem.

## Danach

In der App unter **Einstellungen → Konto & Synchronisierung** ein Konto erstellen. Auf jedem weiteren Gerät einfach mit derselben E-Mail anmelden.

**Hinweis:** Kostenlose Supabase-Projekte werden nach einer Woche ohne Nutzung pausiert. In dem Fall bekommst du eine Mail und kannst es mit einem Klick im Supabase-Dashboard wieder starten. Deine Noten auf dem Gerät bleiben in der Zeit erhalten.
