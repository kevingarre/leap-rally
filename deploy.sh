#!/bin/bash
# Deploy: GitHub main → Hetzner Live
set -e
cd /var/www/leapmotor-tt
git fetch origin
git reset --hard origin/main
echo "Deployed: $(git rev-parse --short HEAD) at $(date +%F\ %H:%M)"

# nginx-Allowlist: alle benoetigten RPCs sicherstellen
NGINX_CONF="/etc/nginx/sites-enabled/leap-api"
if [ -f "$NGINX_CONF" ]; then
  echo "=== aktuelle RPC-Location ==="
  grep -n 'location.*rpc' "$NGINX_CONF" || true
  python3 -c "
import re, shutil
f = '$NGINX_CONF'
txt = open(f).read()
# Alle bekannten Staff-RPCs die in der rate-limited location sein muessen
RPCS = ['get_event_export','get_all_events_staff','get_staff_wins','get_event_analytics',
        'get_wordpress_analytics','get_central_lead_export',
        'archive_and_new_event','update_event','claim_instant_win']
# Finde die location-Zeile mit rpc-Pattern
m = re.search(r'location ~ \^/rest/v1/rpc/\(([^)]+)\)', txt)
if not m:
    print('nginx: RPC-Location nicht gefunden')
else:
    existing = set(m.group(1).split('|'))
    missing = [r for r in RPCS if r not in existing]
    if missing:
        new_list = '|'.join(RPCS)
        txt2 = txt.replace(m.group(1), new_list)
        open(f, 'w').write(txt2)
        print('nginx: Allowlist gepacht, hinzugefuegt:', missing)
    else:
        print('nginx: Allowlist vollstaendig:', sorted(existing))
"
  nginx -t && systemctl reload nginx && echo "nginx: reload OK"
fi

# PostgREST Schema-Cache neu laden (SIGUSR1) — läuft als postgres-User
if pgrep -x postgrest > /dev/null; then
  sudo -u postgres pkill -SIGUSR1 -x postgrest 2>/dev/null || kill -SIGUSR1 $(pgrep -x postgrest | head -1) 2>/dev/null
  echo "postgrest: SIGUSR1 gesendet"
  sleep 2
fi
