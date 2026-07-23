#!/usr/bin/env node
/**
 * LEAP CHARGE — Tägliches Backup-Skript
 * Liest aktives Event + alle Spieler-/Score-/Instant-Win-Daten aus Supabase
 * und schreibt einen JSON-Snapshot ins iCloud-Drive-Verzeichnis.
 *
 * Verwendung:
 *   node backup-worker.js
 *
 * Einmalig manuell starten oder via launchd / crontab automatisieren.
 * Siehe setup-backup-cron.sh für Setup-Anweisungen.
 */

'use strict';

const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const { execSync } = require('child_process');

// ─── Zielverzeichnis ────────────────────────────────────────────────────────
const BACKUP_DIR = path.join(
  process.env.HOME,
  'Library/Mobile Documents/com~apple~CloudDocs/Share AI/leap-rally-backups'
);

// ─── Credentials ────────────────────────────────────────────────────────────
function getCredentials() {
  // Versuch 1: Apple Keychain
  try {
    const key = execSync(
      'security find-generic-password -s "LEAP_SUPABASE_KEY" -w 2>/dev/null',
      { encoding: 'utf8' }
    ).trim();
    if (key) {
      // URL aus Keychain oder Fallback zu Config
      let url = null;
      try {
        url = execSync(
          'security find-generic-password -s "LEAP_SUPABASE_URL" -w 2>/dev/null',
          { encoding: 'utf8' }
        ).trim() || null;
      } catch (_) {}
      if (url) return { url, anonKey: key };
    }
  } catch (_) {}

  // Versuch 2: supabase-config.js auslesen (enthält window.LEAP_SUPABASE)
  try {
    const configPath = path.join(__dirname, 'js/supabase-config.js');
    const src = fs.readFileSync(configPath, 'utf8');
    const urlMatch = src.match(/url:\s*['"]([^'"]+)['"]/);
    const keyMatch = src.match(/anonKey:\s*['"]([^'"]+)['"]/);
    if (urlMatch && keyMatch) {
      return { url: urlMatch[1], anonKey: keyMatch[1] };
    }
  } catch (_) {}

  throw new Error('Konnte Supabase-Credentials nicht laden. Keychain oder js/supabase-config.js prüfen.');
}

// ─── HTTP-Helper ─────────────────────────────────────────────────────────────
function supaFetch(baseUrl, anonKey, endpoint, params) {
  return new Promise((resolve, reject) => {
    const qs  = params ? '?' + new URLSearchParams(params).toString() : '';
    const url = new URL(baseUrl + endpoint + qs);
    const options = {
      hostname: url.hostname,
      port:     443,
      path:     url.pathname + url.search,
      method:   'GET',
      headers: {
        'apikey':        anonKey,
        'Authorization': 'Bearer ' + anonKey,
        'Accept':        'application/json',
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end',  () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        } else {
          try { resolve(JSON.parse(data)); }
          catch(e) { reject(new Error('JSON-Parse-Fehler: ' + data.slice(0, 200))); }
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ─── Hauptfunktion ───────────────────────────────────────────────────────────
async function runBackup() {
  console.log('[LEAP Backup] Starte Backup …', new Date().toISOString());

  const { url, anonKey } = getCredentials();
  console.log('[LEAP Backup] Supabase-URL:', url);

  // Aktives Event laden
  const events = await supaFetch(url, anonKey, '/rest/v1/events', {
    is_active: 'eq.true',
    select:    '*',
    limit:     '1',
  });

  if (!events || events.length === 0) {
    console.warn('[LEAP Backup] Kein aktives Event gefunden. Backup wird trotzdem erstellt (leeres events-Array).');
  }

  const activeEvent = events[0] || null;
  const eventId     = activeEvent ? activeEvent.id : null;

  // Alle Daten laden (ggf. auf aktives Event filtern)
  const playerParams = eventId
    ? { event_id: `eq.${eventId}`, select: '*', order: 'created_at.desc' }
    : { select: '*', order: 'created_at.desc', limit: '5000' };

  const scoreParams = eventId
    ? { event_id: `eq.${eventId}`, select: '*', order: 'created_at.desc' }
    : { select: '*', order: 'created_at.desc', limit: '5000' };

  const winParams = eventId
    ? { event_id: `eq.${eventId}`, select: '*', order: 'created_at.desc' }
    : { select: '*', order: 'created_at.desc', limit: '5000' };

  const [players, scores, instantWins] = await Promise.all([
    supaFetch(url, anonKey, '/rest/v1/players',      playerParams),
    supaFetch(url, anonKey, '/rest/v1/scores',       scoreParams),
    supaFetch(url, anonKey, '/rest/v1/instant_wins', winParams),
  ]);

  const snapshot = {
    backup_ts:    new Date().toISOString(),
    supabase_url: url,
    active_event: activeEvent,
    counts: {
      players:      players.length,
      scores:       scores.length,
      instant_wins: instantWins.length,
    },
    players,
    scores,
    instant_wins: instantWins,
  };

  // Zielverzeichnis anlegen
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  // Dateiname: YYYY-MM-DD.json (oder YYYY-MM-DD_HHMMSS.json bei Mehrfach-Run)
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');
  let outPath = path.join(BACKUP_DIR, `${dateStr}.json`);
  if (fs.existsSync(outPath)) {
    outPath = path.join(BACKUP_DIR, `${dateStr}_${timeStr}.json`);
  }

  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), 'utf8');
  console.log('[LEAP Backup] ✅ Backup gespeichert:', outPath);
  console.log(`[LEAP Backup]    Players: ${players.length} | Scores: ${scores.length} | Instant-Wins: ${instantWins.length}`);
}

runBackup().catch((err) => {
  console.error('[LEAP Backup] ❌ Fehler:', err.message);
  process.exit(1);
});
