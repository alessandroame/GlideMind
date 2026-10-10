# Worklog: Implementazione Collapsing Sticky Header in ForecastView (Recognition over Recall)

**Data**: 2026-10-10  
**Autore**: Antigravity Agent  
**Ambito**: UI / Ergonomia Mobile / Laws of UX / Previsioni Meteo  

---

## 1. Contesto & Motivazione

Nella pagina delle previsioni ([ui/views/ForecastView.js](file:///ui/views/ForecastView.js)), la testata contiene la barra di selezione comprensorio (`.gm-comprensorio-bar`), la tendina di selezione sub-spot/decollo e i tab orizzontali delle date. Durante lo scorrimento verso il basso per consultare i grafici temporali del vento, i radiosondaggi o il briefing di volo di Guido, la testata usciva completamente dal viewport.

Questo generava una perdita dell'ancoraggio contestuale (*Recognition over Recall*, euristica NN/G #6): il pilota doveva ricordare a memoria quale decollo (es. Decollo Sud 180° vs Decollo Nord) e quale quota fossero selezionati per interpretare l'allineamento del vento e le quote nubi.

---

## 2. Decisioni Architetturali & Design Pattern

1. **Collapsing Sticky Header Monofila (`#forecast-sticky-bar`)**:
   - Invece di fissare l'intero header (che avrebbe sottratto oltre 140px, violando l'economia del viewport e la Legge di Hick), è stata introdotta una barra monofila condensata alta 44px (`.gm-forecast-sticky-bar`).
   - A riposo (`scrollTop <= 60px`): la barra è nascosta via GPU (`transform: translateY(-100%); opacity: 0; pointer-events: none`).
   - In scorrimento (`scrollTop > 60px`): la barra scivola fluidamente in vista (`transform: translateY(0); opacity: 1; pointer-events: auto`), ancorata in cima a `gm-forecast-view`.
   - Contenuto essenziale: Icona pin, Nome Comprensorio in grassetto, Sub-Spot/Decollo attivo con quota e punto cardinale (es. `Decollo Sud (1050m · S)`), badge meteorologico live/offline (`#gm-forecast-live-badge-sticky`) e pulsante rapido di scroll-to-top (`data-action="scroll-to-top"`).
2. **Supporto Safe Area Notch**:
   - La barra sticky rispetta le Safe Area iOS/Android: `height: calc(44px + env(safe-area-inset-top, 0px))` con `padding-top: env(safe-area-inset-top, 0px)`.
3. **Zero Layout Thrashing & Zero CLS**:
   - L'attivazione avviene tramite toggle di classe CSS con listener passivo ad alte prestazioni (`{ passive: true }`), azzerando il Cumulative Layout Shift (CLS = 0).
4. **Resilienza Headless**:
   - Guardie difensive su tutti i selettori DOM (`typeof this.containerEl.querySelector === 'function'`) per garantire compatibilità al 100% nei test unitari Node.js con mock containers.
5. **Ottimizzazione Spazio Orizzontale Badge Live**:
   - Abbreviato il testo del badge di stato rete da `Live Open-Meteo` a `Live`, riducendo l'ingombro orizzontale da ~110px a ~45px e liberando oltre 65px di larghezza utile per evitare il troncamento ad ellissi dei nomi di comprensorio e decollo su display compatti.

---

## 3. File Modificati

- [ui/views/ForecastView.js](file:///ui/views/ForecastView.js):
  - Inizializzazione proprietà di scroll e sticky bar nel constructor (`isScrolledPastHeader`, `scrollContainerEl`, `stickyBarEl`, `boundScrollHandler`).
  - Metodi `setupScrollListener()`, `handleScroll()`, e `renderStickyBar()`.
  - Gestione azione `scroll-to-top` in `handleClick()`.
  - Supporto per istanze multiple del badge di rete via `renderLiveWeatherBadge('sticky')` e `updateLiveStatusBadgeInDom()`.
- [css/theme.css](file:///css/theme.css):
  - Regole CSS per `.gm-forecast-sticky-bar`, `.gm-forecast-sticky-bar.visible`, layout interno, tipografia, pulsante scroll-to-top e posizionamento relativo di `.gm-forecast-view`.
- [tests/ui/forecastView.test.mjs](file:///tests/ui/forecastView.test.mjs):
  - Tre nuovi test automatizzati per rendering della barra sticky, commutazione visibilità su scroll threshold, gestione dello scroll-to-top e token CSS.
