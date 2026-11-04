# Atlas der Erinnerungen

Ein privates, visuelles 3D-Reisetagebuch mit Three.js-Globus. Ab Version 2 mit **Konten, gemeinsamen Atlanten, Cloud-Fotos und iPhone-App**: Mehrere Menschen schreiben in dasselbe Reisebuch, und andere Eltern können ihren eigenen Atlas für ihre Kinder anlegen.

## Was neu ist (die 9 Features)

1. **Mitglieder-Login** (E-Mail + Passwort, Passwort-Zurücksetzen).
2. **Atlanten**: jedes Mitglied hat einen oder mehrere eigene Reisebücher.
3. **Einladungslink** für Partnerin, Großeltern usw. (Rolle „schreibt mit“ oder „liest nur“, 7 Tage gültig).
4. **Cloud-Sync** aller Erinnerungen; neue Einträge erscheinen live beim anderen.
5. **Mehrere Fotos pro Erinnerung** in einem **privaten** Speicher (kein öffentlicher Link, nur Mitglieder sehen sie).
6. **Autorenzeile** („von Bia“) und Rechte: Schreibende ändern nur ihre eigenen Einträge, Besitzer:innen alles.
7. **Eigene Route pro Atlas**: Start, Ziel, Titel und Widmung frei wählbar (nicht mehr nur Berlin → Paphos).
8. **Kommentare** unter jeder Erinnerung.
9. **Offline-Modus + Übernahme der alten Daten**: offline geschriebene Einträge warten in einer Warteschlange und werden synchronisiert. Die alte lokale Version (IndexedDB oder JSON-Sicherung) lässt sich mit einem Klick in den Atlas hochladen.

Dazu: Konto löschen in der App (App-Store-Pflicht), PWA (installierbar), Capacitor-Gerüst für eine echte iOS-App.

Ohne Supabase-Zugangsdaten läuft die App unverändert wie der MVP (nur lokal, keine Konten).

## Wo liegen die Daten?

| Was | Wo | Warum |
| --- | --- | --- |
| Konten, Texte, Mitglieder, Kommentare | **Supabase Postgres, Region Frankfurt** | Auth, Datenbank und Datei-Speicher aus einer Hand, Zugriffsregeln direkt in der Datenbank |
| Fotos | **Supabase Storage, privater Bucket `photos`**, Pfad `{atlas}/{erinnerung}/{foto}.jpg` | Kinderfotos: nie öffentlich, Anzeige nur über 1-Stunden-Links nach Mitglieds-Prüfung |
| Offline-Kopie, Warteschlange | IndexedDB auf dem Gerät | App öffnet ohne Netz, Änderungen gehen nicht verloren |

Fotos werden vor dem Hochladen auf höchstens 1600 px verkleinert und neu als JPEG kodiert (≈ 200–500 KB, Standortdaten aus EXIF werden dabei entfernt). Jedes Bild liegt nur einmal im Speicher; die Datenbank enthält nur Verweise, niemals Base64.

**Zugriffsschutz** (Row Level Security) steht in `supabase/migrations/0001_init.sql` und gilt für jede Tabelle und für den Datei-Speicher. Die App nutzt ausschließlich den öffentlichen anon-Schlüssel; der Service-Role-Schlüssel gehört nie in die App.

## Einrichten

### 1. Supabase-Projekt (einmalig, ca. 10 Minuten)

1. Auf <https://supabase.com> ein **neues** Projekt anlegen, Region **Europe (Frankfurt)**. Nicht ein bestehendes Projekt mitbenutzen.
2. Im **SQL Editor** den Inhalt von `supabase/migrations/0001_init.sql` ausführen.
3. Unter **Authentication → URL Configuration**: *Site URL* = Adresse, unter der die App gehostet wird (Schritt 3); dort auch deine Weiterleitungs-URL eintragen.
4. Unter **Authentication → Providers → Email** E-Mail-Bestätigung eingeschaltet lassen (empfohlen). Für eigene Absender-Mails später einen SMTP-Dienst hinterlegen (die eingebauten Mails sind stark begrenzt).
5. Unter **Project Settings → API** *Project URL* und *anon public key* kopieren.

### 2. Lokal starten

```bash
npm install
cp .env.example .env.local     # URL und anon key eintragen
npm run dev
```

Ohne `.env.local` startet die App im lokalen MVP-Modus.

### 3. Im Internet bereitstellen (nötig für Einladungslinks und die iPhone-Installation)

`npm run build` erzeugt `dist/`. Das ist eine statische Seite, die z. B. bei Cloudflare Pages, Netlify oder Vercel kostenlos läuft (HTTPS ist Pflicht). Die drei `VITE_…`-Werte als Umgebungsvariablen beim Build setzen. `VITE_APP_URL` ist die öffentliche Adresse; daraus entstehen die Einladungslinks.

### Alte Erinnerungen aus der MVP-Version übernehmen

