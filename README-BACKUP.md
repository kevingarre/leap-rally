# LEAP CHARGE — Backup-System

Dieses Dokument erklärt das automatische Backup-System für LEAP CHARGE Event-Daten.

---

## Was wird gesichert?

Das Backup-Skript liest täglich alle Daten des **aktiven Events** aus Supabase:

| Tabelle | Inhalt |
|---|---|
| `events` | Event-Konfiguration (Name, Schwellenwert, etc.) |
| `players` | Alle Spieler-Einträge mit Kontaktdaten + Consents |
| `scores` | Alle Scores mit Level, Dauer, Instant-Win-Flag |
| `instant_wins` | Alle ausgegebenen Gewinn-Codes |

Die Daten werden als **JSON-Snapshot** gespeichert:
```
~/Library/Mobile Documents/com~apple~CloudDocs/Share AI/leap-rally-backups/YYYY-MM-DD.json
```

→ Das Verzeichnis liegt im **iCloud Drive** und wird automatisch synchronisiert.

---

## Dateien

| Datei | Zweck |
|---|---|
| `backup-worker.js` | Backup-Skript (Node.js, standalone) |
| `setup-backup-cron.sh` | Richtet launchd-Job für tägliches Backup ein |
| `README-BACKUP.md` | Diese Datei |

---

## Einmalige Einrichtung (automatisches tägliches Backup)

```bash
# 1. Im Repo-Verzeichnis:
chmod +x setup-backup-cron.sh

# 2. Setup ausführen (lädt launchd-Job):
./setup-backup-cron.sh
```

Das Skript richtet einen **launchd LaunchAgent** ein, der täglich um **03:00 Uhr** läuft.

### Credentials

Das Skript versucht die Supabase-Credentials in dieser Reihenfolge zu laden:

1. **Apple Keychain** (empfohlen):
   ```bash
   # Einmalig speichern:
   security add-generic-password -s "LEAP_SUPABASE_KEY" -a "leap" -w "sb_publishable_DEIN_KEY"
   security add-generic-password -s "LEAP_SUPABASE_URL" -a "leap" -w "https://DEIN_PROJECT.supabase.co"
   ```

2. **Fallback: `js/supabase-config.js`** — wird automatisch gelesen, falls Keychain-Einträge fehlen.

---

## Manueller Test

```bash
# Backup sofort ausführen:
node backup-worker.js

# Logs anzeigen (nach Setup):
tail -f ~/Library/Logs/leap-rally/backup.log
```

---

## Backup wiederherstellen / importieren

Die JSON-Dateien sind selbsterklärend. Für einen Import in eine neue Supabase-Instanz:

```bash
# Beispiel: Players aus Backup per curl importieren
SUPABASE_URL="https://DEIN_PROJECT.supabase.co"
SERVICE_KEY="dein-service-role-key"

cat 2026-07-15.json | jq '.players' | \
  curl -X POST "$SUPABASE_URL/rest/v1/players" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d @-
```

> ⚠️ Für den Import wird der **service_role**-Key benötigt (nicht der anon-Key).  
> Den service_role-Key NIEMALS in das Git-Repo committen!

---

## Backup-Dateien im iCloud Drive

```
~/Library/Mobile Documents/com~apple~CloudDocs/Share AI/leap-rally-backups/
├── 2026-07-15.json    ← täglicher Snapshot
├── 2026-07-16.json
└── ...
```

Die Dateien werden via iCloud automatisch mit allen Apple-Geräten synchronisiert.

---

## launchd-Verwaltung

```bash
# Job-Status prüfen:
launchctl list | grep leap

# Manuell starten:
launchctl start com.leapmotor.rally-backup

# Job deaktivieren:
launchctl unload ~/Library/LaunchAgents/com.leapmotor.rally-backup.plist

# Job reaktivieren:
launchctl load ~/Library/LaunchAgents/com.leapmotor.rally-backup.plist
```
