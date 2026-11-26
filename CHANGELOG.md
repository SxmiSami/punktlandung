# Änderungen

Die aktuelle Version steht in der App unten in der Seitenleiste bzw. unter **Einstellungen**.
Bei einem Update die Nummer in `js/data.js` (`PL.VERSION`) und `sw.js` (`VERSION`) erhöhen.

## 0.11.0
- **Belastung**: Neue Statistik auf der Übersicht (nächste 6 Wochen) und oben bei den Terminen (nächste 8 Wochen). Jeder Tag ist ein Kästchen, das umso kräftiger gefärbt ist, je mehr ansteht – so siehst du stressige Wochen früh
- Gezählt werden Abiprüfungen (4), Klausuren (3), Tests und Referate (je 2) und offene Aufgaben (je 1). Jede Woche bekommt eine Stufe: frei, ruhig, normal, viel oder stressig
- Oben: stressigste Woche, Anzahl Klausuren, volle Wochen und Wochen ohne Prüfung
- Tippen auf einen Tag mit Termin öffnet den Termin

## 0.10.0
- **OneNote-Verknüpfung**: Bei jedem Fach einen Abschnitt aus OneNote verknüpfen, z. B. aus dem Kursnotizbuch im Team, und mit einem Tipp in der OneNote-App oder im Browser öffnen
- Ohne Anmeldung: Link zum Abschnitt einfügen („Link zu Abschnitt kopieren“ in OneNote)
- **Mit dem Schulkonto angemeldet** (Einstellungen → OneNote):
  - Abschnitt aus einer Liste wählen (eigene Notizbücher und die deiner Teams). Was zum Fach passt, steht oben
  - Die **Seiten des Abschnitts** stehen direkt im Fach, die zuletzt geänderten zuerst
  - **Neue Seiten** (z. B. von Lehrkräften in der Inhaltsbibliothek) erscheinen in den **Neuigkeiten**
  - Eine Seite **hier ansehen** oder **bei den Dateien speichern** (mit Bildern, ohne Stift-Handschrift)
- Gespeicherte Seiten (HTML) öffnen sich in der App statt als Download
- Einrichtung: SYNC-EINRICHTEN.md, Schritt 8 (App-Registrierung bei Microsoft). Vielleicht muss die IT der Schule die App einmal freigeben

## 0.9.1
- **Synchronisierung repariert**: Ein Gerät mit altem Stand (z. B. das iPad nach Änderungen am PC) konnte beim Öffnen seinen veralteten Stand hochladen und damit die neuen Daten überschreiben. Jetzt werden die Stände **zusammengeführt** – Änderungen von beiden Geräten bleiben erhalten (neue/geänderte/gelöschte Noten, Fächer, Termine, Aufgaben, Dateien, Einstellungen). Nur wenn dasselbe Feld auf beiden Geräten verschieden geändert wurde, gilt die neuere Änderung
- Hochgeladen wird nur noch, wenn im Konto kein neuerer Stand liegt – sonst holt die App ihn zuerst ab und führt zusammen (auch wenn zwei Geräte gleichzeitig speichern)
- Änderungen, die genau während des Hochladens gemacht werden, gehen nicht mehr verloren
- Untis-Hausaufgaben/Klausuren, die zwei Geräte gleichzeitig übernehmen, erscheinen nicht doppelt

## 0.9.0
- **Lernzettel heißt jetzt „Dateien“** (alte Links auf `#/lernzettel` funktionieren weiter)
- Für jede Datei festlegen: **Fach**, **Klausur** (passend zum Fach, kommende zuerst) und ob sie **für alle geteilt** wird – beim Hochladen oder später in den Details
- **Für alle teilen**: Alle mit einem Konto in Punktlandung sehen die Datei unter „Von anderen“ (mit Fach und Klausur) und in den Neuigkeiten. Einzelne Personen gehen weiter über „An Personen“
- Dateien von anderen lassen sich aus der eigenen Liste ausblenden
- Filter „Zu Klausuren“ und „Geteilt“; Klausuren stehen als Schild an der Datei
- Im Klausurtermin stehen die zugeordneten Dateien, mit „Datei hinzufügen“ direkt für diese Klausur hochladen
- Dafür einmal `supabase/lernzettel.sql` in Supabase neu ausführen (neue Tabelle `public_files`)

