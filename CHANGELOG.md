# Änderungen

Die aktuelle Version steht in der App unten in der Seitenleiste bzw. unter **Einstellungen**.
Bei einem Update die Nummer in `js/data.js` (`PL.VERSION`) und `sw.js` (`VERSION`) erhöhen.

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
