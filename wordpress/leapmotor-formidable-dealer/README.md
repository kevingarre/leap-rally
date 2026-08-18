# Leapmotor Formidable Dealer Assignment

Integration für Formidable-Formular `7` (`leaptischte26`). Das Plugin:

- behandelt PLZ als fünfstelligen Text und erhält führende Nullen,
- blendet das manuelle Ortsfeld aus und setzt den kanonischen Ort serverseitig,
- zeigt den nächsten Händler nach vollständiger PLZ an,
- validiert die Zuordnung beim Absenden erneut,
- speichert einen unveränderlichen Händler-Snapshot je Formidable-Eintrag,
- stellt im Formidable-Menü den 61-spaltigen `LEAD_EMEA_PERM`-Export bereit.

Beim ersten Export werden vorhandene Einträge mit gültiger PLZ, aber ohne Snapshot einmalig serverseitig nachgezogen. Neue Einträge erhalten ihren Snapshot direkt beim Speichern.

Aktivierung erzeugt ausschließlich die additive Tabelle `wp_leapmotor_dealer_assignments`. Bestehende Formidable-Tabellen und Einträge werden nicht verändert.

## Rücknahme

Das Plugin kann jederzeit deaktiviert werden. Das bestehende Formular arbeitet danach unverändert weiter. Die Snapshot-Tabelle bleibt absichtlich erhalten, damit bereits gespeicherte Zuordnungen nicht verloren gehen.
