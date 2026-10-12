# Worklog Fragment: Mini Mappa 2D Dettaglio Volo - Sincronizzazione Cursore Proporzionale, Zoom Centrato su Fase e Trim Visivo Bidirezionale

- **Data**: 2026-10-12
- **Ambito**: `ui/views/FlightDetailSheet.js`, `ui/map/mapEngineAdapter.js`, `css/theme.css`, `tests/ui/flightDetailSheet.test.mjs`
- **Tipo**: Bugfix / Telemetria / Ergonomia UX / Cartografia 2D

---

## Contesto e Problema Riscontrato
In seguito all'integrazione della mini mappa 2D all'interno della vista di dettaglio del volo (`FlightDetailSheet.js`):
1. **Compressione Orizzontale del Cursore sulla Mappa**: Durante lo scrubbing orizzontale sul grafico altimetrico fino all'estrema destra (punto di atterraggio finale), il cursore della posizione geografica sulla mappa si arrestava poco oltre la metà della traccia invece di raggiungere la fine. Causa: divergenza tra la cardinalità dei punti dell'SVG del grafico (campionati a frequenza costante o decimati) e la cardinalità dei punti caricati nel motore cartografico Leaflet (`validTrackPoints`), con mappatura basata su indici interi assoluti non normalizzati.
2. **Mancato Zoom sulla Fase Selezionata**: Toccando una scheda di fase di volo (es. termica, sondaggio 360°, manovra dinamica), la mappa non eseguiva l'ingrandimento né la centratura sul segmento di volo relativo. Causa: `highlightFlightTrackRange` in `LeafletMapEngine` si aspettava un singolo argomento a oggetto (`{ startIndex, endIndex }`), mentre il chiamante passava argomenti posizionali separati (`startIndex, endIndex, options`), provocando un'uscita anticipata silenziosa (`typeof range.startIndex !== 'number'`).
3. **Richiesta Trim della Traccia sulla Fase di Volo**: Esigenza di isolare visivamente e geometricamente la porzione di volo selezionata sia sul grafico altimetrico che sulla cartografia (focalizzazione/trimming simmetrico).

---

## Interventi Eseguiti

1. **Riconciliazione Proporzionale del Cursore Cartografico (`mapEngineAdapter.js`)**:
   - Aggiornato `LeafletMapEngine.setFlightTrackCursor(index, totalCount, timeSeconds)` e l'equivalente headless:
     - Priorità temporale: corrispondenza esatta sul timestamp assoluto `timeSeconds` ove presente nei punti della traccia.
     - Fallback proporzionale garantito: calcolo della frazione continua $\text{frac} = \frac{\text{index}}{\text{totalCount} - 1} \in [0.0, 1.0]$ e mappatura su $\text{targetIdx} = \text{round}(\text{frac} \cdot (N_{\text{map}} - 1))$. In questo modo, l'estremo sinistro del grafico ($0\%$) coincide tassativamente con il decollo e l'estremo destro ($100\%$) con l'atterraggio, azzerando qualsiasi compressione o troncamento orizzontale.
   - Aggiornati i listener di trascinamento e tocco (`pointerdown`, `pointermove`) in `FlightDetailSheet.js` per passare `idx, points.length, pt?.timeSeconds`.

2. **Flessibilità di Firma e Centratura Spaziale (`highlightFlightTrackRange`)**:
   - Normalizzata la firma di `highlightFlightTrackRange` per accettare indistintamente sia un singolo oggetto configurazione sia argomenti posizionali separati `(startIndex, endIndex, options)`.
   - Selettore dei punti di fase con calcolo bounding box geografico (`window.L.latLngBounds`) ed esecuzione automatica di `this.map.fitBounds(phaseBounds, { padding: [35, 35], maxZoom: 17, animate: true })`.

3. **Trim Visivo Bidirezionale Mappa + Grafico**:
   - **Sulla Mappa**:
     - I segmenti esterni alla fase selezionata vengono attenuati (`opacity: 0.15, weight: 1.5`).
     - Il segmento della fase selezionata viene esaltato (`opacity: 1.0, weight: 5`) con un alone ciano luminoso semitrasparente (`#38bdf8`, spessore 7px, opacità 0.6).
     - Visualizzazione del pin d'ingresso fase (`.gm-flight-phase-map-pin`) con denominazione e del pin circolare di uscita fase (`.gm-flight-phase-exit-pin`).
     - Al reset della fase ("Mostra Tutto" o chiusura), la mappa ripristina la traccia a piena visibilità e riesegue il fit sui bounds completi del volo.
   - **Sul Grafico Altimetrico**:
     - All'attivazione di una fase, calcolo della frazione d'estensione e focalizzazione automatica della finestra di zoom (`state.zoom` scalato in base alla durata della fase) e centratura del pan (`state.pan`), accompagnato dal badge "Mostra Tutto" per il ripristino a 1.0x.

4. **Suite di Test Automatizzata**:
   - Integrato test in `tests/ui/flightDetailSheet.test.mjs`: `should test LeafletMapEngine proportional cursor reaching 100% of flight track without compression`.
   - Validazione al 100% dell'intera suite di test del repository (`npm test`: 700 test eseguiti, 699 passati, 0 falliti, 1 skipped).

---

## Esito Tecnico
- Cursore telemetrico privo di compressione, con corrispondenza 1:1 tra coordinate del grafico e coordinate geografiche sulla mappa da 0% a 100%.
- Zoom e trim su fase di volo fluido ed ergonomico, con immediato ripristino della traccia complessiva tramite pulsante "Mostra Tutto".
