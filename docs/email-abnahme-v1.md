# E-Mail: Erste Abnahme Leapmotor TT Challenge

---

**An:** Nico
**Von:** Kevin Garre, Garre Consulting
**Betreff:** Leapmotor TT Challenge — Funktionsübersicht & Freigabe v1

---

Hey Nico,

ich wollte dir den aktuellen Stand der Leapmotor TT Challenge zeigen — wir sind bereit für die erste Abnahme.

Was beim letzten Gespräch noch ein Klickdummy war, ist heute eine vollständig einsatzbereite digitale Event-Aktivierung: technisch fertiggestellt, ausgiebig getestet und bereit für den ersten realen Einsatz an einem Leapmotor-Event.

---

Das Konzept

Besucher spielen direkt auf ihrem eigenen Smartphone ein Arcade-Geschicklichkeitsspiel — ohne App-Installation, ohne Account, ohne Wartezeit. Der Einstieg erfolgt per QR-Code am Stand, das Spiel startet sofort im Browser. Die gesamte Aktivierung ist darauf ausgelegt, in unter 60 Sekunden zu beginnen und 2 bis 3 Minuten zu fesseln.

---

Spielmechanik

Das Spiel basiert auf klassischer Arcade-Mechanik, angereichert mit Leapmotor-spezifischen Elementen.

Der Spieler steuert ein Fahrzeug am unteren Bildschirmrand und schlägt einen Ball durch ein Blockfeld — ähnlich dem Klassiker Breakout, aber mit Leapmotor-DNA. Jeder getroffene Block lädt die Energie-Batterie auf. Wer die Batterie vollständig auflädt, aktiviert einen Turbo-Boost: Das eigene Fahrzeug überholt in einem dramatischen Moment das Ghost Car auf der virtuellen Rennstrecke — und gewinnt.

Die vier Leapmotor-Modelle T03, B05, B10 und C10 sind als Sonderblöcke im Spielfeld platziert. Jedes Modell hat beim Treffen einen eigenen Effekt:

- T03 Elektro-Ball: Der Ball durchdringt Blöcke ohne abzuprallen
- B05 Speed Boost: 30 Prozent schnellerer Ball für mehrere Sekunden
- B10 Paddle Boost: Breiteres Steuerpad für einfacheres Spielen
- C10 Jackpot Multiball: Zwei Zusatzbälle gleichzeitig aktiv

Das Spiel wird mit steigender Schwierigkeit fortgesetzt — Ballgeschwindigkeit nimmt zu, das Steuerpad wird schmaler. Ein Combo-System belohnt schnelle Trefferfolgen mit einem Multiplikator bis Faktor 8. Es gibt kein fixes Zeitlimit; das Spiel endet erst wenn alle Leben verbraucht sind, was typischerweise 90 bis 180 Sekunden dauert.

Ein Ghost Car auf dem Streckendisplay zeigt dem Spieler jederzeit, wie weit er vom Sofort-Gewinn entfernt ist — das erzeugt Spannung bis zur letzten Sekunde.

Wenn kein Besucher spielt, wechselt der Bildschirm automatisch in einen Attract Mode: fahrende Leapmotor-Fahrzeuge animieren den Stand und machen Neugierige auf die Aktivierung aufmerksam.

---

Sofort-Gewinn-System und Code-Mechanik

Das ist der Kern der Aktivierung.

Erreicht ein Spieler die festgelegte Gewinnschwelle (Punktzahl konfigurierbar), erscheint direkt im Spiel ein Opt-In-Formular. Der Spieler gibt seine Kontaktdaten ein, stimmt den Teilnahmebedingungen zu und wählt sein bevorzugtes Leapmotor-Modell. Direkt danach erscheint ein vierstelliger Gewinn-Code auf dem Bildschirm.

Der Spieler geht damit zum Stand, zeigt dem Personal den Code und der Gewinn wird in der App bestätigt und als eingelöst markiert.

Das System ist vollständig serverseitig abgesichert: Codes werden nicht im Browser berechnet, sondern ausschließlich von der Datenbank ausgestellt. Es ist nicht möglich, Codes zu manipulieren oder zu erraten. Ein Spieler kann so oft spielen wie er möchte — einen Gewinn-Code erhält er jedoch nur einmal pro E-Mail-Adresse pro Event. Wer nochmals spielt, verbessert seinen Highscore, bekommt aber keinen zweiten Code.

---

Datenerfassung und Datenschutz

Das Opt-In-Formular erfasst Name, E-Mail, Telefon (optional), Postleitzahl, Wunschmodell und Kontaktinteresse (Probefahrt, Angebot oder kein Kontakt gewünscht). Die Einwilligungen für Marketing, Angebote und Partner sind als separate freiwillige Checkboxen aufgebaut. Alle Daten werden verschlüsselt in einem europäischen Rechenzentrum in Frankfurt gespeichert und erfüllen die Anforderungen der DSGVO.

---

Staff-Backend

Das passwortgeschützte Dashboard ist direkt auf dem Smartphone des Standpersonals aufrufbar. Es bietet:

Event-Verwaltung: Neue Events anlegen mit Name, Ort, Datum und Schwierigkeitsgrad. Laufende Events jederzeit bearbeiten. Alte Events archivieren und nahtlos neue starten.

Echtzeit-Statistik: Spielrunden, registrierte Spieler, Durchschnittsscore, Spielzeit, Conversion-Rate (Spieler mit echtem Kontaktinteresse geteilt durch Gesamtspielrunden) und beliebtestes Wunschmodell.

Datenexport: CSV-Export der vollständigen Teilnehmerliste mit allen erfassten Feldern, inklusive bestem Score, Gewinn-Code-Status und Spieldauer — für jedes vergangene Event, nicht nur das aktuelle.

Gewinn-Code-Verwaltung: Übersicht aller ausgestellten Codes mit Status, Einlösen per Klick mit Bestätigung, automatische Aktualisierung alle 30 Sekunden.

---

TV-Leaderboard

Eine eigenständige Anzeige für einen Bildschirm am Stand zeigt die Top 10 des aktuellen Events in Echtzeit, aktualisiert sich automatisch und enthält einen prominenten QR-Code für den direkten Spielstart. Ein fahrender Leapmotor-Fuhrpark unterstreicht die Markenpräsenz auf dem Display.

---

Was ich von dir brauche

Damit wir das für den ersten echten Einsatz fertigstellen können, brauche ich von euch:

1. Veranstaltungsname, Ort und Datum des ersten Events
2. Freigabe oder Anpassung der Teilnahmebedingungen und des Datenschutzhinweises — ich schicke dir dazu einen Entwurf
3. Was ist der Sofort-Gewinn? Das müssen wir dem Spieler im Formular kommunizieren

Von meiner Seite sind dann noch rund 30 Minuten technischer Abschluss nötig: Event-Konfiguration und Zugangsdaten.

Zum Ausprobieren:

Live-Demo: https://kevingarre.github.io/leap-rally/
TV-Leaderboard: https://kevingarre.github.io/leap-rally/leaderboard.html

Meld dich gerne für eine kurze Video-Demo — dann zeige ich dir alles live.

Beste Grüße
Kevin
