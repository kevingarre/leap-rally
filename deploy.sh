#!/bin/bash
# Deploy: GitHub main → Hetzner Live
set -e
cd /var/www/leapmotor-tt
git fetch origin
git reset --hard origin/main
echo "Deployed: $(git rev-parse --short HEAD) at $(date +%F\ %H:%M)"

# nginx-Allowlist: get_wordpress_analytics + get_central_lead_export sicherstellen
NGINX_CONF="/etc/nginx/sites-enabled/leap-api"
if [ -f "$NGINX_CONF" ]; then
  if ! grep -q "get_wordpress_analytics" "$NGINX_CONF"; then
    python3 -c "
f = '$NGINX_CONF'
txt = open(f).read()
old = 'get_event_export|get_all_events_staff|get_staff_wins|get_event_analytics|archive_and_new_event|update_event|claim_instant_win'
new = 'get_event_export|get_all_events_staff|get_staff_wins|get_event_analytics|get_wordpress_analytics|get_central_lead_export|archive_and_new_event|update_event|claim_instant_win'
txt2 = txt.replace(old, new)
if txt2 != txt:
    open(f, 'w').write(txt2)
    print('nginx: Allowlist gepacht')
else:
    print('nginx: Kein Match, manuell pruefen')
"
    nginx -t && systemctl reload nginx && echo "nginx: reload OK"
  else
    echo "nginx: Allowlist bereits aktuell"
  fi
fi

# PostgREST Schema-Cache neu laden (SIGUSR1) — läuft als postgres-User
if pgrep -x postgrest > /dev/null; then
  sudo -u postgres pkill -SIGUSR1 -x postgrest 2>/dev/null || kill -SIGUSR1 $(pgrep -x postgrest | head -1) 2>/dev/null
  echo "postgrest: SIGUSR1 gesendet"
  sleep 2
fi
