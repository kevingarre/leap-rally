# Leapmotor Formidable Dealer Assignment

Integration für die Formidable-Formulare `7` (`leaptischte26`, Glücksrad) und `8` (`leape42026`, e4 Testival). Das Plugin:

- behandelt PLZ als fünfstelligen Text und erhält führende Nullen,
- blendet das manuelle Ortsfeld aus und setzt den kanonischen Ort serverseitig,
- zeigt den nächsten Händler nach vollständiger PLZ an,
- validiert die Zuordnung beim Absenden erneut,
- speichert einen unveränderlichen Händler-Snapshot je Formidable-Eintrag,
- stellt im Formidable-Menü den 62-spaltigen `LEAD_EMEA_PERM`-Export bereit.

Beide Formulare werden zentral übertragen, über Formular-ID und Quelle unterschieden und per UUID dem Backend-Event `e4 Testival` zugeordnet. Formular 8 besitzt keine Kontaktabsicht und kein Wunschmodell; diese beiden Werte werden dort bewusst leer übertragen.

Neue und aktualisierte Einträge werden aus den gespeicherten Formidable-Metadaten synchronisiert. Zusätzlich führt das Plugin die bereits serverseitig validierte PLZ/Orts-Zuordnung in eigenen versteckten POST-Feldern mit, damit Formidable-Feldtransformationen den Nachlauf nicht leeren können. Auf der Integrationsseite können fehlende oder fehlerhafte Übertragungen idempotent erneut gesendet werden.

Beim ersten Export werden vorhandene Einträge mit gültiger PLZ, aber ohne vollständigen Snapshot einmalig serverseitig nachgezogen. Falls ein historischer Händler keine dreistellige Standortkennung mehr liefert, verwendet der lokale Rückfall-Export den dokumentierten neutralen Wert `000`, statt den gesamten Export abzubrechen.

Aktivierung erzeugt ausschließlich die additive Tabelle `wp_leapmotor_dealer_assignments`. Bestehende Formidable-Tabellen und Einträge werden nicht verändert.

## Rücknahme

Das Plugin kann jederzeit deaktiviert werden. Das bestehende Formular arbeitet danach unverändert weiter. Die Snapshot-Tabelle bleibt absichtlich erhalten, damit bereits gespeicherte Zuordnungen nicht verloren gehen.
