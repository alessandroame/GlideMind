# Rule: GlideMind UI Layout & View Navigation Specification

## 1. Primary Navigation & Screen Layout
GlideMind uses a persistent 5-tab navigation architecture:
1. **Home Dashboard (`#view-home`)**:
   - Date scrubber (Today, Tomorrow, Weekend, Custom).
   - Summary card (Weather Nowcast & Alert indicator).
   - Pinned Takeoffs Carousel (horizontal snap-scroll, $\ge 44\text{px}$ touch targets).
   - Recent Spots quick picker.
   - Global Search trigger (`[ Cerca Decollo... ]`).
2. **Forecast & Flyability (`#view-forecast`)**:
   - Site identity & elevation badge.
   - Hourly flyability timeline (color-coded waterfall, click-to-inspect).
   - 360° wind and cross-wind indicator.
   - Atmospheric sounding (Rischio temporali / Instabilità, Base Nubi, Gradiente termico).
   - AI Briefing summary drawer.
3. **Spot Map (`#view-map`)**:
   - Interactive full-viewport map (MapLibre GL).
   - Takeoff cones (colored by wind alignment) and official/emergency landing fields.
   - Thermal hotspots & airspace ceiling layer.
   - "Dove Volare Oggi" radius distance filter.
4. **Flight Logbook (`#view-logbook`)**:
   - Flight log cards (date, site, duration, max altitude, glider).
   - IGC upload drag-and-drop zone.
   - Pilot career KPIs (total hours, flights, max altitude, duration).
   - 3D flight trajectory replay launcher (mounts the full-screen `#view-replay` via `SheetManager`).
5. **Settings & Tools (`#view-settings`)**:
   - Unit preferences (km/h vs m/s, m vs ft, Celsius).
   - Wing hangar (gliders, harness, reserve chute repacking date).
   - Backup, auto-sync and restore snapshot controls.
   - Cache management & offline diagnostic.

---

## 2. Responsive Viewport Parity
- **Mobile (< 768px)**:
  - Sticky bottom tab bar (`#bottom-nav-bar`) with 5 touch icons + concise labels.
  - Full-height swipeable sheets and drawers instead of trapped modals.
- **Desktop (>= 768px)**:
  - Persistent top navigation header (`#desktop-nav-bar`) with synchronized active route state.
  - Multi-column widescreen dashboards avoiding excessive empty horizontal margins.
  - Keyboard shortcuts (`H` for Home, `F` for Forecast, `M` for Map, `L` for Logbook, `S` for Settings), strictly inactive when the event target is an interactive input (`HTMLInputElement`, `HTMLTextAreaElement`, or `isContentEditable`).

---

## 3. Modal & Sheet Lifecycle
- Never stack modal dialogs inside modal dialogs.
- Use a single centralized `SheetManager` for secondary contextual panels (Takeoff details, AI Briefing, Spot Picker).
- All sheet close events must support backdrop tap, escape key, and explicit top-right 'X' button.

---

## 4. Gate di Validazione UX & Vocabolario Pilota

1. **Laws of UX & Ergonomia Mobile**:
   - I requisiti ergonomici generali (Occam's razor, Fitts's law $\ge 48\text{px}$, Hick/Miller chunking, Jakob's law, Doherty threshold $< 400\text{ms}$) sono governati centralmente da [`laws-of-ux`](file:///c:/github/antigravity-plugins/plugins/laws-of-ux) e dalla skill `ux-outdoor-and-field-ergonomics`.
2. **Audit Terminologico & Traduzione Fenomenologica (Novice Pilot Spec)**:
   - Censimento preventivo di tutte le etichette, unità di misura e grandezze meteo prima di definire il markup o il design della vista.
   - Traduzione obbligatoria di ogni grandezza aerologica nell'effetto pratico di sicurezza per il pilota principiante ([`novice_pilot_spec.md`](file:///c:/github/GlideMind/.agents/rules/novice_pilot_spec.md)):
     - *Rischio Temporali / Instabilità* anziché *Energia CAPE* isolata.
     - *Base Nubi stimata* anziché acronimo accademico *LCL*.
     - *Turbolenza in Termica* anziché grandezza *EDR*.
   - Gerarchia visiva: stato qualitativo semantico in primo piano con color-coding chiaro; metrica numerica specialistica subordinata come informazione secondaria o tooltip.


