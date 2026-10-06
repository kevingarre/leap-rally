# Leapmotor Formidable Dealer Assignment

Integration für die Formidable-Formulare `7` (`leaptischte26`, Glücksrad) und `8` (`leape42026`, e4 Testival). Das Plugin:

- behandelt PLZ als fünfstelligen Text und erhält führende Nullen,
- blendet das manuelle Ortsfeld aus und setzt den kanonischen Ort serverseitig,
- zeigt den nächsten Händler nach vollständiger PLZ an,
- validiert die Zuordnung beim Absenden erneut,
- speichert einen unveränderlichen Händler-Snapshot je Formidable-Eintrag,
- stellt im Formidable-Menü den 62-spaltigen `LEAD_EMEA_PERM`-Export bereit.

Beide Formulare werden zentral übertragen und über Formular-ID und Quelle unterschieden. Formular 8 besitzt keine Kontaktabsicht und kein Wunschmodell; diese beiden Werte werden dort bewusst leer übertragen.

Beim ersten Export werden vorhandene Einträge mit gültiger PLZ, aber ohne Snapshot einmalig serverseitig nachgezogen. Neue Einträge erhalten ihren Snapshot direkt beim Speichern.

Aktivierung erzeugt ausschließlich die additive Tabelle `wp_leapmotor_dealer_assignments`. Bestehende Formidable-Tabellen und Einträge werden nicht verändert.

## Rücknahme

Das Plugin kann jederzeit deaktiviert werden. Das bestehende Formular arbeitet danach unverändert weiter. Die Snapshot-Tabelle bleibt absichtlich erhalten, damit bereits gespeicherte Zuordnungen nicht verloren gehen.
