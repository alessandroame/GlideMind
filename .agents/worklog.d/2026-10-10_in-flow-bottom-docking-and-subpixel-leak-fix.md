# In-Flow Bottom Docking & Subpixel Leak Remediation

**Data:** 2026-10-10  
**Autore:** Alessandro Amè (GlideMind Core Team)  
**Ambito:** UI Layout / Shell / ForecastView / Ergonomia HMI

---

## 1. Contesto e Diagnosi del Difetto
Nel rendering su display ad alta densità di pixel (`devicePixelRatio != 1`, es. 1.25, 2.0), è stata segnalata una riga di circa 1px sul fondo dello schermo attraverso la quale trasparivano gli elementi scorrevoli della vista meteorologica.

### Causa Radice
1. **Disallineamento Subpixel di `position: fixed`**: Con `position: fixed; bottom: 0;` sulla `#bottom-nav-bar` e `position: fixed; bottom: 64px;` sullo scrubber, i motori di rendering (Chromium Blink, WebKit) calcolano le posizioni su coordinate frazionarie. Con altezze decimali del viewport (es. 669.6px), la discretizzazione a pixel fisici produce fessure subpixel di 0.4px - 1px.
2. **Fuoriuscita dello Scroll dal Contenitore Utile**: `#forecast-view` occupava l'intera altezza con padding inferiore artificiale (`pb-48`), lasciando che le card scendessero fisicamente sotto lo scrubber e la barra di navigazione fissa.

---

## 2. Decisioni Architetturali (ADR)
1. **Transizione a In-Flow Flex Docking (Zero Fixed Overlays)**:
   - `#app-root` configurato come flexbox a colonna rigido (`display: flex; flex-direction: column; height: 100dvh; max-height: 100dvh; overflow: clip;`).
   - `#main-view` configurato come elemento flex ad espansione (`flex: 1 1 0%; min-height: 0; position: relative; overflow: hidden;`).
   - `#bottom-nav-bar` convertito da `position: fixed` a componente in-flow in fondo al root (`position: relative; flex-shrink: 0; width: 100%;`).
2. **Incapsulamento dello Scroller in `ForecastView`**:
   - Creato `.gm-forecast-scroll-container` (`overflow-y: auto; flex: 1 1 0%; min-height: 0;`) per ospitare le card meteorologiche, l'header e il briefing.
   - Posizionato `.gm-timeline-scrubber-sticky` come footer in-flow flex (`position: relative; flex-shrink: 0; width: 100%;`) al di fuori e al di sotto del contenitore scorrevole.
3. **Sigillo Anti-Leak**:
   - Applicato `overflow: clip` ad `#app-root` e `overflow: hidden` ad `html, body` e `#sheet-container`.
4. **Armonizzazione Preferiti di Default (Piemonte)**:
   - Aggiornato `DEFAULT_COMPRENSORI` con 7 comprensori stabili (mantenendo Monte Cornizzolo a indice 0 per i test regressivi di ingestione meteo e aggiungendo Chialamberto, Martiniana Po e Monte Cavallaria).
   - Allineato il filtro Preferiti e i test della Home Dashboard.

---

## 3. Verifiche Empiriche
- **Test di Regressione**: 311/311 test passati con successo (`npm test`).
- **Ispezione Geometrica Headless (Chrome DevTools MCP)**:
  - Spazio tra Scrubber e Bottom Nav Bar: `0.000038px` (0px geometrici).
  - Spazio tra Bottom Nav Bar e fondo viewport: `0.0px` (nessuna fessura o trascinamento).
  - Scroll container rigorosamente terminante al bordo superiore dello scrubber (`top: 498px`).
- **Verifica Visiva**: Ispezione tramite screenshot confermata su viewport mobile (502x670 a dpr 1.25).
