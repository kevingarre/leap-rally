# MEMORY – LEAP RALLY Project

> Projekt-lokale Entscheidungen, Scope-Definitionen und nächste Schritte.
> Letzte Aktualisierung: 2026-06-08

---

## Scope

### Was dieses Projekt IST
- Interaktiver **Klick-Dummy** / Concept Prototype für eine **Leapmotor Event-Aktivierung**
- Mobile-first statische Web-App für Messen, Showrooms, Pop-up-Events
- Zeigt: Flow, Look & Feel, Interaktionskonzept, Brand-Tone
- **Kein echtes Spiel** – keine persistente Daten, kein Backend, kein echtes Scoring

### Was dieses Projekt NICHT ist
- Keine Produkt-App
- Kein Multi-Player System
- Kein echtes Leaderboard (Daten sind Fake / Mock)
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
| Gameplay | Tap-Mechanic (30s, Energy-Bar, Combo) | Niedrigschwellig, universell verständlich, funktioniert One-handed |
| Leaderboard | Fake-Daten + dynamische Einfügung | Demo-Zweck, zeigt Konzept ohne Backend |
| Assets | Nur Emojis + CSS-Shapes | Keine Download-Abhängigkeiten, keine IP-Probleme |

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
GAME_DURATION  = 30     // Sekunden – gut für Event (nicht zu lang)
ENERGY_PER_TAP = 1.4    // Base-Energie pro Tap
COMBO_TIMEOUT  = 700    // ms Pause → Combo Reset
COMBO_TRIGGER  = 300    // ms zwischen Taps → Combo baut auf
MAX_COMBO      = 5      // Maximaler Multiplikator
```

**Tuning-Richtlinien:**
- `ENERGY_PER_TAP` erhöhen → einfacher (für ältere Besucher)
- `GAME_DURATION` auf 20s senken → schnelleres Event-Throughput
- `MAX_COMBO` auf 3 senken → weniger Skill-Gap

---

## Nächste Schritte (Priorisiert)

### P0 – Für Event-Einsatz notwendig
- [ ] **Echte Brand-Assets einbauen** (Logo SVG, offizielle Farben)
- [ ] **Fahrzeug-Illustration** (Leapmotor C10/T03 Silhouette als SVG ersetzen statt 🚗)
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
