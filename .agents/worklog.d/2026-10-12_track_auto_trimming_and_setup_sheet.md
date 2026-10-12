# ADR: Trimming Automatico Traccia, Disaccoppiamento Setup Traccia e Calibrazione Quote

## Contesto e Motivazione
L'utente ha espresso due requisiti funzionali chiave:
1. **Trimming Automatico**: il taglio iniziale e finale della traccia (eliminazione della preparazione al suolo sul decollo e della sosta post-atterraggio) deve avvenire automaticamente al caricamento del volo senza richiedere l'interazione manuale del pilota.
2. **Disaccoppiamento della Vista Setup Traccia**: i controlli di trimming (slider di regolazione inizio/fine volo) non devono appesantire direttamente la vista principale di dettaglio volo (`FlightDetailSheet.js`). Viene richiesta una vista dedicata "Setup Traccia" che contenga sia la regolazione del trimming, sia la correzione e calibrazione altimetrica delle quote reali di decollo e atterraggio.

## Decisioni Architetturali

1. **Auto-Trimming Traccia nel Core (`core/flightTrimming.js`, `core/logbookDb.js`)**:
   - Creata la funzione `autoTrimFlight(bundle)`: rileva automaticamente i punti di transizione al suolo tramite `detectTrimPoints` e applica il trimming non-distruttivo se il volo non risulta già trimmato e non è stato esplicitamente resettato dal pilota.
   - **Safe Autonomy & Prevenzione Oscillazioni**: se il pilota decide di ripristinare la traccia integrale tramite "Ripristina Originale", viene impostato il flag `meta.isExplicitlyUntrimmed = true`. In questo modo, le chiamate successive di lettura o visualizzazione rispettano l'intenzione del pilota e non forzano un nuovo trimming indesiderato.
   - Integrato l'auto-trimming in `LogbookManager.getFlightDetail(flightId)`: all'accesso al dettaglio volo, se il tracciato presenta pre-decollo o post-atterraggio da tagliare, il bundle viene auto-trimmato e salvato in background nell'adapter.

2. **Motore di Calibrazione Quote Barometriche (`core/flightTrimming.js`, `core/logbookDb.js`)**:
   - `applyElevationCorrection(bundle, targetTakeoffAlt, targetLandingAlt, mode)`:
     - **Modalità Bi-Punto (`two_point`)**: interpola linearmente la correzione nel tempo fra decollo ($\Delta Z_{\text{takeoff}}$) e atterraggio ($\Delta Z_{\text{landing}}$), correggendo la deriva barometrica diurna/sinottica registrata dai barometri non calibrati o dal GPS.
     - **Modalità Offset Uniforme (`takeoff_offset`)**: applica una traslazione verticale uniforme calcolata sulla quota nota del decollo.
   - Preserva `raw.uncalibratedOriginalPoints` per garantire la reversibilità a costo zero (*Cheap Takeover*).
   - Ricalcola istantaneamente quota max MSL, guadagni, vario e sparkline; espone `meta.elevationCorrection`.
   - `restoreOriginalElevations(bundle)`: ripristina le quote grezze e rimuove i metadati di correzione.
   - Aggiunti i metodi `correctFlightElevations` e `resetFlightElevations` in `LogbookManager`.

3. **Vista Dedicata "Setup Traccia" (`ui/views/TrackSetupSheet.js`)**:
   - Componente modulare full-screen (`100dvh`, pan-y) disaccoppiato da `FlightDetailSheet.js`.
   - **Header**: pulsante Torna al Dettaglio (`#btn-track-setup-back`), titolo volo e data.
   - **Sezione 1 (Trimming)**: slider inizio/fine volo, anteprima punto e quota, pulsanti Rileva Automaticamente, Applica Trimming e Ripristina Originale.
   - **Sezione 2 (Calibrazione Quote)**: input numerici quota reale decollo e quota reale atterraggio (MSL), selettore radio modalità (Bi-Punto con deriva o Offset uniforme), pulsanti Applica Calibrazione e Ripristina Quote.
   - Ritorno fluido alla vista dettaglio volo al termine delle modifiche.

4. **Bonifica e Snellimento di `FlightDetailSheet.js`**:
   - Rimossa la sezione inline `#gm-flight-trimming-section` e i relativi listener dai corpi di scorrimento.
   - Inserito il pulsante compatto `#btn-open-track-setup` nella top-bar e il pulsante secondario `#btn-setup-from-detail` nella barra inferiore adesiva.
   - Aggiunti badge di stato ad alta visibilità nella testata: `Traccia Trimmata` (ambra) e `Quote Calibrate` (smeraldo).

## Conseguenze e Verifica
- La suite di regressione completa passa con 671 test su 117 suite al 100% verdi.
- Aggiunti test per `autoTrimFlight`, calibrazione quote bi-punto/offset e persistenza in `tests/core/flightTrimming.test.mjs`.
- Aggiornati i test di rendering in `tests/ui/flightDetailSheet.test.mjs`.
