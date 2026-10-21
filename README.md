# V3: Messwerte lokal erfassen

V3 ist eine statische Web-App fuer Desktop und Mobilgeraete. GitHub kann die
Anwendungsdateien ueber GitHub Pages bereitstellen; die App sendet keine
Messwerte oder Anhaenge an GitHub und benoetigt weder Token noch Backend.

## Direkt starten

Messwerte werden im Browser gespeichert. In der Liste **Anhaenge** oeffnen,
um spaeter Bilder oder Dokumente einem Messwert hinzuzufuegen. Unterstuetzt
werden JPG, PNG, GIF, WebP, PDF, TXT, CSV, RTF, DOC/DOCX, XLS/XLSX und ODT/ODS.
Pro Datei gelten 10 MB, pro Messwert 20 Dateien und 30 MB insgesamt. Dateien
liegen in IndexedDB, Messwerte im Browser-Speicher. Browserdaten und private
Browserfenster sind kein Backup; vor dem Loeschen des lokalen Speichers ein ZIP
exportieren.

## Daten sichern und uebertragen

**ZIP exportieren** erzeugt ein Archiv mit Messwerten und zugehoerigen Dateien.
Auf einem weiteren Geraet das Archiv ueber **Importieren** einlesen. Der Import
fuegt Messwerte und Anhaenge zusammen, ohne vorhandene Eintraege zu ersetzen.
Gleiche Messwert-IDs mit unterschiedlichen Inhalten werden abgewiesen. Aeltere
JSON-Exporte ohne Anhaenge koennen weiterhin importiert werden.

Das ZIP-Archiv manuell uebertragen, zum Beispiel per USB oder einen von euch
zugelassenen Dateidienst. Es enthaelt alle Messwerte und angehaengten Dateien
und ist entsprechend vertraulich zu behandeln.

## Mobilgeraete und Installation

Fuer Smartphones den V3-Ordner ueber **statisches HTTPS-Hosting**, z.B. GitHub
Pages, veroeffentlichen. Das benoetigt keinen Anwendungsserver. Die App-Dateien
in das Stammverzeichnis des Software-Repositories kopieren und
unter **Settings > Pages > Deploy from a branch** den Branch und `/ (root)`
waehlen. Dann die von GitHub angezeigte HTTPS-Adresse auf jedem Geraet oeffnen.
Alternativ denselben Ordner auf einem bestehenden statischen Webspace ablegen.

Chrome/Edge: **App installieren**, falls angeboten. iPhone/iPad: in Safari
**Teilen > Zum Home-Bildschirm**. Nach dem ersten vollstaendigen Laden und
Aktivieren des Service Workers ist die Oberflaeche offline verfuegbar; auf
diesem Geraet danach nochmals oeffnen und offline pruefen. Die App kommuniziert
nicht mit GitHub-APIs. Externe Webfonts sind optional; ohne Netz werden lokale
Ersatzschriften verwendet.

Unter `file://` gibt es keine PWA-Installation und keinen Service Worker.
Einige mobile Browser unterstuetzen lokale HTML-Dateien und IndexedDB nur
eingeschraenkt; fuer stabile Anhaenge HTTPS bevorzugen. Jede Browser-/URL-
Installation hat einen eigenen lokalen Bestand. Umzug per ZIP-Export/Import.
GitHub Pages kann den App-Code oeffentlich bereitstellen; Messwerte und Dateien
werden davon nicht hochgeladen.

## Grenzen und Datenschutz

- Maximal 5000 Messwerte und 900.000 UTF-8-Bytes fuer die Messwertdaten.
  Anhaenge: 10 MB je Datei, 20 Dateien und 30 MB pro Messwert, 100 MB je ZIP.
- Keine automatische Dateibeobachtung, kein Git-Client, keine native EXE/APK.
  Desktop und Mobil nutzen dieselbe responsive Browser-App/PWA.
- Kein verbindlicher Audit-Trail und keine verifizierten Erfasseridentitaeten:
  Name, Zeitpunkt und Inhalte koennen lokal manipuliert werden.
- Messwerte, Namen, Notizen und Dateien sind nicht verschluesselt. Nur
  zugelassene Daten speichern und ZIP-Exporte geschuetzt weitergeben.
- Lokale Exporte separat sichern. Browserdaten sind kein Backup.

## Tests

Nur fuer Entwicklung Node.js >= 22 erforderlich. Im V3-Ordner:

```powershell
npm test
```

Ohne npm, aus dem V3-Ordner:

```powershell
node --test *.test.cjs
```

Tests pruefen Formatvalidierung, verlustfreie Zusammenfuehrung, ZIP-Rundlauf,
Dateityp-/Groessenlimits und den Import alter JSON-Dateien.