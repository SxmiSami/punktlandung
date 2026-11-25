# Punktlandung – Abi-Notenrechner

Eine Noten-App fürs Abitur, die am PC und auf dem Handy läuft (als installierbare Web-App / PWA).

- **Übersicht:** Abiturschnitt live mit Prognose, Notenschnitt pro Halbjahr, Verlauf, Termine und letzte Noten
- **Fächer:** Klausuren und sonstige Mitarbeit pro Halbjahr (Q1.1–Q2.2), Zeugnisnoten überschreiben die Rechnung
- **Abitur:** Block I (Halbjahre, LK doppelt) und Block II (Prüfungen schriftlich/mündlich), Zulassungs-Check und Ziel-Rechner
- **Termine:** Klausuren und Tests mit Countdown; nach dem Termin trägst du die Note direkt ein
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

Alle Daten bleiben nur lokal im Browser des jeweiligen Geräts (localStorage). Um Daten zwischen PC und Handy zu übertragen, nutze **Einstellungen → Backup exportieren / importieren**.

## Lokal starten

Einfach `index.html` im Browser öffnen, oder für die volle PWA-Funktion einen lokalen Server starten, z. B.:

```
npx serve .
```

Es gibt keinen Build-Schritt: reines HTML, CSS und JavaScript.
