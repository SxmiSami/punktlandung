# Punktlandung als Widget auf dem iPhone

Web-Apps können unter iOS kein eigenes Widget mitbringen. Mit der kostenlosen App **Scriptable** geht es trotzdem: Das Skript [`punktlandung-widget.js`](punktlandung-widget.js) holt deine Daten aus deinem Punktlandung-Konto und zeigt sie als Widget.

**Was es zeigt**
- **Abischnitt** mit Punkten (und „Prognose“, wenn noch Noten fehlen) – gleiche Rechnung wie in der App
- **Nächste Termine** (Klausuren, Tests, Referate …) mit Countdown in Fachfarbe
- **Offene Aufgaben**, überfällige in Rot

Du brauchst ein **Konto** in Punktlandung (Einstellungen → Konto & Synchronisierung). Das Widget zeigt immer den zuletzt synchronisierten Stand und lädt ihn etwa alle 30 Minuten neu (wann genau, entscheidet iOS).

## Einrichten (einmalig)

1. **Scriptable** aus dem App Store laden.
2. Auf dem iPhone in Safari das Skript öffnen:
   `https://sxmisami.github.io/punktlandung/widget/punktlandung-widget.js`
   Alles markieren und kopieren.
3. In Scriptable oben rechts auf **+**, den Text einfügen und das Skript oben in **Punktlandung** umbenennen.
4. Das Skript mit ▶︎ starten und dich mit **E-Mail und Passwort deines Punktlandung-Kontos** anmelden. Danach siehst du eine Vorschau.
   Das Passwort wird nicht gespeichert, nur die Anmeldung (im iOS-Schlüsselbund).
5. Auf dem Home-Bildschirm lange drücken → **Bearbeiten → Widget hinzufügen → Scriptable**, eine Größe wählen und hinzufügen.
6. Das neue Widget lange drücken → **Widget bearbeiten** → bei **Script** „Punktlandung“ wählen.

Auf dem **Sperrbildschirm** geht es genauso: Sperrbildschirm lange drücken → Anpassen → Widgets → Scriptable.

## Was das Widget zeigen soll

Unter **Widget bearbeiten → Parameter** kannst du eintragen:

| Parameter | Klein | Mittel | Groß |
|---|---|---|---|
| *(leer)* | Abischnitt + nächste Prüfung | Abischnitt + 2 Termine + 2 Aufgaben | Abischnitt mit Block I/II, 5 Termine, 5 Aufgaben |
| `abi` | nur Abischnitt | nur Abischnitt | – |
| `termine` | nächste 4 Termine | Abischnitt + 4 Termine | Abischnitt + 10 Termine |
| `aufgaben` | nächste 4 Aufgaben | Abischnitt + 4 Aufgaben | Abischnitt + 10 Aufgaben |

Auf dem Sperrbildschirm: rund = Abischnitt, rechteckig = Abischnitt, nächste Prüfung und Anzahl offener Aufgaben, über der Uhr = eine Zeile.

## Gut zu wissen

- Tippen auf das Widget öffnet Punktlandung in Safari. Die vom Home-Bildschirm installierte Web-App kann iOS leider nicht direkt öffnen.
- Ohne Internet zeigt das Widget den letzten Stand mit „Offline · Stand …“.
- Steht „Bitte anmelden“ auf dem Widget, tippe darauf und melde dich in Scriptable neu an.
- Abmelden oder Vorschau ansehen: das Skript in Scriptable starten.
- Live-Daten aus Untis (Ausfälle, Raumänderungen) zeigt das Widget nicht, nur was in deinem Konto gespeichert ist.
- Neue Version des Widgets: Schritt 2 und 3 wiederholen und den alten Text ersetzen. Du bleibst angemeldet.