## 0.8.1
- **Passwort ändern**: Unter Einstellungen → Konto & Synchronisierung. Zur Sicherheit wird zuerst das aktuelle Passwort abgefragt, das neue gibst du zweimal ein
- Aktuelles Passwort vergessen? Von dort aus lässt sich direkt ein Link zum Zurücksetzen schicken

## 0.8.0
- **Neuigkeiten**: Alles Neue an einem Ort – über die Glocke auf der Übersicht, die Karte „Neuigkeiten“ oder (am PC) in der Seitenleiste. Der Zähler hängt am Reiter „Übersicht“
- **Dateien aus Untis**: Lernzettel und Arbeitsblätter, die Lehrkräfte an Hausaufgaben oder Mitteilungen hängen, lassen sich direkt öffnen oder mit einem Tipp **als Lernzettel** im passenden Fach speichern
- Außerdem im Feed: neue **Hausaufgaben** (mit ganzem Text, Fälligkeit und Lehrkraft), **Mitteilungen** aus Untis, **Nachrichten des Tages**, neue oder verschobene **Klausuren**, **Ausfälle, Raumänderungen, Vertretungen und EVA** der nächsten Tage und Zettel, die Freunde mit dir teilen
- Filter: Alle, Dateien, Hausaufgaben, Mitteilungen, Klausuren & Ausfälle; „Alle gelesen“ und Aktualisieren
- Mitteilungen werden erst beim Antippen ganz geladen – erst dann sind sie auch in Untis gelesen
- Die Neuigkeiten liegen nur auf diesem Gerät (wie die Untis-Zugangsdaten)
- Die Supabase-Funktion `untis` muss dafür einmal neu eingefügt werden (SYNC-EINRICHTEN.md, Schritt 7)

## 0.7.4
- Kalender: Wochen durch **Wischen** wechseln (nach links = nächste Woche, nach rechts = vorherige), mit kurzer Schiebe-Animation
- Am PC gehen auch die Pfeiltasten ← →

## 0.7.3
- Klausuren richtig im Kalender: Sie werden an die Klausurstunden aus Untis gehängt (meist ein anderer Raum), nicht mehr an die normale Stunde des Fachs
- Stunden, die laut Untis an dem Tag gar nicht stattfinden (z. B. in Klausurwochen), werden ausgeblendet – selbst ergänzte Stunden bleiben
- Zusätzliche Termine aus Untis (z. B. Stufenversammlung) sind grün als Änderung markiert

## 0.7.2
- Kalender übersichtlicher: Stunden sind neutral, die Fachfarbe steht nur noch als Streifen am linken Rand – so fallen Entfall (rot), Änderungen (grün), EVA und Klausuren (gelb) sofort auf

## 0.7.1
- Behoben: Nach dem Update auf 0.7.0 blieb die App leer, wenn noch Untis-Daten von vorher gespeichert waren
- Ein Fehler in der Untis-Anzeige kann die App nicht mehr komplett leer machen; im schlimmsten Fall erscheint eine Meldung mit „Neu laden“

## 0.7.0
- **Kalender mit Ansicht- und Bearbeiten-Modus**: Normal siehst du die Woche mit allen Änderungen und tippst eine Stunde für Details an (Raum, Lehrkraft, Klausur, fällige Hausaufgaben). Über „Bearbeiten“ änderst du den festen Stundenplan, mit „Fertig“ geht es zurück
- Farben wie in Untis: **Entfall rot**, **Raum- und Lehreränderung grün**, **EVA grün gestrichelt** mit durchgestrichenem Lehrerkürzel, **Klausuren gelb**
- Fällt eine Stunde für eine Klausur aus, stehen beide nebeneinander (Klausur links, ausfallende Stunde rechts)
- Ändert sich nur eine Stunde einer Doppelstunde, wird sie geteilt angezeigt
- Lehrerkürzel aus Untis, Vertretungen mit neuem und durchgestrichenem altem Kürzel
- Zusätzliche Termine aus Untis (z. B. Stufenversammlung) erscheinen im Kalender
- Fällige Hausaufgaben sind an der Stunde markiert
- Hausaufgabe aus Untis, aber du hast selbst schon eine eingetragen? Die App fragt, welche stimmt: Untis-Version, deine oder beide
- Legende unter dem Kalender
- Die Supabase-Funktion `untis` muss dafür einmal neu eingefügt werden (SYNC-EINRICHTEN.md, Schritt 7)

