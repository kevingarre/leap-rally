# Händlerimport und EMEA-Lead-Export

Stand: 17. August 2026

## Ziel

Das Formular erfasst nur noch die fünfstellige Postleitzahl. Der Server ordnet reproduzierbar den geografisch nächsten aktiven Leapmotor-Händler zu. Der Staff-Bereich kann den Händlerstamm aus der gelieferten Excel-/CSV-Struktur aktualisieren und Leads im unveränderten 61-spaltigen `LEAD_EMEA_PERM`-Format exportieren.

## Händler-Importvertrag

Akzeptierte Spalten:

| Eingabespalte | Intern | Regel |
|---|---|---|
| `MandatsNr.` | `dealer_code` | Pflicht, eindeutige stabile Kennung |
| `Site Code Vertrieb` | `site_code` | Optional, als Text inklusive führender Nullen |
| `Händlername` | `name` | Pflicht |
| `Adresse` | `address` | Pflicht |
| `Ort` | `city` | Pflicht |
| `PLZ` | `zip` | Pflicht, exakt fünf Ziffern und im PLZ-Katalog vorhanden |

Der Import normalisiert Leerzeichen, erhält führende Nullen und blockiert ungültige Pflichtfelder, doppelte Händlercodes und unbekannte PLZ. Fehlende Site-Codes sind Warnungen. Vor dem Schreiben zeigt die Oberfläche neue, geänderte, unveränderte und fehlerhafte Zeilen. Das Schreiben erfolgt vollständig oder gar nicht. Fehlende Händler werden nur nach ausdrücklicher Wahl deaktiviert. Jeder Lauf speichert Dateiname, Prüfsumme, Zählwerte und den vorherigen Händlerstand für eine Rücknahme.

## Geo-Zuordnung

- PLZ-Koordinaten: WZB-Datensatz `plz_geocoord`, Apache-2.0, Stand Januar 2019.
- Ortsnamen: GeoNames `DE.zip`, CC BY 4.0; je PLZ wird der zur WZB-Koordinate nächstgelegene Ortsdatensatz verwendet.
- Distanz: Großkreisentfernung nach Haversine.
- Gleichstand: erst Entfernung, dann Händlercode als stabiler Tie-Breaker.
- Die Zuordnung erfolgt serverseitig beim Speichern. Der Browser kann keinen Händlercode unterschieben.
- Am Lead bleiben Händlercode, Site-Code, Name, Adresse, Ort, Distanz und Datenstand nachvollziehbar.

`CITY` ist der aus dem PLZ-Katalog abgeleitete Hauptort des Leads. `DEALERCITY` ist der Ort des zugeordneten Händlers. Beide Felder dürfen nicht vermischt werden.

## Modellzuordnung

| Formularwert | `MODELCODE` | `MODELDESCRIPTION` |
|---|---:|---|
| `b03x` | `485` | `B03X` |
| `b05` | `486` | `B05` |
| `b10` | `B108` | `B10` |
| `c10` | `B118` | `C10` |
| `t03` | `489` | `T03` |

Nicht verwendet werden B03 sowie die getrennten Varianten B10 BEV/REEV und C10 BEV/REEV. Modellcodes sind immer Textwerte.

## Einwilligungen

| Formular | Zielspalte |
|---|---|
| Newsletter und Updates | `MARKETINGEMAIL` |
| Individuelle Angebote | `PRIVACYPROFILATION` |
| Weitergabe an Partner | `PRIVACYTHIRDPARTY` |

`MARKETINGPOST`, `MARKETINGSMS` und `MARKETINGPHONE` bleiben leer, weil das Formular keine ausdrückliche Kanal-Einwilligung dafür enthält. Telefonnummer und Kontaktwunsch sind keine allgemeine Telefon-Marketingeinwilligung.

## Exportprofil

Der Export behält alle 61 Spalten und ihre Reihenfolge. Nicht belegte Felder bleiben leer. Vorgaben im ersten Profil:

- `COUNTRYCODE=DE`
- `BRAND=LEAP`
- `LANGUAGE=DE`

Weitere Konstanten wie `MARKET`, `CAMPAIGN`, `OFFER`, `LEVEL1` bis `LEVEL4`, `CTA`, `EVENTNAME` und `EVENTLOCATION` sind eventbezogen im Staff-Bereich pflegbar. Die gespeicherten Modellzuordnungen und Konstanten werden serverseitig auf die Exportdaten angewendet.

## Abnahme

1. Ungültige oder verschobene Händlerzeilen werden vor dem Import blockiert.
2. Wiederholter identischer Import verändert nichts.
3. Geänderte Händler werden aktualisiert, fehlende nur nach Bestätigung deaktiviert.
4. Rücknahme stellt den vorherigen Stand wieder her.
5. Bekannte PLZ liefern den erwarteten nächsten Händler; ungültige PLZ erzeugen keinen Lead.
6. Der Export hat exakt 61 Spalten, Semikolon, UTF-8-BOM und CRLF.
7. Alle fünf Modelle werden exakt gemäß Tabelle übersetzt.
8. Keine Einwilligung wird aus Kontaktangaben oder Kontaktwunsch abgeleitet.
