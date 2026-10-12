# Intervento: Posizionamento Badge in Basso, Separazione Scrubber da Pan e Ripristino Colori Variometrici su Mappa Trimmata

- **Data**: 2026-10-12
- **Ambito**: UI / Interazione Grafico Altimetrico & Mini-Mappa Cartografica (`FlightDetailSheet.js`, `mapEngineAdapter.js`)
- **Autore**: Antigravity Assistant

---

## 1. Contesto & Diagnosi

L'utente ha riscontrato tre criticità visive e di interazione nella schermata di dettaglio volo:
1. **Posizione e Legibilità dei Tag Manovra/Termica**:
   - I badge numerici delle fasi di volo (`T1`, `1P`, `WO`, `Spirale`) erano posizionati nella parte superiore del grafico (`padTop + 9 + ev.yLevel * 13`), collidendo con la riga di riepilogo quote di testata e con la curva altimetrica. Inoltre, le dimensioni minime (12px altezza, font 8.5px) e il bordo sottile li rendevano scarsamente leggibili.
2. **Conflitto tra Scrubber e Pan sul Grafico**:
   - Toccando e trascinando orizzontalmente sul grafico con zoom attivo, il grafico eseguiva immediatamente il pan della finestra di visualizzazione anziché consentire lo scorrimento continuo dello scrubber per ispezionare i punti lungo la traiettoria.
3. **Cromatismi Incoerenti su Mappa Trimmata (Dominanza di Blu su Traccia Termica)**:
   - Nello screenshot fornito dall'utente, selezionando una fase di termica (salita positiva), la traccia sulla mini-mappa 2D risultava prevalentemente azzurra/blu anziché arancione/gialla.
   - **RCA**:
     a) In `LeafletMapEngine.highlightFlightTrackRange`, la selezione di una fase generava una polilinea di alone continua con `color: '#38bdf8'` (Sky Blue), `weight: 7` e `opacity: 0.6` aggiunta a `phaseHighlightGroup`. Poiché `phaseHighlightGroup` si trovava sopra `overlayLayerGroup`, la linea blu da 7px copriva interamente la traccia da 5px, mascherando i colori originali del variometro.
     b) In `FlightDetailSheet.js`, i `safePoints` passati a `renderFlightTrack` non includevano la proprietà `vario` precalcolata. La mappa ricalcolava quindi il variometro con differenza finita grezza a 2 punti senza media mobile, facendo oscillare i valori con il rumore GNSS su salti negativi (blu).

---

## 2. Decisioni & Soluzioni Ingegneristiche

1. **Posizionamento dei Badge in Basso con Alta Legibilità**:
   - I badge sono stati riposizionati alla base della banda sopra la linea di griglia orizzontale (`bottomY = height - padBottom`, `badgeY = bottomY - 3 - ev.yLevel * 18`).
   - Dimensioni del pill incrementate ad altezza `16px` e larghezza dinamica `Math.max(26, label.length * 8 + 10)`.
   - Tipografia resa in monospace bold da `10.5px` (font-weight: 800) con contrasto elevato:
     - Termiche: bordo e testo `#fbbf24` (ambra) su fondo scuro `rgba(15, 23, 42, 0.95)` con raggio `3.5px`.
     - Inversioni di rollio: bordo e testo `#fb923c` (arancio).
     - Manovre dinamiche: bordo `#c084fc` e testo `#e9d5ff` (viola chiaro ad alto contrasto).
2. **Macchina a Stati Gestuale: Scrubber su Pressione Breve vs Pan su Pressione Lunga**:
   - Su `pointerdown`: inizializzato un timer di pressione prolungata a 350ms (`longPressTimer`).
   - Se l'utente si sposta prima dello scadere dei 350ms (`deltaX > 6px`): il timer viene annullato e la gesture opera esclusivamente come **SCRUBBER**, aggiornando il cursore a mirino, i valori nell'HUD e il cursore sulla mini-mappa 2D, senza alterare `state.pan`.
   - Se l'utente mantiene premuto per $\ge 350\text{ms}$ prima di muoversi: si attiva la modalità **PAN**, che permette il trascinamento orizzontale della finestra di zoom (`state.pan = ...`).
   - Il tocco rapido (<350ms, movimento <6px) mantiene inalterata la selezione della manovra o il reset su spazio neutro.
3. **Ripristino dei Colori Variometrici Autentici sulla Mini-Mappa**:
   - Rimosso l'alone azzurro `#38bdf8` in `LeafletMapEngine.highlightFlightTrackRange`.
   - I segmenti della traccia corrispondenti alla fase attiva vengono portati in primo piano (`poly.bringToFront()`) con spessore `5.5px` e piena opacità `1.0`, preservando i colori originali FAI del variometro (rosso/arancio/giallo per salite, verde per planate).
   - I segmenti esterni alla fase vengono attenuati a `opacity: 0.15` e spessore `1.5px`.
   - Aggiunto il calcolo della media mobile a 3 punti del variometro in `renderFlightTrack` e il passaggio del `vario` precalcolato in `safePoints` da `FlightDetailSheet.js`.

---

## 3. Verifiche & Test Automatizzati

- Nuova suite di test in `tests/ui/flightDetailSheet.test.mjs`:
  1. Verifica del posizionamento dei badge in basso (`y >= 165` su altezza 210), altezza 16px, font 10.5px bold e colori dedicati.
  2. Verifica dello scrubbing a pressione breve (nessuna variazione di `state.pan`) e attivazione del pan solo su pressione prolungata $\ge 350\text{ms}$.
  3. Verifica della mappa trimmata con variometro positivo: polilinee attive con `weight: 5.5`, `opacity: 1.0`, `bringToFront()` e assenza di alone blu `#38bdf8`.
- Esecuzione completa: **709 test passati, 0 falliti**.