## 0.6.0
- **Klausuren aus Untis** landen automatisch bei den Terminen (mit Countdown); verschiebt Untis eine Klausur, zieht der Termin mit
- **Hausaufgaben aus Untis** landen automatisch bei den Aufgaben
- Beides lässt sich unter Einstellungen → Stundenplan einzeln ausschalten; was du löschst, kommt nicht wieder
- **EVA** (eigenverantwortliches Arbeiten) wird im Stundenplan und in der Übersicht angezeigt, dazu Hinweise aus Untis
- Die Supabase-Funktion `untis` muss dafür einmal neu eingefügt werden (SYNC-EINRICHTEN.md, Schritt 7)

## 0.5.2
- Untis-Import zuverlässiger: Der feste Stundenplan wird aus sechs Wochen nach Mehrheit erkannt – Klausuren, Vertretungen und Wochen mit vielen Änderungen bringen ihn nicht mehr durcheinander (z. B. fehlte vorher eine Stunde oder wurde fälschlich als A/B-Stunde eingetragen)
- Im Untis-Fenster steht, welche Stunden nicht übernommen wurden und warum
- Bei zwei Fächern in derselben Stunde gewinnt das, das häufiger vorkommt

## 0.5.1
- Untis verbinden per **QR-Code scannen**: Kamera auf den Code in WebUntis halten (Profil → Freigaben → Zugriff über Untis Mobile) – alles füllt sich aus und der Stundenplan lädt sofort
- Geht auch mit einem Foto oder Screenshot vom QR-Code
- Felder zum selbst Eintragen sind unter „Oder selbst eintragen“ eingeklappt

## 0.5.0
- **Untis**: Unter Einstellungen → Stundenplan mit WebUntis verbinden – per Link aus dem QR-Code (Schlüssel, geht auch mit Schulkonto) oder mit Passwort
- Stundenplan, Räume und Stundenzeiten werden übernommen; A/B-Wochen werden erkannt; Untis-Fächer lassen sich eigenen Fächern zuordnen oder neu anlegen
- Ausfälle („Entfällt“) und Raumänderungen erscheinen im Kalender und in der Übersicht; „Nächste Stunde“ bei Hausaufgaben überspringt ausfallende Stunden
- Zugangsdaten bleiben nur auf dem Gerät (nicht im Konto, nicht im Backup)
- Einmalig die Supabase-Funktion `untis` einrichten (siehe SYNC-EINRICHTEN.md, Schritt 7)

## 0.4.3
- Fächer in Fenstern (z. B. „Neue Hausaufgabe“, „Note eintragen“) stehen jetzt in mehreren Zeilen untereinander – alle sofort antippbar, kein seitliches Wischen mehr nötig

## 0.4.2
- Fächer in „Neue Hausaufgabe“ lassen sich auf iPhone/iPad wieder seitlich durchwischen (die Zoom-Sperre hat das Wischen blockiert)
- Seitliches Wischen im Fenster schließt es nicht mehr versehentlich

## 0.4.1
- Fenster (z. B. „Neue Hausaufgabe“) lassen sich auf iPhone/iPad nicht mehr seitlich verschieben – Wischen über die Fächer scrollt nur noch die Fächer
- Datumsfeld ragt auf iPhone/iPad nicht mehr über den Fensterrand hinaus
- Kein Zoomen mehr mit zwei Fingern oder Doppeltippen
- Kein automatisches Reinzoomen mehr beim Antippen eines Eingabefelds (die App bleibt in der richtigen Größe)

## 0.4.0
- **Chat** mit Freunden: Einzelchats und Gruppen (z. B. „Mathe-LK“), neuer Punkt „Chat“ in der Navigation mit Zähler für ungelesene Nachrichten
- Nachrichten kommen live an; Hinweis unten, wenn in einem anderen Chat etwas Neues ankommt
- Über **+** im Chat einen **Lernzettel** (alle im Chat können ihn öffnen und sichern) oder einen **Klausurtermin** schicken – Freunde übernehmen ihn mit einem Tipp in ihren Kalender
- Termine auch aus dem Termin-Fenster und Lernzettel aus „Teilen“ direkt an einen Chat senden
- Gruppen umbenennen, Leute hinzufügen, Gruppe verlassen; eigene Nachrichten für alle löschen
- Einmalig `supabase/chat.sql` in Supabase ausführen (siehe SYNC-EINRICHTEN.md, Schritt 6)

