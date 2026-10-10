# Worklog: Risoluzione Aggiornamento Rotazione Manica a Vento e Direzione Vento nello Scrubber

- **Data**: 2026-10-10
- **Autore**: AI Assistant (Antigravity)
- **Ambito**: Cartografia, Mini Mappa Previsioni, Manica a Vento Vettoriale, Bug Fixing

---

## Contesto e Sintomo

Durante lo scorrimento continuo dello scrubber orario nella vista Previsioni (`ForecastView.js`), la manica a vento sulla mini-mappa rimaneva apparentemente immobile allo stesso angolo (180°), senza ruotare coerentemente con l'orientamento orario del vento previsto per le diverse ore della giornata.

---

## Causa Radice

1. **Disallineamento Proprietà `weatherSnapshot`**:
   - `core/comprensorio.js` produceva l'oggetto `weatherSnapshot` dichiarando la proprietà `windDir: Math.round(windDir)`, ma senza esporre `windDirection`.
   - Il metodo `updateWindsockMarker` e la funzione `renderSpotMiniMap` in `ui/map/mapEngineAdapter.js` leggevano esclusivamente `weatherSnapshot.windDirection ?? 0`.
   - Poiché `windDirection` risultava costantemente `undefined`, il valore `dir` ricadeva sempre sul fallback `0`.
   - Di conseguenza, la cinematica (`calculateWindsockKinematics`) calcolava sempre un angolo di rotazione invariante pari a `(0 + 180) % 360 = 180°`, bloccando visivamente la manica a vento a sud indipendentemente dall'ora selezionata.
   - Lo stesso difetto affliggeva il cono di decollo (`generateTakeoffSectorSvg`), che valutava l'allineamento assumendo sempre vento da Nord (0°), e i testi di testata di `ForecastView.js` (`renderSummaryCard`), che fallivano il controllo `weather.windDirection != null` omettendo l'angolo testuale.
2. **Aggiornamento Incompleto dei Segmenti SVG su Cambio Vento**:
   - `updateWindsockMarker` si limitava ad applicare `wrapper.style.transform = rotate(...)` e ad aggiornare il tag di stile dei keyframe, senza rigenerare il markup SVG interno dei segmenti (`generateWindsockSvg(..., { includeWrapper: false })`), impedendo l'allungamento o l'afflosciamento fisico della manica in caso di variazione di intensità del vento.

---

## Interventi Risolutivi

1. **Allineamento Proprietà nel Core Headless (`core/comprensorio.js`)**:
   - Esposta sia la chiave `windDir` che l'alias `windDirection` (insieme a `turbulence`) in `weatherSnapshot`, sia nello stato offline che nel payload valutato.
2. **Fallback Robusto e Re-render SVG nell'Adapter (`ui/map/mapEngineAdapter.js`)**:
   - Risoluzione della direzione con fallback bi-direzionale: `const dir = weatherSnapshot.windDirection ?? weatherSnapshot.windDir ?? 0;`.
   - In `updateWindsockMarker`, preservato il nodo `#miniws-wrapper` per consentire alla transizione CSS elastica (`transition: transform 0.4s`) di ruotare fluidamente la manica, iniettando contestualmente `wrapper.innerHTML = generateWindsockSvg(speed, gust, dir, turb, { includeWrapper: false })` per aggiornare lunghezze dei 12 segmenti e frequenza di sbandieramento.
   - Aggiornato l'angolo `dir` passato a `generateTakeoffSectorSvg` per allineare sincronicamente anche il settore di decollo (Verde/Ambra/Rosso).
   - Accettato l'argomento opzionale `takeoff` in `updateWindsockMarker` per aggiornare anche l'orientamento orografico in caso di selezione di sub-spot.
3. **Consolidamento dei Controller UI (`ui/views/ForecastView.js`)**:
   - Aggiornati i punti di lettura di `weather.windDirection ?? weather.windDir` in `renderSummaryCard`, `renderSpecificSpotMetrics`, `renderWindPanel` e nel generatore del briefing Guido.
   - Passato il decollo attivo a `this.miniMapEngine.updateWindsockMarker(evaluated.weatherSnapshot, ..., currentTakeoff)` in `setHour`.
4. **Verifiche Automatizzate**:
   - Aggiunto test di integrazione in `tests/ui/mapTakeoffSector.test.mjs` che valida la rotazione da `rotate(90deg)` a `rotate(0deg)`, l'aggiornamento del markup SVG e il cambio di colore del settore (da Rosso `#ef4444` a Verde `#22c55e`).
   - Rafforzate le asserzioni di `tests/ui/forecastView.test.mjs`.
   - Esecuzione `npm test`: **402/402 test superati** con zero regressioni.
