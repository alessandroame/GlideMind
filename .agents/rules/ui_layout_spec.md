# Rule: GlideMind UI Layout & View Navigation Specification

## 1. Primary Navigation & Screen Layout
GlideMind uses a persistent 5-tab navigation architecture:
1. **Home Dashboard (`#view-home`)**:
   - 100% weather-centric Above-the-Fold layout (no pilot career KPI box; `#home-pilot-currency-alert` shown only when `reentry`/`lapsed`).
   - Single-row symbiotic toolbar (`#home-symbiotic-toolbar`) with `[‹ Data ▾ ›]` stepper, fixed quick date chips, and global search trigger.
   - Pinned Comprensori Cards (2-row compact cards with `3.5px` diurnal `.gm-home-timeline-bar`, determinant reason pills, and `.gm-spot-accordion-trigger`, $\ge 48\text{px}$ touch targets).
2. **Forecast & Flyability (`#view-forecast`)**:
   - Site identity, elevation badge, and 3-column `.gm-quick-subspot-switcher` (`Panoramica | Decollo | Atterraggio`).
   - Diurnal flyability timeline scrubber with uniform horizontal pills (`16x8px`) and `ORA` slot indicator (nominal `Live` badge hidden).
   - 360° wind and cross-wind alignment indicator + dual takeoff/landing aerological evaluation.
   - Time-series trend charts with 1:1 series LED indicators, threshold bands, and tap-to-expand zoom modal.
   - AI Briefing summary drawer.
3. **Spot Map (`#view-map`)**:
   - Interactive full-viewport 2D map via `IMapEngine` Leaflet adapter (`ui/map/mapEngineAdapter.js`) with keyless basemaps (Esri, OpenTopoMap, CyclOSM).
   - Sharded European catalog (`data/locations/<country>.json`), viewport culling, and 60 FPS cluster markers.
   - Takeoff exposure sectors, shortest-path dual windsocks, `22x22px` circular landing hub (`⏚`), and D–A glide ratio callout.
4. **Flight Logbook (`#view-logbook`)**:
   - Expandable 5-group filter bar (`Vela ▾`, `Anno ▾`, `Caratteristiche ▾`, `Tempo ▾`, `Distanza ▾`) with `.gm-filter-group-drawer` and logical `AND` combination.
   - Flight log cards (4-KPI layout with physical wing parameters $V_{\text{trim}}$, $V_{\text{max}}$, $L/D$; no bureaucratic `EN-A..D` badges).
   - IGC / ParaMeteo importer with strict `hasAttachedTrack` validation (zero synthetic tracks) and `FlightDetailSheet` (`100dvh`, 6 KPIs, aerodynamic debriefing, 5s Undo delete).
   - 3D flight trajectory replay launcher (`#view-replay` powered by MapLibre GL + Three.js V2 engine).
5. **Settings & Tools (`#view-settings`)**:
   - Centralized unit preferences (`core/units.js`: km/h, m/s, kt; m, ft; °C, °F).
   - Wing hangar (`core/gliders.js`, 55+ models) and opt-in pilot currency safety factor (`usePilotCurrencyFactor`).
   - Theme persistence, map layer preferences, backup/restore controls, and cache diagnostics.

---

## 2. Responsive Viewport Parity
- **Mobile (< 768px)**:
  - Sticky bottom tab bar (`#bottom-nav-bar`) with 5 touch icons + concise labels ($\ge 48\text{px}$ touch targets).
  - Full-height swipeable sheets and drawers (`100dvh`) instead of trapped modals.
- **Desktop (>= 768px)**:
  - Persistent top navigation header (`#desktop-nav-bar`) with synchronized active route state.
  - Multi-column widescreen dashboards avoiding excessive empty horizontal margins.
  - Keyboard shortcuts (`H` for Home, `F` for Forecast, `M` for Map, `L` for Logbook, `S` for Settings), strictly inactive when an overlay sheet is open or the event target is an interactive input.

---

## 3. Modal, Sheet & Floating Warning Lifecycle
- Never stack modal dialogs inside modal dialogs; use centralized `SheetManager` and close active sheets on route change (`ui/router.js`).
- All sheet close events must support backdrop tap, `Escape` key, and explicit top-right `✕` button (`48x48px`).
- All warning banners must use zero-CLS floating positioning (`position: fixed` above bottom nav/scrubber) with `.gm-warning-close-btn`.

---

## 4. Gate di Validazione UX & Vocabolario Pilota

1. **Laws of UX & Ergonomia Mobile**:
   - I requisiti ergonomici generali (Occam's razor, Fitts's law $\ge 48\text{px}$, Hick/Miller chunking, Jakob's law, Doherty threshold $< 400\text{ms}$) sono governati centralmente da [`laws-of-ux`](file:///C:/Users/aame/.gemini/config/plugins/laws-of-ux/rules/AGENTS.md) e dalla skill `ux-outdoor-and-field-ergonomics`.
2. **Audit Terminologico & Traduzione Fenomenologica (Novice Pilot Spec)**:
   - Traduzione obbligatoria di ogni grandezza aerologica nell'effetto pratico di sicurezza ([`novice_pilot_spec.md`](file:///c:/github/GlideMind/.agents/rules/novice_pilot_spec.md)):
     - *Instabilità / Temporali* anziché acronimo *CAPE* isolato.
     - *Base Nubi stimata* anziché acronimo *LCL* isolato.
     - *Turbolenza in Termica* anziché acronimo *EDR* isolato.
