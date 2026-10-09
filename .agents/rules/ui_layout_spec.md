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
   - Atmospheric sounding (CAPE, LCL Cloud Base, thermal lapse rate).
   - AI Briefing summary drawer.
3. **Spot Map (`#view-map`)**:
   - Interactive full-viewport map (MapLibre GL).
   - Takeoff cones (colored by wind alignment) and official/emergency landing fields.
   - Thermal hotspots & airspace ceiling layer.
   - "Dove Volare Oggi" radius distance filter.
4. **Flight Logbook (`#view-logbook`)**:
   - Flight log cards (date, site, duration, max altitude, glider).
   - IGC upload drag-and-drop zone.
   - Pilot career KPIs (total hours, flights, SIV syllabus checklist).
   - 3D flight trajectory replay launcher (mounts the full-screen `#view-replay` via `SheetManager`).
5. **Settings & Tools (`#view-settings`)**:
   - Unit preferences (km/h vs m/s, m vs ft, Celsius).
   - Wing hangar (gliders, harness, reserve chute repacking date).
   - Peter Pan flight training syllabus tracker & Excel export.
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

## 4. Gate Obbligatorio di Validazione UX Laws (Pre-Design UX Check)
Prima di redigere markup, stili CSS o implementare viste e componenti UI, l'architettura d'interfaccia deve superare e documentare esplicitamente un audit preliminare contro le leggi ergonomiche:

1. **Occam's Razor & Legge di Prägnanz (Zero Ridondanza)**:
   - Verificare che nessun controllo, azione di navigazione o pulsante primario sia duplicato.
   - Se la barra inferiore (`#bottom-nav-bar`) espone già una rotta di primo livello (es. Home), è vietato introdurre pulsanti di ritorno Home o back ridondanti negli header secondari.
2. **Fitts's Law & Thumb Zone (Ergonomia e Portata)**:
   - Posizionare i controlli interattivi ad alta frequenza (scrubber orari, trigger primari, switch di vista) nella zona naturale del pollice (parte inferiore dello schermo).
   - Touch target minimo tassativo di 48×48 px su mobile (con padding trasparente se l'elemento visivo è minore).
3. **Hick's Law & Miller's Law (Riduzione del Carico Cognitivo)**:
   - Limitare le scelte primarie concorrenti a 3–5 opzioni.
   - Suddividere le informazioni complesse in blocchi distinti (chunking).
   - Zero scroll orizzontale della pagina o di barre temporali primarie (scrubber a slot fissi compressi a colpo d'occhio).
4. **Jakob's Law & Gerarchia di Navigazione**:
   - Barra di navigazione fissa inferiore per il livello principale dell'app.
   - `SheetManager` (bottom sheet swipeabili) per filtri, picker e drill-down contestuali, evitando dialoghi modali popup bloccanti e annidati.
5. **Doherty Threshold (<400ms)**:
   - Tutte le interazioni di selezione (ora, data, spot, tab) devono aggiornare lo stato e la vista istantaneamente (<50ms).

