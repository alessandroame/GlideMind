# UI Design System Governance, Token Consistency & Static Linting Gate

- **Data**: 2026-10-12
- **Autore**: Antigravity Agent
- **Ambito**: UI Design System, Governance, Static Shift-Left Quality Gate, CSS Token Architecture

---

## 1. Contesto & Diagnosi

Durante l'audit della coerenza stilistica dell'interfaccia utente in GlideMind, è emersa una frammentazione significativa:
1. Erano presenti **11 colori esadecimali cablati** (`#dc2626`, `#f59e0b`, `#10b981`, `#0284c7`, `#4338ca`, `#fbbf24`, `#64748b`, `#22c55e`, `#ef4444`) all'interno di attributi `style="..."` nelle viste (`FlightDetailSheet.js`, `FlightReplayView.js`, `LogbookStatsView.js`, `SpotMapView.js`), con rottura del contrasto in Sunlight Light Mode (`[data-theme="light"]`).
2. Erano presenti blocchi HTML complessi formattati interamente con stili inline ad-hoc anziché classi semantiche dedicate (es. `.gm-spot-detail-sheet`).
3. Non esisteva alcuna regola in `.agents/rules/` che imponesse l'uso esclusivo dei token CSS e censisse le primitive del Design System.
4. Nessun test automatico nel Gate 3 di Shift-Left verificava l'aderenza delle viste ai token `--gm-*` o l'assenza di colori esadecimali cablati.
5. Era presente un disallineamento nel pulsante indietro di `FlightDetailSheet.js` con asserzione non soddisfatta in `tests/flightDetailView.test.js`.

---

## 2. Decisioni Architetturali & Modifiche Eseguite

1. **Formalizzazione Specifica Design System (`.agents/rules/ui_design_system_spec.md`)**:
   - Definiti i principi di Single Source of Truth (`css/theme.css`), Dual-Theme Parity e il divieto rigoroso di stili inline per proprietà statiche.
   - Censito il catalogo delle primitive: `.gm-card`, `.gm-card-interactive`, `.gm-btn-primary`, `.gm-btn-secondary`, `.gm-btn-ghost`, `.gm-stepper-btn`, `.gm-badge-*`, `.gm-section-title`, `.gm-stat-grid`, `.gm-stat-box`.
   - Introdotta la Blacklist di Stile: divieto di colori esadecimali nei file `.js` delle viste, divieto di classi utility non censite e divieto di emoji decorative.
2. **Aggiornamento Contratti Architetturali**:
   - Aggiornati `AGENTS.md`, `.agents/rules/shift_left_quality_gate.md` (Gate 2 e Gate 3) e `.agents/rules/constraints.md` (Sezione 3) con il riferimento vincolante alla specifica di Design System.
3. **Estensione Test Suite Shift-Left (`tests/ui/shiftLeftGovernance.test.mjs`)**:
   - Aggiunto `Gate 2 (UI Design System - Token Consistency)`: scansione automatica regex su `ui/views/*.js` per intercettare qualsiasi colore esadecimale (`#[0-9a-fA-F]{3,6}`) all'interno di attributi `style`.
   - Aggiunto `Gate 2 (UI Design System - Component Primitives)`: verifica statica della presenza in `css/theme.css` delle 10 classi canoniche del Design System.
4. **Bonifica del Codice & Nuove Classi CSS**:
   - Aggiunte a `css/theme.css` le classi `.gm-vario-color-*`, `.gm-phase-dot-*`, `.gm-simulated-badge`, `.gm-donut-bullet-muted`, `.gm-dist-bar-fill-muted`, `.gm-section-title`, `.gm-spot-detail-sheet`, `.gm-spot-detail-header`, `.gm-spot-detail-title`, `.gm-spot-detail-subtitle`, `.gm-spot-detail-reason-*`, `.gm-hazard-callout`, `.gm-ind-dot-*`.
   - Rimosse tutte le occorrenze di colori esadecimali cablati nelle viste, sostituendole con classi semantiche collegate a token `var(--gm-*)`.
   - Allineato il markup del pulsante indietro in `FlightDetailSheet.js` e la relativa asserzione in `tests/flightDetailView.test.js` su `Torna al Libretto Voli`.

---

## 3. Risultati & Verifiche

- `npm test`: 675 test passati con successo su 675 (0 fallimenti, 1 skipped offline guard).
- `tests/ui/shiftLeftGovernance.test.mjs`: 11 test passati (100%).
- `tests/flightDetailView.test.js`: 6 test passati (100%).
- Scansione statica su `ui/views/*.js` per colori esadecimali in stili inline: 0 occorrenze residue.