## 0.3.3
- iPad/Web-App: Seitenleiste und Inhalt beginnen unter der Statusleiste und sind oben nicht mehr verschwommen

## 0.3.2
- Web-App auf dem Home-Bildschirm heißt jetzt „Punktlandung“ (statt z. B. „Übersicht · Punktlandung“)
- App-Symbol wird beim Hinzufügen zum Home-Bildschirm richtig übernommen (kein Buchstaben-Symbol mehr)

## 0.3.1
- Speicheranzeige kompakt: kleine Wolke mit Prozentwert oben auf der Lernzettel-Seite, Details beim Antippen
- Alle Speicherwerte in Prozent (MB klein darunter)
- Einstellungen: nur noch eine Zeile für den Lernzettel-Speicher
- Dateisymbole in den typischen Farben mit Kürzel: PDF rot, Word blau, Excel grün, PowerPoint orange, ZIP gelb, Bilder, Audio, Video, E-Books, Notizen, Text, Code u. a.

## 0.3.0
- **Lernzettel**: Fotos, PDFs und andere Dateien hochladen – pro Fach und auf der neuen Seite „Lernzettel“
- Speichern wahlweise in der Cloud, nur auf diesem Gerät oder beides; jederzeit umstellbar (z. B. aus der Cloud nehmen und nur lokal behalten, wenn der Platz knapp wird)
- Anzeige, wo ein Zettel liegt: Cloud, dieses Gerät, weitere Geräte
- Speicheranzeige: eigene Cloud (250 MB), alle zusammen (1 GB) und dieses Gerät
- Fotos werden beim Hochladen verkleinert (max. 2000 px, spart meist 80–90 %)
- **Teilen** per E-Mail-Adresse mit Freunden, die ein Konto haben; „Mit mir geteilt“ mit Offline-Kopie
- Einmalig `supabase/lernzettel.sql` in Supabase ausführen (siehe SYNC-EINRICHTEN.md)

## 0.2.3
- Updates kommen in der installierten Web-App zuverlässig an: Dateien werden nicht mehr bis zu 10 Min. aus dem Browser-Cache genommen
- Beim Zurückholen der App wird nach einer neuen Version gesucht und danach automatisch einmal neu geladen (nicht, solange ein Fenster offen ist)

## 0.2.2
- Größerer Knopf „Hausaufgabe eintragen“ in der Übersicht und unter Aufgaben
- Fach der aktuellen Stunde (oder der gerade beendeten – bis 20 Min. danach bzw. bis die nächste eigene Stunde beginnt) wird automatisch ausgewählt
- Fälligkeit „Nächste Stunde“ ist vorausgewählt, dazu „Übernächste Stunde“; darunter steht klein, wann die Stunde ist
- „Morgen“ und „In 1 Woche“ entfernt (eigenes Datum geht weiter über das Datumsfeld)

## 0.2.1
- Noch nicht ausgefüllte Halbjahre sind in Block I und bei den Fächern nur grau und leer (keine Prognose-Zahlen mehr)

## 0.2.0
- **Stundenplan** mit Wochenansicht, Doppelstunden, Räumen und A/B-Wochen
- Stundenzeiten in den Einstellungen anpassbar
- **Hausaufgaben** mit Fälligkeit („Nächste Stunde“, „Morgen“, „In 1 Woche“), Markierung als wichtig und Abhaken
- Übersicht zeigt den Stundenplan für heute bzw. morgen und offene Hausaufgaben
- Termine sind jetzt Teil des Kalenders
- Schwebender +-Knopf, der zur aktuellen Seite passt
- Versionsnummer wird angezeigt

## 0.1.2
- Datei importieren direkt auf dem Startbildschirm

## 0.1.1
- Konto & Synchronisierung über Supabase

## 0.1.0
- Erste Version: Noten, Fächer, Abitur-Rechner, Termine, Offline-App
