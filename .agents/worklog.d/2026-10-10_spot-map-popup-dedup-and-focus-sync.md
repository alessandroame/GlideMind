# Worklog: Risoluzione Fumetti Doppi e Sincronizzazione Focus Marker in Mappa

- **Data**: 2026-10-10
- **Autore**: Antigravity (Pair Programming con Utente)
- **Stato**: Completato
- **Componenti Impattati**: `ui/map/mapEngineAdapter.js`, `ui/views/SpotMapView.js`, `css/theme.css`, `tests/ui/spotMapView.test.mjs`, `MEMORY.md`

---

## 1. Contesto e Diagnosi dei Difetti

L'utente ha segnalato due anomalie visive e di sincronizzazione nello `SpotMapView`:
1. **Fumetti doppi**: All'apertura dello spot selezionato comparivano due etichette sovrapposte per lo stesso nome ("Monte Tamaro"): il popup nativo di Leaflet e un badge fluttuante integrato nel marker HTML.
2. **Desincronizzazione dello spot selezionato**: Cambiando spot dal menu a tendina o toccando un marker, a volte il fumetto si apriva sul nuovo spot ma l'alone/focus luminoso (.gm-map-dot-focused) restava bloccato sullo spot precedente (es. alone su Monte Lema con dropdown e popup su Monte Carza).

### Root Cause Analysis:
1. **Fumetti doppi**: In una precedente iterazione per migliorare il contrasto a zoom elevato, era stato iniettato un elemento `<span class="gm-map-focused-name-tag">` nel DOM del marker Leaflet, posizionato con `bottom: calc(100% + 7px)`. Con l'apertura del popup Leaflet `.gm-map-spot-popup`, la punta della bolla agganciata allo stesso marker provocava la collisione e sovrapposizione visiva di due etichette con il medesimo titolo.
2. **Desincronizzazione Focus**:
   - `handleSpotFocus(spot)` impostava `this.focusedSpotId = spotId` *prima* di notificare lo store reattivo (`store.setState({ selectedSpotId: spotId })`).
   - Il subscriber dello store in `SpotMapView` controllava `if (s.selectedSpotId !== this.focusedSpotId)`, che valutava `false` prevenendo l'aggiornamento.
   - Il listener del dropdown `#gm-map-spot-select` muoveva la vista (`flyTo`) e apriva il popup, ma non comunicava al motore cartografico (`mapEngine`) di trasferire la classe `.gm-map-dot-focused` tra i marker istanziati.
   - `updateScrubberBars` conteneva una guardia restrittiva `!spotEvaluation.comprensorio` che causava un'uscita silente quando passata un'istanza grezza di comprensorio.

---

## 2. Modifiche Apportate

### 2.1 `ui/map/mapEngineAdapter.js`
- **Rimozione Tag Fluttuante Ridondante**: Rimosso `<span class="gm-map-focused-name-tag">` dall'HTML del marker `createDivIcon`. Il popup Leaflet (`.gm-map-spot-popup`) costituisce ora l'unica sorgente di verità (Single Source of Truth) per il fumetto descrittivo.
- **Implementazione `setActiveSpotId(spotId)`**:
  - Aggiunto metodo sia a `LeafletMapEngine` che a `HeadlessMockMapEngine`.
  - In `LeafletMapEngine`, rimuove dinamicamente `.gm-map-dot-focused` dal marker precedente e la applica all'elemento DOM del marker selezionato in `this.markers.get(spotId)`, aggiornando raggio e peso nel caso di rendering su Canvas.
- **Sincronizzazione Bidirezionale degli Eventi Marker**:
  - `openSpotPopup(spotId)` invoca immediatamente `this.setActiveSpotId(spotId)`.
  - Negli hook `marker.on('click')` e `marker.on('popupopen')`, viene invocato `this.setActiveSpotId(spot.id)`, garantendo che qualsiasi interazione o apertura di fumetto allinei istantaneamente l'anello luminoso al marker corrispondente.

### 2.2 `ui/views/SpotMapView.js`
- In `handleSpotFocus(spotEval)`:
  - Notifica esplicitamente `this.mapEngine.setActiveSpotId(spotId)`.
  - Allinea l'etichetta `#gm-top-spot-name` e il selettore `#gm-map-spot-select`.
  - Se `spotEval` è un oggetto comprensorio puro senza valutazione meteorologica precalcolata, genera una valutazione on-the-fly (`evaluateComprensorio`) prima di inoltrarlo a `updateScrubberBars`.
- In `updateScrubberBars(spotEvaluation)`:
  - Tollerata l'ingestione sia di strutture valutate (`spotEvaluation.comprensorio`) sia di oggetti diretti (`spotEvaluation`), prevenendo no-op silenti.
- Nel listener del selettore a tendina `#gm-map-spot-select`:
  - Se il valore è vuoto, azzera `setActiveSpotId(null)`.
  - Alla selezione di uno spot, invoca `this.handleSpotFocus(spot)` *prima* del volo cartografico (`flyTo`) e dell'apertura del popup, garantendo consistenza tra tendina, store, marker e fumetto.

### 2.3 `css/theme.css`
- Rimosse le regole CSS `.gm-map-focused-name-tag` e `.gm-map-focused-name-tag::after` per azzerare il debito tecnico ed evitare collisioni visive.

### 2.4 `tests/ui/spotMapView.test.mjs`
- Aggiornate e ampliate le asserzioni di test per validare:
  - Assenza di tag fluttuanti `.gm-map-focused-name-tag` nel markup del marker.
  - Sincronizzazione di `engine.activeSpotId` su cambio di selezione da dropdown e su apertura popup.
  - Comportamento corretto dell'alone luminoso e dello scrubber orario.

---

## 3. Risultati della Verifica

- Esecuzione `node --test tests/ui/spotMapView.test.mjs`: 22 test passati su 22.
- Esecuzione `npm test`: 546 test passati su 546 (87 suite completate con 0 errori e 0 regressioni).
- Risolti entrambi i problemi: zero fumetti duplicati e sincronizzazione 1:1 deterministica del focus marker.
