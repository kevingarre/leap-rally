#!/bin/bash
# LEAP CHARGE — Backup-Cron Setup
# Richtet einen launchd-Job ein, der täglich um 03:00 Uhr backup-worker.js ausführt.
#
# Verwendung (einmalig, als Admin):
#   chmod +x setup-backup-cron.sh
#   ./setup-backup-cron.sh
#
# Danach läuft das Backup automatisch täglich um 03:00 Uhr.
# Manueller Test: launchctl start com.leapmotor.rally-backup

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_LABEL="com.leapmotor.rally-backup"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"
NODE_BIN="$(which node || echo /opt/homebrew/bin/node)"
LOG_DIR="$HOME/Library/Logs/leap-rally"

echo "🔧 LEAP CHARGE Backup-Cron Setup"
echo "   Skript: $SCRIPT_DIR/backup-worker.js"
echo "   Node:   $NODE_BIN"
echo "   Plist:  $PLIST_PATH"
echo ""

# Log-Verzeichnis anlegen
mkdir -p "$LOG_DIR"

# LaunchAgent plist erstellen
cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${SCRIPT_DIR}/backup-worker.js</string>
  </array>

  <!-- Täglich um 03:00 Uhr -->
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>3</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>

  <key>StandardOutPath</key>
  <string>${LOG_DIR}/backup.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/backup-error.log</string>

  <key>RunAtLoad</key>
  <false/>

  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${HOME}</string>
  </dict>
</dict>
</plist>
PLIST

echo "✅ LaunchAgent plist erstellt: $PLIST_PATH"

# Eventuell vorherigen Job entladen
launchctl unload "$PLIST_PATH" 2>/dev/null || true

# Job laden
launchctl load "$PLIST_PATH"
echo "✅ LaunchAgent geladen. Läuft täglich um 03:00 Uhr."
echo ""
echo "📋 Nützliche Befehle:"
echo "   Manuell starten:   launchctl start ${PLIST_LABEL}"
echo "   Job entladen:      launchctl unload $PLIST_PATH"
echo "   Job neu laden:     launchctl load $PLIST_PATH"
echo "   Logs anzeigen:     tail -f $LOG_DIR/backup.log"
echo ""
echo "💡 Alternativer crontab-Eintrag (falls launchd nicht gewünscht):"
echo "   Öffne Terminal und tippe:  crontab -e"
echo "   Füge diese Zeile ein:"
echo "   0 3 * * * ${NODE_BIN} ${SCRIPT_DIR}/backup-worker.js >> ${LOG_DIR}/backup.log 2>&1"
