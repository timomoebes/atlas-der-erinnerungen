# Atlas der Erinnerungen

Ein privates, visuelles 3D-Reisetagebuch für Berlin → Paphos. Mit Three.js-Globus, Flugroute, persönlichen Erinnerungen, Foto, Präsentationsmodus und Sicherung.

## Starten

Unter Windows **`Atlas-starten.cmd` doppelklicken**. Die Seite öffnet sich unter <http://127.0.0.1:4173/>. Das Fenster mit dem Server muss geöffnet bleiben. Voraussetzung: Node.js 20 oder neuer. Alternativ: `npm install`, `npm run build`, `npm run preview -- --port 4173 --strictPort --open`.

## Erinnerungen

- **Erinnerung festhalten:** Titel, Datum, Ort entlang der Route, Notiz und optional ein Foto auswählen. Bilder werden vor dem Speichern verkleinert.
- **Ansehen:** Präsentationsmodus für die Familie. Pfeiltasten blättern, Escape schließt.
- **Sicherung herunterladen:** Die JSON-Datei enthält alle Einträge samt Fotos. Bitte regelmäßig extern sichern.
- **Sicherung laden:** Lädt eine Sicherung und **ersetzt** die aktuellen Einträge auf diesem Gerät nach Bestätigung.

**Wichtig:** Einträge bleiben ausschließlich im IndexedDB-Speicher des verwendeten Browsers und der Adresse `127.0.0.1:4173`. Es gibt kein Konto, keinen Cloud-Abgleich und keine automatische Synchronisierung auf andere Geräte. Wer den Browser-Speicher löscht, verliert ungesicherte Einträge. Für Bia oder euren Sohn könnt ihr die Seite auf diesem Gerät zeigen; für einen Gerätewechsel die JSON-Sicherung übertragen und dort in eine gestartete Kopie des Atlas laden. Die Anwendung benötigt beim ersten Start `npm install` und die Schriftarten laden bei Internetzugang; der Globus selbst hat keine Karten-API und keinen API-Schlüssel.

## Entwicklung und Test

`npm run dev` startet Vite für Entwicklung (anderer Port, daher **anderer Browser-Speicher**). `npm run build` erzeugt die Produktionsfassung in `dist/`. `node smoke.mjs` testet in einem isolierten Browserprofil Erstellen, Speichern, Neuladen, Foto, Bearbeiten, Export/Import, Präsentation sowie Desktop und Mobil. Dazu muss die Vorschau unter Port 4173 laufen und Playwright Chromium installiert sein (`npx playwright install chromium`).
