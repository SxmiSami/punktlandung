# Punktlandung – Abi-Notenrechner

Eine Noten-App fürs Abitur, die am PC und auf dem Handy läuft (als installierbare Web-App / PWA).

- **Übersicht:** Kennzahlen, Abiturschnitt live mit Prognose und Wunschschnitt, Notenschnitt pro Halbjahr, „Als Nächstes“ für die kommenden 7 Tage, Stundenplan von heute, letzte Noten und Belastung der nächsten Wochen
- **Für jedes Gerät:** am iPhone eine schwebende Tab-Leiste, am iPad eine schmale Seitenleiste, am Computer Seitenleiste, Suche (Strg K) und Tastenkürzel
- **Fächer:** Klausuren und sonstige Mitarbeit pro Halbjahr (Q1.1–Q2.2), Zeugnisnoten überschreiben die Rechnung
- **Abitur:** Block I (Halbjahre, LK doppelt) und Block II (Prüfungen schriftlich/mündlich), Zulassungs-Check und Ziel-Rechner
- **Kalender:** Stundenplan mit Doppelstunden und A/B-Wochen, dazu Klausuren und Tests mit Countdown
- **Untis:** Stundenplan aus WebUntis übernehmen, Ausfälle, Raumänderungen und EVA live sehen, Klausuren und Hausaufgaben automatisch übernehmen
- **Neuigkeiten:** Feed mit Dateien (Lernzetteln) und Hausaufgaben aus Untis, Mitteilungen, Klausuren, Ausfällen und geteilten Zetteln – Untis-Dateien mit einem Tipp als Lernzettel speichern
- **Aufgaben:** Hausaufgaben mit Fälligkeit (z. B. „bis zur nächsten Stunde“) zum Abhaken, auf Wunsch mit Link zur passenden OneNote-Seite
- **Lernzettel:** Fotos und PDFs pro Fach – in der Cloud, nur auf dem Gerät oder beides, mit Speicheranzeige und Teilen mit Freunden
- **Chat:** Einzel- und Gruppenchats mit Freunden, die ein Konto haben – Nachrichten kommen live an, Lernzettel, Klausurtermine und GIFs (Suche über GIPHY) lassen sich direkt in den Chat schicken
- **iPhone-Widget:** Abischnitt, nächste Termine und offene Aufgaben auf dem Home- und Sperrbildschirm, dazu ein Stundenplan-Widget, über das du direkt eine Hausaufgabe fürs aktuelle Fach einträgst (über die App Scriptable, siehe [widget/WIDGET-EINRICHTEN.md](widget/WIDGET-EINRICHTEN.md))
- **Was ist neu:** Nach einem Update einmal pro Konto eine kurze Übersicht der Änderungen
- Hell- und Dunkelmodus, funktioniert offline, Backup als JSON-Datei (Export/Import)

## Rechenregeln

| | |
|---|---|
| Block I | `Σ (Punkte × Gewicht) ÷ Σ Gewichte × 40` (LK ×2), max. 600 |
| Block II | 4 Prüfungen × 5 (oder 5 × 4), max. 300; mit mündlicher Prüfung `(2·S + M) ÷ 3` |
| Abinote | `floor((1020 − E) ÷ 18) ÷ 10`, mindestens 1,0 (KMK-Tabelle) |

Standard sind die Regeln wie in NRW. In den Einstellungen kannst du die Anzahl der Prüfungen, die LK-Gewichtung und den Klausuranteil ändern.

## Auf GitHub Pages veröffentlichen

1. Neues Repository auf GitHub anlegen und den Inhalt dieses Ordners hochladen (`git push`).
2. Im Repository: **Settings → Pages → Source: „Deploy from a branch“**, Branch `main`, Ordner `/ (root)`.
3. Nach ca. einer Minute läuft die App unter `https://<dein-name>.github.io/<repo-name>/`.

Auf dem Handy die Seite öffnen und **„Zum Home-Bildschirm“** (iPhone, Safari) bzw. **„App installieren“** (Android, Chrome) wählen.

## Daten

Die Daten werden immer lokal im Browser gespeichert (funktioniert auch offline). Mit einem **Konto** (Einstellungen → Konto & Synchronisierung) werden sie zusätzlich über Supabase auf allen Geräten synchronisiert. Die einmalige Einrichtung steht in [SYNC-EINRICHTEN.md](SYNC-EINRICHTEN.md).

Der **Chat** liegt nur online (Tabellen aus `supabase/chat.sql`) und ist nicht im Backup enthalten.

Ohne Konto kannst du Daten über **Einstellungen → Backup exportieren / importieren** übertragen.

**Lernzettel** liegen auf Wunsch lokal im Browser (IndexedDB) und/oder im Supabase-Speicher (65 MB pro Person, 900 MB für alle zusammen, 25 MB pro Datei, Fotos werden auf 2000 px verkleinert). Das Backup enthält nur die Einträge, nicht die Dateien selbst.

## Lokal starten

Einfach `index.html` im Browser öffnen, oder für die volle PWA-Funktion einen lokalen Server starten, z. B.:

```
npx serve .
```

Es gibt keinen Build-Schritt: reines HTML, CSS und JavaScript.
