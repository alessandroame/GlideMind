# ADR: Selezione Fasi di Volo e Manovre tramite Puntamento Diretto su Grafico Altimetrico

## Contesto e Motivazione
Nel visualizzatore di dettaglio volo (`FlightDetailSheet.js`), la selezione di una fase di volo (termiche, manovre acrobatiche/dinamiche, inversioni di rollio con pendolate, sondaggi 360°) era possibile esclusivamente tramite il click sulle card informative collocate al di sotto del grafico. Toccando o puntando direttamente sul profilo altimetrico SVG, l'interazione falliva a causa dell'intercettazione dei pointer events da parte del layer d'area sottostante la quota (`<polygon points="..." fill="url(#...-area)">`) e dell'assenza di un resolved coordinate-based mapping sui segmenti di manovra.

## Modifiche Implementate
1. **Disattivazione Pointer Events su Layer Decorativo Area Quota**:
   - Assegnato `pointer-events="none"` al `<polygon points="..." fill="url(#...-area)">` in `generateExpandedSvgChart`.
2. **Risolutore di Fase Coordinate-Based (`findPhaseAtPoint`)**:
   - Mappa le coordinate client X su indice trackpoint tenendo conto di zoom e pan.
   - Individua manovre dinamiche (`dynamicManeuvers`), termiche (`thermals`), inversioni (`rollInversions`) e test 360° (`thermalProbes`) con tolleranza touch per micro-manovre ($\pm 2$ campioni).
3. **Disaccoppiamento Gesto Tap vs Dragging (Laws of UX & Fitts's Law)**:
   - Differenziazione tra trascinamento per pan orizzontale (>6px) e tap/click discreto (<6px, <500ms).
   - Invocazione automatica di `selectPhase(matched)` con sincronizzazione della mini-mappa 2D (`highlightFlightTrackRange`), ritaglio del grafico e attivazione badge con pulsante "Mostra Tutto".
   - Tocco su porzione neutra di planata esegue `clearPhaseSelection()`, ripristinando istantaneamente zoom/pan a 1.0x e centrando la mappa complessiva.
4. **Feedback Visivo all'Hover**:
   - Cursore `pointer` con tooltip indicativo `Tocca per selezionare [Manovra]` in corrispondenza delle fasce temporali di manovra.
   - Cursore `crosshair` sui tratti neutri di planata.
5. **Verifica Automatizzata**:
   - Aggiunto test end-to-end in `tests/ui/flightDetailSheet.test.mjs` che valida hover, tap su wingover (selezione + evidenziazione mappa), deselezione su planata neutra e neutralità dei gesti di drag (>6px).

## Impatto Architetturale e Compatibilità
- Piena conformità con Headless Core e Shift-Left Pre-Delivery Gates.
- Zero regressioni sulla suite di test (706 test eseguiti, 705 passati, 1 skipped).
