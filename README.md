# 🏓⚡🚗 LEAP RALLY

**Mobiler Klick-Dummy für Leapmotor als Event Activation**

---

## Übersicht

LEAP RALLY ist eine eigenständige, statische Web-App als interaktiver Concept-Prototype / Klickdummy für eine Leapmotor-Event-Aktivierung. Das Thema: **Tischtennis × E-Mobility** – jeder Aufschlag lädt ein Leapmotor-Fahrzeug auf.

**Narrative:** Ein Tischtennisball generiert beim Treffen Energie → lädt die Batterie eines Leapmotor-EVs → Fahrzeug fährt durchs Leaderboard.

---

## Screens

| Screen | Beschreibung |
|--------|-------------|
| **Start** | Branding, Hero-Animation (Ball → Blitz → Auto), CTA |
| **Rules** | 4 Spielregeln, Narrative-Erklärung, „Let's Race!"-Button |
| **Gameplay** | 30s Timer, Tap-Ball, Energie-Bar, Auto-Track, Combo-System |
| **Leaderboard** | Ergebnis-Card, Score, Fake-Leaderboard mit Spieler-Entry, Teilen |

---

## Features

- 📱 **Mobile-first** – optimiert für Smartphones (360–430px), funktioniert im Browser
- ⚡ **Combo-System** – schnelle Taps (< 300ms) erhöhen den Multiplikator bis ×5
- 🚗 **Car-Track** – Auto fährt proportional zur Energie auf der Strecke
- 🏆 **Fake-Leaderboard** – Spieler wird dynamisch an der richtigen Position eingefügt
- 📤 **Share-Funktion** – Text in die Zwischenablage kopieren
- 🎮 **Countdown-Overlay** – 3–2–1–GO! Intro vor dem Spiel
- 🎨 **Animiert** – Ripples, Float-Zahlen, Energie-Funken, Puls-Animationen
- 📍 **Händlerzuordnung** – nächster aktiver Leapmotor-Händler wird serverseitig aus der PLZ ermittelt
- 📥 **Versionierter Händlerimport** – Excel/CSV mit Vorschau, Validierung und Rücknahme im Staff-Bereich
- 📤 **EMEA-Lead-Export** – 62-spaltiges Zielprofil mit Modell-, Händler- und Einwilligungszuordnung

Der Datenvertrag und die Abnahmeregeln stehen in `docs/HAENDLER-IMPORT-UND-LEAD-EXPORT.md`. Die Datenbankerweiterung liegt in `supabase/11_dealer_matching.sql`.

---

## Technologie

- **Reines HTML/CSS/JS** – keine Build-Tools, kein Framework, kein npm
- **Google Fonts CDN** – Orbitron (Display) + Inter (Body)
- **Statisch deploybar** – relative Pfade, kein Server notwendig
- **GitHub Pages-kompatibel** – `index.html` im Root

---

## Dateistruktur

```
projects/leap-rally/
├── index.html          # Haupt-App (4 Screens + 2 Modals)
├── css/
│   └── style.css       # ~600 Zeilen, mobile-first, CSS-Variablen
├── js/
│   └── app.js          # ~300 Zeilen, Spiellogik, State-Machine
├── README.md           # Diese Datei
└── MEMORY.md           # Projekt-Scope & Entscheidungen
```

---

## Deployment

### Lokal testen

```bash
# Option 1: Python HTTP-Server
cd projects/leap-rally
python3 -m http.server 8080
# → http://localhost:8080

# Option 2: VS Code Live Server oder
# Direkt index.html im Browser öffnen (file://)
```

### GitHub Pages

1. Repo erstellen (oder bestehenden Workspace-Ordner nutzen)
2. `projects/leap-rally/` als Root setzen **oder** Files ins Repo-Root kopieren
3. GitHub Pages → Source: `main` / `/ (root)`
4. App ist sofort erreichbar unter `https://<user>.github.io/<repo>/`

---

## Branding / Assets

Alle visuellen Elemente sind **selbst erstellt oder Public Domain**:
- Keine offiziellen Leapmotor-Logos, keine geschützten Assets
- Brand-Approximation: Orbitron-Font, Orange (#FF5500) als Primärfarbe
- Emojis (🏓🚗⚡🏆) als universelle Platzhalter
- Für Produktion: Leapmotor-Logo, echte Fahrzeug-SVGs, Markenschriften ersetzen

---

## Score-Berechnung

```
score = hits × 20
      + (maxCombo − 1) × hits × 5
      + energyPercent × 15
```

Maximaler Score bei 30s perfektem Spiel (≈ 100 Taps, ×5 Combo, 100% Energie):
- `100 × 20 + 4 × 100 × 5 + 100 × 15 = 2000 + 2000 + 1500 = 5500`

---

## Nächste Schritte (Produktion)

→ Siehe `MEMORY.md` für detaillierte Roadmap

---

## Erstellt

Projekt-Datum: 2026-06-08  
Stack: HTML5 / CSS3 / Vanilla JS  
Status: Klick-Dummy / Concept Prototype
