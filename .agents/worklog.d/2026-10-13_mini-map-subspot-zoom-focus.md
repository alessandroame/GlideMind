# ADR: Puntamento Dinamico e Zoom Automatico della Mini-Mappa sullo Spot Selezionato

**Data**: 2026-10-13  
**Stato**: Accettato e Implementato  
**Contesto**: `ui/map/mapEngineAdapter.js`, `ui/views/ForecastView.js`, `tests/ui/forecastView.test.mjs`

---

## 1. Contesto e Problema Riscontrato
In precedenza, la mini-mappa cartografica di `ForecastView` (sia con motore `LeafletMapEngine` sia con `HeadlessMockMapEngine`) invocava incondizionatamente `fitBounds` sul binomio complessivo decollo + atterraggio con zoom generale (`maxZoom: 15`), indipendentemente dal fatto che l'utente si trovasse in vista panoramica (Overview) oppure avesse selezionato un decollo o un atterraggio specifico.
Quando il pilota seleziona un decollo (es. per analizzare il pendio di lancio e la manica a vento a monte) o un atterraggio (per esaminare il circuito e la brezza al suolo), la mini-mappa manteneva la vista macroscopica del comprensorio, non fornendo il necessario ingrandimento visivo sul sito di interesse. Inoltre, il click sui marker di decollo o atterraggio sulla mini-mappa forzava il ritorno a `'overview'` anziché selezionare il sub-spot toccato.

---

## 2. Decisioni Architetturali e Modifiche Implementate

### 2.1 Puntamento Mirato e Zoom Sub-Spot in `mapEngineAdapter.js`
- In `LeafletMapEngine.prototype.renderSpotMiniMap`:
  - Rilevati gli stati `isTakeoffSelected` e `isLandingSelected` confrontando `subSpotType` e `activeSubSpot.spotType`.
  - Estratte le coordinate precise dello spot selezionato (`spotData.activeSubSpot.coordinates` con fallback a `takeoff` o `landing`).
  - Se è selezionato un decollo (`isTakeoffSelected`): la mappa centra le coordinate del decollo e zooma a `15.5` (`setView([tCoord.lat, tCoord.lon], 15.5)`), evidenziando il settore a 70° e la manica a vento in quota.
  - Se è selezionato un atterraggio (`isLandingSelected`): la mappa centra le coordinate dell'atterraggio e zooma a `15.5` (`setView([lCoord.lat, lCoord.lon], 15.5)`), evidenziando il pin di atterraggio e la manica a vento in valle.
  - Se in Overview (`!isTakeoffSelected && !isLandingSelected`): viene eseguito `fitBounds` con safe padding `[35, 35]` per abbracciare l'intero comprensorio.
- In `HeadlessMockMapEngine.prototype.renderSpotMiniMap`:
  - Aggiunto il calcolo headless di `center`, `zoom` (15.5 per spot vs 13.5 per overview), `focusedSpot` (`'takeoff'`, `'landing'`, `'overview'`), `focusedCoordinates` e `isSubSpotFocused`.

### 2.2 Reattività del Tocco sui Marker della Mini-Mappa in `ForecastView.js`
- In `initMiniMap()`:
  - Aggiornata la callback `onSelectSubSpot(subSpotId)`: anziché resettare forzatamente a `selectedSubSpot = 'overview'`, imposta `this.selectedSubSpot = subSpotId || 'overview'` e invoca `this.render()`.
  - In questo modo, toccando il marker del decollo o dell'atterraggio sulla mini-mappa, la vista commuta sull'aerologia dedicata di quello spot e la mini-mappa effettua lo zoom sul punto selezionato.

---

## 3. Impatto e Verifica
- **Test Unitari**: Nuova suite `Mini-Map Sub-Spot Zoom & Center Contracts` in `tests/ui/forecastView.test.mjs` (78/78 test passati).
- **Test Suite Globale**: 762/762 test passati su 131 suite in Node.js nativo (`npm test`), 0 falliti.
- **Shift-Left Quality Gates**: Tutti i 5 Gate superati al 100%.
