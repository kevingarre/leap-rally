#!/bin/bash
# Deploy: GitHub main → Hetzner Live
set -e
cd /var/www/leapmotor-tt
git fetch origin
git reset --hard origin/main
echo "Deployed: $(git rev-parse --short HEAD) at $(date +%F\ %H:%M)"

# nginx: RPC-Allowlist vollständig neu setzen (deterministisch, kein Regex-Raten)
NGINX_CONF="/etc/nginx/sites-enabled/leap-api"
if [ -f "$NGINX_CONF" ]; then
  echo "=== nginx config vor Patch (rpc-relevante Zeilen) ==="
  grep -n 'rpc\|get_\|leap_staff\|leap_api' "$NGINX_CONF" || true

  python3 << 'PYEOF'
import re

f = '/etc/nginx/sites-enabled/leap-api'
txt = open(f).read()

# Ziel-Liste aller erlaubten Staff-RPCs
RPCS = '|'.join([
    'get_event_export',
    'get_all_events_staff',
    'get_staff_wins',
    'get_event_analytics',
    'get_wordpress_analytics',
    'get_central_lead_export',
    'archive_and_new_event',
    'update_event',
    'claim_instant_win',
])

# Ersetze die gesamte location-Zeile mit rpc-Alternation — egal wie sie aktuell lautet
pattern = r'(location\s*~\s*\^/rest/v1/rpc/\()[^)]+(\))'
replacement = r'\g<1>' + RPCS + r'\g<2>'
txt2, n = re.subn(pattern, replacement, txt)

if n == 0:
    print('nginx: KEIN MATCH fuer location-Zeile — config manuell pruefen')
else:
    open(f, 'w').write(txt2)
    print(f'nginx: location-Zeile gepacht ({n} Treffer)')
    print('nginx: neue RPC-Liste:', RPCS)
PYEOF

  echo "=== nginx config nach Patch ==="
  grep -n 'get_event_analytics\|get_wordpress\|get_central' "$NGINX_CONF" || true

  nginx -t && systemctl reload nginx && echo "nginx: reload OK"
fi

# PostgREST Schema-Cache neu laden (SIGUSR1)
if pgrep -x postgrest > /dev/null; then
  kill -SIGUSR1 $(pgrep -x postgrest | head -1) 2>/dev/null && echo "postgrest: SIGUSR1 gesendet" || echo "postgrest: SIGUSR1 fehlgeschlagen"
  sleep 2
fi
