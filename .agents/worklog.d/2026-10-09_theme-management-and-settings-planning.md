# 2026-10-09 - Pianificazione Architetturale: Gestione Temi & Sunlight Light Mode (Fase 8-bis)

- **Tipo**: Architettura / Planning / Design System
- **Modulo**: `DESIDERATA.md`, `MASTER_PLAN.md`, `constraints.md`, `MEMORY.md`
- **Autore**: Antigravity

---

## 1. Contesto & Motivazione

A seguito dell'analisi delle condizioni operative dei piloti di volo libero (parapendio e deltaplano), è emerso che l'uso esclusivo del tema scuro (Dark Cockpit), per quanto ottimale in penombra e per display OLED, presenta un limite fisico di leggibilità all'aperto sotto luce solare zenitale diretta (mezzogiorno sui decolli alpini e appenninici): l'effetto specchio del vetro dello smartphone sul fondo nero puro ostacola la lettura rapida dei parametri aeronautici.

Per contro, i temi chiari convenzionali da ufficio (colori pastello, contrasti attenuati) falliscono all'aperto sbiadendo completamente.

È stata quindi formalizzata l'architettura per un **Dual High-Contrast Theme Engine** con una modalità chiara specificamente tarata per l'esterno: **Sunlight High-Contrast Mode**.

---

## 2. Decisioni Architetturali (ADR)

1. **Dual High-Contrast Theme Engine (`dark` / `light` / `system`)**:
   - `dark` (Cockpit Mode): default per interni, auto, imbraghi coperti e risparmio batteria OLED.
   - `light` (Sunlight Mode): massima luminanza, fondo bianco ottico/slate chiaro (`#f8fafc` / `#ffffff`) e testo scuro quasi nero (`#0a0c10`), per saturare il display ed eliminare i riflessi a specchio del cielo.
   - `system`: allineamento automatico alla preferenza OS via `@media (prefers-color-scheme)`.

2. **Ricalibrazione WCAG 2.1 AA per la Volabilità**:
   - I 4 colori semantici di volabilità (🟢 Volabile, 🟡 Cautela, 🔴 Chiuso, ⚫ Severo) vengono ridefiniti in varianti dense su fondo chiaro (Verde `#15803d`, Ambra `#b45309`, Rosso `#b91c1c`, Nero `#09090b`), mantenendo rigorosamente il contrast ratio $\ge 4.5:1$ conforme agli standard di accessibilità universale.

3. **Integrazione in `SettingsView.js` (Fase 8-bis)**:
   - La gestione del tema viene allocata nel tab 5 (`#settings`), accompagnata dal selettore dell'ala attiva (Hangar con proxy EN-A..EN-D), unità aeronautiche (km/h vs nodi, m vs ft, m/s vs ft/min) e controlli di backup/ripristino snapshot.

4. **Sincronizzazione Runtime a Zero Ricaricamento**:
   - Lo store governa il valore reattivo in `store.ui.theme`.
   - Il tema si applica istantaneamente a `document.documentElement.dataset.theme = theme` e al meta tag `<meta name="theme-color">` per la colorazione della barra di stato del browser mobile.

---

## 3. Modifiche ai Documenti di Governance

- `DESIDERATA.md`: Inserimento della voce **Fase 8-bis: Gestione Temi (Dark Cockpit & Sunlight Light Mode) & Vista Impostazioni (`SettingsView.js`)**.
- `MASTER_PLAN.md`: Dettagliata la sezione **Phase 8-bis: Settings View, Glider Hangar & Dual Theme Engine (Sunlight Light Mode)**.
- `.agents/rules/constraints.md`: Aggiornata la Sezione 3 con il vincolo del Dual High-Contrast Theme Engine.
- `MEMORY.md`: Aggiunta la voce di lezione e vincolo #32.
