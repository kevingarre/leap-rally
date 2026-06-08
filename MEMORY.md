# MEMORY – LEAP RALLY Project

> Projekt-lokale Entscheidungen, Scope-Definitionen und nächste Schritte.
> Letzte Aktualisierung: 2026-06-08 (Silhouetten-Runde v3)

---

## Scope

### Was dieses Projekt IST
- Interaktiver **spielbarer Concept Prototype** für eine **Leapmotor Event-Aktivierung**
- Mobile-first statische Web-App für Messen, Showrooms, Pop-up-Events
- Zeigt: Flow, Look & Feel, Interaktionskonzept, Brand-Tone
- **Echte Mini-Game-Mechanik** mit Paddle, Ball, Block-Grid, Kollisionen und 30-Sekunden-Run

### Was dieses Projekt NICHT ist
- Keine Produkt-App
- Kein Multi-Player System
- Kein echtes persistentes Leaderboard (Daten sind Fake / Mock)
- Keine offizielle Leapmotor-Anwendung (Brand-Approximation)

---

## Architektur-Entscheidungen

| Entscheidung | Wahl | Begründung |
|---|---|---|
| Framework | Kein Framework (Vanilla) | Leichtgewichtig, kein Build-Step, sofort deploybar |
| CSS | Eigenes CSS mit Variablen | Maximale Kontrolle über Animationen, kein Overhead |
| Fonts | Google Fonts CDN | Orbitron für Sporty-Display, kein lokales Asset-Management |
| State-Management | Einfaches Objekt (`state = {}`) | Prototype-Komplexität angemessen |
| Screens | CSS-Transitions (opacity + translateX) | Smooth, performant, kein JS-Framework nötig |
| Gameplay | Breakout-/Tischtennis-Mechanik auf Canvas | Mechanik ist sofort verständlich, deutlich näher an Event-Game und Tischtennis-Narrativ |
| Leaderboard | Fake-Daten + dynamische Einfügung | Demo-Zweck, zeigt Konzept ohne Backend |
| Assets | Inline SVG-Silhouetten + CSS-Shapes | Keine Download-Abhängigkeiten, keine IP-Probleme; Fahrzeug-Silhouetten ersetzen Emojis |

---

## Brand-Approximation

Leapmotor-Farben (approximiert, nicht offiziell):
- **Primär Orange**: `#FF5500` (Leapmotor nutzt Orange in Branding)
- **Dunkel**: `#0A0A1A` (Premium/Tech-Gefühl)
- **Elektro-Blau**: `#00C8FF` (E-Mobility Assoziierung)
- **Neon-Grün**: `#39FF14` (Vollladung / Erfolg)
- **Font**: Orbitron (motorsport-inspiriert, approximiert Tech-Feeling)

Für **Produktion** zu ersetzen durch:
- Offizielles Leapmotor-Logo (SVG)
- Exakte Brand-Farben (Brand-Guideline anfordern)
- Offizielle Fahrzeug-Silhouetten/Illustrationen
- Leapmotor-eigene Schriftart (falls vorhanden)

---

## Gameplay-Parameter (Tuning)

```js
GAME_DURATION      = 30    // Sekunden – gut fuer Event (nicht zu lang)
MAX_COMBO          = 5     // Maximaler Multiplikator
BALL_BASE_SPEED    = hoch  // schnelleres Match-Gefuehl
WAVE_SPEED_GAIN    = 10%   // pro abgeraeumter Welle
GRID_SIZE          = 4x6   // kompakt fuer Mobile
CAR_TARGET_BONUS   = +140 Score, +3 Energie
FULL_CHARGE_REWARD = +400 Score + Turbo-Boost
```

**Tuning-Richtlinien:**
- Ballgeschwindigkeit fuer Event-Audience fein justieren (aktuell bewusst schneller)
- `GAME_DURATION` auf 20s senken → schnelleres Event-Throughput
- Block-Grid kleiner halten → schnelleres Erfolgserlebnis
- `MAX_COMBO` auf 3 senken → weniger Skill-Gap

---

## Umgesetzte Silhouetten-Punkte (2026-06-08 v3)

