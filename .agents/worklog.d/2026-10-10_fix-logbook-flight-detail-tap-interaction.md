# Scheda Intervento: Risoluzione Tap Card Volo, Fallback a Tre Livelli e Test Headless Dettaglio Volo

- **Data**: 2026-10-10
- **Autore**: Alessandro Amè & Pair Programmer
- **Tipo**: Bug Fix / Resilienza UI / Accessibilità WCAG / Test Headless
- **Stato**: Completato

---

## 1. Contesto & Diagnosi

L'utente ha segnalato l'impossibilità di aprire la schermata di dettaglio e debriefing toccando una card di volo nel Libretto (`LogbookView`):
*"Ho tappato di un volo ma non ha aperto il dettaglio fai un test headless"*

### Causa Radice:
1. **Mancanza di Fallback su Voli Seed/Cache**: Nella funzione `openFlightDetailView(flightId)` di `ui/views/FlightDetailSheet.js`, la query al database `await logbookManager.getFlightDetail(flightId)` restituiva `null` per i voli dimostrativi di seed iniziali (`fl-1` Monte Cornizzolo, `fl-2` Bassano, ecc.) o per i voli presenti esclusivamente nello store prima dell'importazione della traccia IGC in IndexedDB. La funzione stampava `[FlightDetailView] Volo non trovato: fl-1` ed usciva silenziosamente senza aprire l'overlay.
2. **Normalizzazione ID e Propagazione Store**: In `LogbookView.js`, `renderFlightCard` non considerava `flight.flightId`, e la chiamata a `openFlightDetailSheet` non propagava l'istanza `this.store`, causando il mancato allineamento di `activeReplayFlightId` al tap su "Visualizza Replay 3D".
3. **Mancanza Gestore Tastiera WCAG 2.1 AA**: `article[tabindex="0"]` non disponeva di listener per i tasti `Enter` e `Space` per attivare `handleOpenFlightDetail`.
4. **Intercettazione Eventi Puntatore**: I container interni SVG (`.gm-flight-sparkline-wrap`, `.gm-flight-metrics-row`, ecc.) erano privi di `pointer-events: none`, con rischio di assorbire il click in alcuni motori mobile.

---

## 2. Azioni Eseguite

1. **Fallback a Tre Livelli & Sintesi Altimetrica (`ui/views/FlightDetailSheet.js`)**:
   - Implementata la catena gerarchica di risoluzione: `IndexedDB` $\to$ `store.getState().flights` $\to$ `DEFAULT_SEED_FLIGHTS`.
   - Introdotta la sintesi dinamica dei punti altimetrici (`decimatedPoints`) e della telemetria termica quando assenti, consentendo il rendering affidabile del profilo altimetrico SVG, del debriefing dell'Istruttore Guido e delle note personali anche per i voli seed.
   - Propagazione deterministica di `targetStore` (`options.store || store`) al gestore della CTA Replay 3D.

2. **Accessibilità ed Event Delegation (`ui/views/LogbookView.js`)**:
   - Aggiunto `handleKeyDown(e)` per supportare l'apertura tramite tasti `Enter` e `Space` su elementi con `data-action="open-flight-detail"`.
   - Normalizzato l'identificatore in `renderFlightCard`: `const flightId = flight.id || flight.flightId || '';`.
   - Passaggio esplicito di `{ store: this.store }` a `openFlightDetailSheet`.

3. **Ottimizzazione CSS Pointer Events (`css/theme.css`)**:
   - Aggiunto `touch-action: pan-y; cursor: pointer;` su `.gm-flight-card.gm-flight-card-compact`.
   - Assegnato `pointer-events: none` sui discendenti interni decorativi (`.gm-flight-sparkline-wrap`, `.gm-flight-metrics-row`, `.gm-flight-card-sub`, `.gm-flight-title-group`).
   - Mantenuto `pointer-events: auto` e `stopPropagation` sul pulsante di eliminazione `.gm-flight-delete-btn`.

4. **Suite di Test Headless d'Integrazione (`tests/ui/logbookFlightDetailInteraction.test.mjs`)**:
   - Creato test headless completo in Node.js puro che valida:
     1. Rendering corretto dei dati e attributi card dal seed.
     2. Tap diretto sulla card di volo (`fl-1`) con montaggio di `#flight-detail-overlay` in `document.body` e blocco dello scroll (`overflow: hidden`).
     3. Tap su child elements interni con bubbling a `closest('[data-action]')`.
     4. Isolamento del pulsante eliminazione (apre il banner undo, non il dettaglio).
     5. Accessibilità tastiera con tasti `Enter` e `Space`.
     6. Chiusura e ripristino dello scroll al tap sul pulsante `← Libretto`.
     7. Chiusura al tasto `Escape`.
     8. Navigazione a Replay 3D con aggiornamento reattivo dello store e dell'hash URL.
     9. Apertura di traccia salvata direttamente in IndexedDB.

---

## 3. Risultati della Verifica

- **Test Suite Dedicata**: 9/9 passati in `tests/ui/logbookFlightDetailInteraction.test.mjs`.
- **Test Suite Globale**: 628/628 test passati su 107 suite (`npm test`). Zero regressioni.
- **Registrata Lezione #112 in MEMORY.md**: Vincolo di resilienza e fallback a tre livelli per le viste di dettaglio.
