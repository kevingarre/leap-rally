# LEAP CHARGE — Design Tokens (Leapmotor-konform)

Stand: 2026-07-14 · Freigegeben von Kevin (Grün #67c23a + 90er-Arcade-Look ok)

## Grundprinzip
Leapmotor CI = minimalistisch **Schwarz/Weiß**. EIN grüner Akzent für Energie/Erfolg.
Erlaubt: 90er-Arcade-Feeling, solange es zu Leap passt (reduziert, elektrisch, high-contrast).

## Farben
| Token | Hex | Verwendung |
|-------|-----|-----------|
| `--leap-black`      | #000000 | Primär-Hintergrund, Flächen |
| `--leap-ink`        | #0A0A0A | Tiefes Schwarz für Cards |
| `--leap-white`      | #FFFFFF | Text, Logo, Konturen |
| `--leap-green`      | #67C23A | AKZENT: Energie, Combo, Gewinn, CTA |
| `--leap-green-dark` | #529B2E | Grün gedrückt/Hover |
| `--leap-green-deep` | #0F500F | Grüne Flächen/Verläufe dunkel |
| `--leap-green-soft` | #95D475 | Glow, sekundär |
| `--leap-grey`       | #B3B3B3 | Sekundärtext, Muted |
| `--leap-grey-dark`  | #303133 | Rahmen, Trenner |

Ampel-Ausnahmen (nur Funktions-Feedback, sparsam):
- Fehler/Timer-kritisch: dezentes Rot (#FF4D51) — nur wo nötig.

## Typografie
- **Montserrat** (Hausschrift, liegt in assets/brand/ als .ttf)
  - Display/Headlines: Montserrat Black / ExtraBold, uppercase, weites Tracking
  - Body: Montserrat Regular / Medium
- **Orbitron RAUS** — ersetzt durch Montserrat.
- @font-face lokal einbinden (Offline-Event-Sicherheit), KEIN Google-Fonts-CDN.

## Logo
- `assets/brand/leapmotor-logo.svg` (monochrom, wird per CSS weiß/schwarz gefärbt)
- `assets/brand/leapmotor-logo.png` (1000×458, RGBA)
- Platzierung: Startscreen-Header prominent, dezent im HUD/Endscreen.
- Logo NICHT verzerren, Mindest-Schutzraum einhalten.

## Look & Feel
- Basis dunkel (Schwarz), Text weiß, Grün als einziges „lebendiges" Signal.
- 90er-Arcade: harte Kanten, Neon-Grün-Glows auf Schwarz, monospace-artige Zahlen ok.
- Batterie/Energie = grüner Ladebalken. Combo/Turbo = grüner Puls. Ghost-Gegner = weiß/grau.

## Fahrzeug-Sprites (Option A, KI-generiert)
- Einheitlicher Stil: Seitenansicht, weiße Karosserie + schwarze Kontur + grüner LED/Schweller-Akzent
- 4 Modelle: T03 (City-Klein), B05, B10, C10 (größer/SUV)
- Transparenter Hintergrund, nach rechts gerichtet, kein Schatten/Boden/Text
- Ablage: assets/vehicles/<model>.png