- [x] **Player-Car** als stilisierte Crossover/SUV-Silhouette (Inline SVG, 44×26px, orange #FF5500, Leapmotor-inspiriertes horizontales LED-Lichtband vorne)
- [x] **Boost-Variante** des Player-Cars (grüne Karosserie #39FF14, Renn-Mittelstreifen, grüne LED-Akzente) – via CSS-Klasse `.boost-mode` auf `#game-car` umgeschaltet (kein textContent-Overwrite mehr)
- [x] **Ghost-Car/Gegner** als kompakte Schrägheck-Silhouette (Inline SVG, 34×20px, blaugrau #4B5E7A), klar kleiner und farblich abgegrenzt vom Player-Car
- [x] **Hero-Car** auf Start-Screen ebenfalls als SVG-Silhouette (64×36px Player-Car-Variante)
- [x] **Block-Ziel-Icon** im Canvas neu: `drawCarBlock()` zeichnet eine stilisierte Fahrzeug-Silhouette (Body + Kabine + Räder als weiße Canvas-Shapes) statt `fillText('🚗')`
- [x] `resetGameState()` entfernt `.boost-mode`-Klasse sauber beim Neustart
- [x] Cache-Busting auf `v=20260608g` angehoben
- [x] JS-Syntax OK (node --check); HTML-Smoke-Check OK (alle 8 Prüfpunkte grün)
- [x] Keine User-facing Texte verändert (nur Gameplay-Visuals)
- [x] Statisch deploybar, kein Build-Step

## Umgesetzte Polishing-Punkte (2026-06-08 v2)

- [x] Texte auf Tischtennis + Leapmotor + Charge/E-Drive umgestellt (kein Rally/Rallye mehr in user-facing Text)
- [x] Ghost-Car als Gegner auf dem Track; überholt bei 100%-Turbo-Boost sichtbar
- [x] Boost-Overlay DOM-Banner (`⚡ TURBO-BOOST AKTIVIERT!`) erscheint über Batteriebalken bei Vollladung
- [x] Battery-charged CSS-Animation (grüner Glow-Burst bei 100%)
- [x] car-target-hit Bounce-Animation bei Auto-Zielblock-Treffer
- [x] Endscreen: "🏠 ZUM STARTSCREEN" Button (goHome) neben "🔄 NOCHMAL SPIELEN" (playAgainDirect)
- [x] Cache-Busting Assets auf `v=20260608f` angehoben
- [x] JS-Syntax OK (node --check)

---

## Nächste Schritte (Priorisiert)

### P0 – Für Event-Einsatz notwendig
- [ ] **Echte Brand-Assets einbauen** (Logo SVG, offizielle Farben)
- [x] **Fahrzeug-Silhouetten eingebaut** (stilisierter Crossover/SUV als Player-Car, kompakter Hatchback als Ghost-Car, beide als Inline SVG)
- [ ] **Name-Eingabe** vor Start für echten Leaderboard-Eintrag
- [ ] **Touch-Optimierung testen** auf echten Geräten (iOS Safari, Android Chrome)

### P1 – Nice-to-have für Demo
- [ ] **Sound-Effekte** (Tap, Combo, Vollladung) – WebAudio API, kein Asset-Download
- [ ] **Vibration** bei Combo (Navigator.vibrate API)
- [ ] **PWA-Manifest** – App-ähnliche Installation auf Homescreen
- [ ] **QR-Code** auf Start-Screen (für Event-Booth Türschild → Phone)
- [ ] **Kiosk-Mode** – Auto-Reset nach 60s Inaktivität

### P2 – Später / Nice-to-have
- [ ] **Echter Leaderboard-Service** (Supabase / Firebase Realtime)
- [ ] **Multi-Language** (DE/EN Toggle)
- [ ] **Dark/Light Mode** (für Indoor-Display an Sonnenlicht)
- [ ] **Analytics** (GA4 / Plausible – Event-Reichweite messen)
- [ ] **Vite Migration** bei Skalierung (wenn mehr Screens/Features)

---

## Technische Schulden

- `navigator.clipboard` Fallback für ältere Browser (getSelection workaround vorhanden)
- Google Fonts CDN-Abhängigkeit → für Offline-Events: Fonts local embedden
- Fake-Leaderboard-Daten sind hardcoded → bei echtem Event: API-Endpoint
- Kein Resize-Handler waehrend laufendem Spiel, Rotation sollte per Restart behandelt werden
- Nur ein Block-Treffer pro Frame, bei sehr hoher Geschwindigkeit koennen Edge-Cases auftreten
- 2026-06-08 Hotfix: `#game-hud` explizit im Markup gesetzt, damit Countdown/Gameplay nach "Let's Race" korrekt startet
- 2026-06-08 Mechanik-Upgrade: Canvas-Breakout ersetzt die fruehere Tap-Demo
- 2026-06-08 Cache-Busting fuer `css/style.css` und `js/app.js` hinzugefuegt, weil mobile Browser/GitHub-Pages-Clients teils neues HTML mit altem JS/CSS gemischt geladen haben
- 2026-06-08 Upgrade fuer bessere Wiedererkennung und Pace: Paddle als Tischtennis-Schlaeger gerendert, Spielgeschwindigkeit erhoeht, Auto-Zielbloecke mit Extra-Bonus und Full-Charge-Turbo eingebaut
- 2026-06-08 Polishing v2: Rebranding LEAP RALLY -> LEAP CHARGE; Texte weg von Rally/Rallye, hin zu Tischtennis + Leapmotor + Charge; Ghost-Car/Gegner auf Track mit Overtake-Animation bei Turbo-Boost; DOM boost-overlay bei 100% Batterie; Home-Button im Endscreen; car-target-hit bounce animation; Cache-Busting auf v=20260608f
- 2026-06-08 Silhouetten v3: Alle Auto-Emojis durch stilisierte Inline-SVG-Fahrzeugsilhouetten ersetzt (Player=SUV/Crossover orange, Boost=Rennvariante grün, Ghost=Kompakter blaugrau, Hero-Car=SVG, Block-Target=Canvas drawCarBlock()); Cache-Busting auf v=20260608g

---

## Test-Hinweise

```bash
# Desktop Browser (Chrome DevTools → Responsive Mode)
# Empfehlung: 390×844 (iPhone 14) oder 360×800 (Android)

# iOS Safari testen:
# - Safe Area Insets (notch/home indicator) – bereits via env() berücksichtigt
# - Touch-Events: ontouchstart UND onclick registriert (doppelt sicher)

# Performance:
# - Keine externen Abhängigkeiten außer Google Fonts
# - CSS-Animationen nutzen transform/opacity (GPU-kompatibel)
# - Kein Layout-Thrashing in Gameplay-Loop
```

---

## Commit-Konventionen

```
feat(leap-rally): ...   # Neues Feature
fix(leap-rally): ...    # Bugfix
style(leap-rally): ...  # Reine Style-Änderungen
```
