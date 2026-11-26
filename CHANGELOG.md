# Änderungen

Die aktuelle Version steht in der App unten in der Seitenleiste bzw. unter **Einstellungen**.
Bei einem Update die Nummer in `js/data.js` (`PL.VERSION`) und `sw.js` (`VERSION`) erhöhen.

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
