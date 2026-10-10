# Rimozione Disegni Sintetici su Mappa e Ripristino Swipe Continuo Scrubber Orario

- **Data**: 2026-10-10
- **Autore**: Alessandro Amé
- **Ambito**: Cartografia Comprensorio, Ergonomia Touch, Analisi Volo (`ui/map/mapEngineAdapter.js`, `ui/views/ForecastView.js`, `css/theme.css`, `tests/ui/forecastView.test.mjs`)

---

## 1. Contesto e Diagnosi delle Anomalie

1. **Disegni Geometrici Fittizi su Mappa Comprensorio**:
   - Nella vista di ispezione volo a schermo intero (`openFlightAnalysisOverlay`), il modulo cartografico tracciava sovrimpresse sul terreno e sulla foto satellitare una serie di polilinee geometriche sintetiche (circuito di atterraggio a C / a 8 con sottovento, base e finale; cerchio di attesa quota; linea tratteggiata di planata tra decollo e atterraggio; settore di lancio).
   - *Riscontro Operativo Piloti*: I tracciati sintetici risultavano percepiti come "disegni inventati" che ostruivano la lettura visiva del rilievo reale, delle linee di livello e della conformazione del fondo valle, simulando falsamente una rotta GPS o una procedura geometricamente rigida non aderente al terreno.
2. **Malfunzionamento dello Swipe sullo Scrubber Orario**:
   - Il trascinamento continuo con il dito sullo scrubber orario (slide scrub da 08:00 a 20:00) non funzionava su dispositivi touch: toccando e scorrendo lateralmente non avveniva alcuna variazione oraria o la selezione rimaneva bloccata sulle 08:00.
   - *Cause Radici*:
     1. In `ForecastView.js`, `handlePointerDown` risolveva esclusivamente `#forecast-timeline-strip`, fallendo nel trovare l'elemento quando l'utente interagiva con il cassetto inferiore dell'analisi volo (`#flight-analysis-timeline-strip`).
     2. Sugli eventi `TouchEvent` (`touchstart`, `touchmove`, `touchend`), la proprietà standard `evt.clientX` è `undefined` in quanto le coordinate risiedono nei vettori `evt.touches[0].clientX` o `evt.changedTouches[0].clientX`.
     3. Mancanza di `touch-action: none;` sulla classe `.gm-flight-analysis-scrubber`, consentendo ai gesti di pan verticale del viewport mobile di intercettare e annullare l'interazione touch orizzontale.
     4. Assenza di listener a livello di `window` durante lo scrubbing: se il polpastrello usciva di pochi pixel dai 36px della strip, l'evento venica perso interrompendo lo scorrimento.

---

## 2. Interventi Implementativi

### 2.1 Bonifica Cartografica di `LeafletMapEngine` (`ui/map/mapEngineAdapter.js`)
- Eliminati tutti i layer geometrici artificiali da `renderComprensorioFlightMap()`:
  - Rimossi: `flightTakeoffSector`, `flightGlideLine`, `circuitLayers` (downwind, base, final, figure eight, holding circle).
- Mantenuti esclusivamente i riferimenti aeronautici fisici ed autentici:
  - **Pin Decollo**: `▲ [Nome] [Quota]m` con manica a vento orientata in tempo reale in base al vento orario calcolato.
  - **Pin Atterraggio**: `⏚ [Nome] [Quota]m` con manica a vento orientata in tempo reale.
- Vincolo di centratura ed inquadratura (`fitBounds`): ancorato rigorosamente alle sole coordinate autentiche di decollo e atterraggio `[takeoffCoord, landingCoord]`.
- Aggiornato `updateFlightProcedures()` per aggiornare unicamente la rotazione e deformazione delle maniche a vento in-place al cambio ora.

### 2.2 Overhaul Ergonomico dello Scrubber Touch (`ui/views/ForecastView.js` e `css/theme.css`)
- **Risoluzione Polimorfica della Timeline (`findActiveTimelineStrip(target)`)**:
  - Risolve dinamicamente sia il contenitore principale (`#forecast-timeline-strip`) sia la timeline nel cassetto overlay (`#flight-analysis-timeline-strip`) o l'antenato più vicino `.gm-timeline-grid-13`.
- **Normalizzazione Coordinate Touch (`getClientX(evt)`)**:
  - Estrae deterministicamente la coordinata orizzontale corretta sia per `PointerEvent` (`evt.clientX`), sia per `TouchEvent` (`evt.touches[0].clientX` / `evt.changedTouches[0].clientX`), sia per `MouseEvent`.
- **Aggancio Globale Window durante lo Scorrimento**:
  - Al `pointerdown` / `touchstart`, vengono agganciati listener pass-through `window.addEventListener('pointermove' / 'touchmove')` con `{ passive: false }` per catturare lo slide anche se il dito si allontana dal rettangolo della strip, invocando `evt.preventDefault()` per sopprimere lo scroll della pagina.
- **Dichiarazione CSS**:
  - Aggiunto `touch-action: none;` a `.gm-flight-analysis-scrubber`.

---

## 3. Verifica e Governance

- Aggiunto subtest 44 in `tests/ui/forecastView.test.mjs` che valida:
  - Normalizzazione di `clientX` su `PointerEvent`, `TouchEvent` e `MouseEvent`.
  - Attivazione e trascinamento touch da 14:00 a 16:00 su strip overlay con ricalcolo orario istantaneo.
  - Rilascio pulito dello scrubbing (`isScrubbing: false`) e cleanup dei listener.
- Esecuzione completa di tutti i 438 test in 61 suite: **100% superati senza regressioni**.
