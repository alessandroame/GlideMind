# Bonifica Header Mappa Cartografica ed Ergonomia Controlli Flottanti

- **Data**: 2026-10-10
- **Autore**: Alessandro Amé
- **Ambito**: Cartografia, UI Shell, Design System, Ergonomia Touch Mobile (`ui/views/SpotMapView.js`, `css/theme.css`, `tests/ui/spotMapView.test.mjs`)

---

## 1. Contesto e Diagnosi dell'Anomalia Visiva

A seguito dell'introduzione preliminare del filtro località esterno alla mappa, la visualizzazione su dispositivi mobili presentava una grave regressione rispetto agli standard aeronautici di GlideMind:
1. **Affollamento e Wrapping Multi-Riga**:
   - Cinque controlli eterogenei (selettore macro-regione, selettore località, selettore layer cartografico, badge di rete, pulsante raccomandazione top-spot) erano collocati in un unico blocco con `flex-wrap: wrap`.
   - Su viewport mobile (360px–390px), i controlli andavano a capo su 3 righe disallineate formando un blocco scuro di circa 160px di altezza (~40% dello schermo verticale utile), soffocando la mappa e violando i principi di *Occam's Razor* e *Visual Hierarchy*.
2. **Stato Blank del Selettore Località**:
   - In fase di idratazione asincrona del catalogo comprensori, la rigenerazione di `select.innerHTML` senza assegnazione esplicita della proprietà `selectedIndex` lasciava il selettore nello stato `-1`, visualizzando un box vuoto privo di etichetta.
3. **Sovradimensionamento del Badge di Rete**:
   - La stringa `"Aggiornamento..."` (16 caratteri con trasformazione maiuscola) occupava ~130px orizzontali, provocando troncamento aggressivo del nome della località selezionata.

---

## 2. Interventi di Bonifica Architetturale e Geometrica

### 2.1 Top Bar Esterna a Riga Singola Rigida (50px)
- La barra superiore esterna al canvas (`.gm-map-top-bar`) è stata riprogettata con altezza fissa rigorosa di **50px** (`height: 50px; min-height: 50px; max-height: 50px;`) e `flex-wrap: nowrap;`.
- Contiene **esclusivamente** i controlli di filtraggio territoriale e lo stato di rete:
  - **Selettore Macro-Regione** (`#gm-map-macro-region-select`): larghezza contenuta a `118px` (`flex: 0 0 118px;`), chevron SVG compatto integrato, sfondo elevato e raggio 8px.
  - **Selettore Località / Comprensorio** (`#gm-map-spot-select`): espansione fluida (`flex: 1 1 0%; min-width: 0;`), testo ad alto contrasto (`var(--gm-text-primary)` / `#f8fafc`) e troncamento ad ellissi.
  - **Badge Stato Rete** (`#gm-map-network-badge`): pillola compatta non flessibile (`flex: 0 0 auto;`) con microcopy essenziale a bassa occupazione orizzontale (`"Live"`, `"Sync..."`, `"Offline"`).

### 2.2 Standardizzazione Controlli Flottanti con l'Overlay della Mini-Mappa a Schermo Intero
Per eliminare la discrepanza visiva tra la schermata mappa principale e la mini-mappa espansa a schermo intero (`.gm-flight-analysis-map-controls` in `ForecastView.js`), la disposizione dei controlli su mappa è stata completamente uniformata:
- **Barra Controlli Flottanti Unificata** (`.gm-map-canvas-controls`):
  - Contenitore posizionato a `top: 12px; left: 12px; right: 12px;` con `display: flex; justify-content: space-between; align-items: center; pointer-events: none;`.
- **Sinistra - Selettore Layer Cartografico** (`#gm-map-layer-select` con `.gm-map-ctrl-select`):
  - Card in vetro satinato scuro (`rgba(15, 23, 42, 0.85)` / `blur(12px)`), raggio 8px (`var(--gm-radius-md)`), altezza touch 44px, chevron SVG integrato no-repeat, identico a `.gm-flight-analysis-layer-select`.
- **Destra - Gruppo Azioni Flottanti** (`.gm-map-canvas-controls-group`):
  - **Pulsante Top Spot** (`#gm-map-top-spot-btn` con `.gm-map-ctrl-btn`): icona target SVG + nome del top spot focalizzato, altezza 44px, raggio 8px.
  - **Pulsante GPS Centratura** (`#gm-map-gps-btn` con `.gm-map-ctrl-btn`): icona mirino GPS SVG + etichetta `"GPS"`, associato a geolocalizzazione nativa (`navigator.geolocation`) e centratura dinamica con marker utente (`mapEngine.showUserLocation`).
- **Occam's Razor & Clean Canvas**:
  - I pulsanti quadrati ridondanti di zoom Leaflet `+` e `-` sono stati rimossi (`.gm-map-view .leaflet-control-zoom { display: none !important; }`), esattamente come nella mini-mappa fullscreen, delegando l'ingrandimento ai gesti touch fluidi nativi (pinch-to-zoom).

### 2.3 Risoluzione Stato Selettore e Idratazione Catalogo
- In `SpotMapView.updateSpotSelectOptions()` e `bindEvents()`, garantita l'assegnazione deterministica di `select.value` e guardia `if (select.selectedIndex === -1 && select.options.length > 0) select.selectedIndex = 0;`.
- La voce predefinita `"Tutte le località (176)"` e i comprensori focalizzati risultano immediatamente visibili e leggibili con contrasto WCAG AA su tutti i motori di rendering.

---

## 3. Verifica Visiva e Regression Testing

- **Collaudo Headless Chrome su Viewport Mobile**:
  - Validata la perfetta armonia visiva e geometrica su viewport **390×844** (iPhone 14) e **360×740** (Samsung compatta):
    - Top bar esterna: fissa a 50px, zero wrapping, zero overflow.
    - Controlli flottanti: selettore layer a sinistra (~85px), gruppo pulsanti a destra (Top Spot + GPS ~165px), spazio centrale libero > 80px a 360px.
    - Nessuna collisione di gesture o troncamento testo.
- **Suite di Test Automatizzata**:
  - `npm test`: **442/442 test passati con successo su 61 test suite** (0 errori, 0 skipped).