Die Einträge der alten Version liegen nur im Browser-Speicher der Adresse `127.0.0.1:4173` (also `Atlas-starten.cmd`), **nicht** in der gehosteten App und nicht auf dem iPhone. Vorher in der alten Version **Sicherung herunterladen**. Dann in der Cloud-Version entweder die JSON-Datei per *Sicherung hinzufügen* laden oder (wenn die lokale Version mit Konto-Anmeldung auf demselben Rechner startet) unter *Atlas & Konto → Alte Erinnerungen von diesem Gerät hochladen* übertragen.

### Gut zu wissen (bitte in der aktuellen Supabase-Doku prüfen)

- **E-Mail-Versand:** Der eingebaute Mail-Dienst von Supabase ist stark eingeschränkt und liefert laut Doku nur an Teammitglieder des Projekts aus. Damit auch deine Verlobte die Bestätigungsmail bekommt, einen eigenen SMTP-Dienst eintragen (z. B. Resend oder Brevo, beide mit kostenlosem Kontingent) oder die E-Mail-Bestätigung vorübergehend ausschalten.
- **Pausierte Gratis-Projekte:** Kostenlose Projekte werden bei längerer Inaktivität pausiert. Für ein selten genutztes Familienbuch ggf. den Pro-Tarif wählen oder das Projekt nach einer Pause wieder aktivieren.
- **Offline:** Neue Einträge und Löschungen funktionieren ohne Netz und werden später hochgeladen. Fotos bereits synchronisierter Einträge werden offline nicht angezeigt (sie kommen aus dem privaten Speicher).

### 4. Auf das iPhone

- **Sofort, ohne Mac und ohne Apple-Entwicklerkonto:** die gehostete Adresse in Safari öffnen → Teilen → *Zum Home-Bildschirm*. Das ist eine installierbare Web-App (PWA) mit eigenem Icon, Vollbild und Offline-Start. Für dich und deine Verlobte reicht das.
- **Echte App (App Store / TestFlight):** Das Capacitor-Projekt liegt in `ios/`. Gebaut werden kann es nur mit **Xcode auf einem Mac** und einem **Apple Developer Account (99 $/Jahr)**. Ohne eigenen Mac nimmt man einen Cloud-Mac (z. B. Codemagic oder GitHub Actions `macos-latest`). `.github/workflows/ios-build.yml` prüft bei jedem Push, dass das Projekt für den Simulator kompiliert; für ein signiertes Build/TestFlight kommen Zertifikate und Secrets dazu.
  - Auf dem Mac: `npm run cap:sync` und `npm run cap:open`, dann in Xcode Team wählen und starten.
  - Vor dem Store-Upload `appId` in `capacitor.config.json` (derzeit `de.atlasdererinnerungen.app`) auf deine Kennung ändern und in der App-Store-Beschreibung eine **Datenschutzerklärung** verlinken.
  - Einladungslinks sind Web-Links: sie öffnen sich im Browser/in der PWA. Ein Antippen direkt in der nativen App (Universal Links) ist noch nicht eingerichtet; der Code lässt sich aber auch in der App unter *Atlas & Konto → Mit Code beitreten* einfügen.

## Bedienung

- **Erinnerung festhalten:** Titel, Datum, Ort entlang der Route, Notiz und bis zu 8 Fotos.
- **Ansehen:** Präsentationsmodus. Pfeiltasten blättern, Escape schließt.
- **Atlas & Konto** (oben rechts): Atlanten wechseln/anlegen, Mitglieder einladen, Namen ändern, abmelden, Konto löschen.
- **Sicherung herunterladen/laden:** JSON-Datei inkl. Fotos. In der Cloud-Version werden Sicherungen zu neuen Einträgen **hinzugefügt**, nichts wird überschrieben.

## Entwicklung und Tests

| Befehl | Prüft |
| --- | --- |
| `npm test` | Validierung der Einträge (Unit-Tests) |
| `npm run test:rls` | Migration und **alle Zugriffsregeln** auf einem Wegwerf-Postgres (Fremde sehen nichts, Rollen, Einladungen, Konto-Löschung). Braucht lokal installiertes PostgreSQL: `PGPORT=… PGUSER=postgres npm run test:rls` |
| `node smoke.mjs` | Lokaler Modus im Browser (Vorschau auf Port 4173, `npx playwright install chromium`) |
| `LIVE_PASS=… node tests/live-smoke.mjs` | Zwei Nutzer gegen ein **echtes** Supabase-Projekt (Atlas, Foto, Einladung, Rechte, Kommentare, privater Bucket); danach `tests/live-cleanup.mjs`. Braucht `.env.local` und zwei bestätigte Test-Konten |
| `node tests/cloud-smoke.mjs` | Cloud-Oberfläche gegen einen **simulierten** Supabase-Server (Anleitung im Dateikopf) |

`BROWSER=webkit node smoke.mjs` führt den lokalen Test mit WebKit (Safari-Engine) aus.

Die Cloud-Anbindung wurde zusätzlich live gegen ein echtes Supabase-Projekt mit zwei Konten geprüft. Offen: Das iOS-Projekt wurde unter Windows angelegt und noch nicht in Xcode kompiliert.
