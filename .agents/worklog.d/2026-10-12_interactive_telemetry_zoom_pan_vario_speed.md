# Worklog: Navigazione Telemetrica Multi-Canale (Zoom, Pan, Variometro, Velocità al Suolo) e Cockpit HUD

- **Data**: 2026-10-12
- **Ambito**: `ui/views/FlightDetailSheet.js`, `css/theme.css`, `tests/ui/flightDetailSheet.test.mjs`
- **Autore**: Antigravity Assistant

---

## 1. Contesto e Requisiti Utente

L'utente ha richiesto:
> "voglio poter zoommare e navigare il grafico e volio poter vedere anche il vario e la velocita al suolo"

Requisiti implementativi:
1. **Navigazione & Zoom**: possibilità di ingrandire il tracciato (fino a 6x) e navigare/trascinare la finestra visibile lungo l'intera traccia temporale, con un indicatore panoramico (navigator scrub bar) che mostri la posizione della finestra visibile sul volo completo.
2. **Multi-Canale Telemetrico**: possibilità di attivare o disattivare in sovrimpressione:
   - Polilinea della Quota (con gradiente dinamico variometrico).
   - Curva del Variometro in m/s (con asse centrale 0 m/s e linea tratteggiata verde smeraldo `#10b981`).
   - Curva della Velocità al suolo in km/h (scala 0-70 km/h, linea tratteggiata viola chiaro `#c084fc`).
3. **Ispezione Istantanea (Cockpit HUD)**: cruscotto digitale compatto che riporti in tempo reale tempo di volo, quota MSL, variometro (con codifica semantica a 5 colori), velocità orizzontale e l'eventuale evento di volo attivo (Termica T1..Tn con guadagno, Inversione di Rollio con numero di pendolate, oppure Sondaggio 360°).
4. **Isolamento Gestuale Mobile**: salvaguardia dello scorrimento verticale naturale della scheda volo (`touch-action: pan-y`), impedendo il trapping dello scroll su smartphone.

---

## 2. Decisioni Architetturali e Interventi Eseguiti

1. **Estensione di `generateExpandedSvgChart`**:
   - Parametrizzata per supportare `options.zoom` (1x..8x), `options.pan` (0..1), `options.showAlt`, `options.showVario`, `options.showSpeed`, `options.cursorIndex`.
   - Calcolo coerente dei limiti altimetrici globali del volo per garantire stabilità visiva durante il panning (la scala delle quote non salta su e giù).
   - Filtraggio e proiezione geometrica selettiva di termiche, inversioni di rollio e test 360° che intersecano la finestra visibile.
   - Livello variometro opzionale: asse simmetrico a $0\text{ m/s}$, polilinea `#10b981`.
   - Livello velocità al suolo opzionale: asse $0-70\text{ km/h}$, polilinea `#c084fc`.
   - Cursore a croce (`#gm-chart-cursor-group`) con linea verticale tratteggiata e dot luminoso sul punto ispezionato.

2. **Cruscotto di Ispezione (Cockpit HUD) & Barra Strumenti Telemetria**:
   - Inserita la toolbar `.gm-telemetry-toolbar` sopra al grafico con pulsanti toggle per `Quota`, `Vario (m/s)`, `Velocità (km/h)` e gruppo zoom (`−`, `1.0x`, `+`, `1x`).
   - Inserito l'HUD `.gm-telemetry-hud` con metriche istantanee: Tempo, Quota MSL, Vario, Velocità, Evento.
   - Inserita la barra di navigazione panoramica `.gm-telemetry-navigator` con maniglia `.gm-telemetry-nav-handle` sotto al grafico, visibile quando lo zoom è $> 1.0x$.

3. **Controller Interattivo `attachInteractiveFlightChart`**:
   - Gestione sincrona ultra-rapida (<16ms, Doherty Threshold): l'ispezione via tocco o passaggio del mouse muove il cursore direttamente nel DOM SVG e aggiorna le label dell'HUD senza re-istanziare la stringa SVG completa a 60 FPS.
   - Panning orizzontale continuo su touch/pointer drag quando lo zoom è attivo, preservando `touch-action: pan-y` per lo scroll verticale della scheda.
   - Scrubbing diretto sulla barra panoramica con click o trascinamento della maniglia.

---

## 3. Risultati della Verifica

- **Suite Test Automatizzati**: 681 superati, 0 falliti, 1 ignorato su 682 test complessivi (`npm test`).
- **Test Unitari Dettaglio Volo**: 30/30 superati in 119ms (`node --test tests/flightDetailView.test.js tests/ui/flightDetailSheet.test.mjs`).
- **Verifica Conformità Shift-Left & Laws of UX**: Target touch $\ge 48\text{px}$, zero emoji decorative, contrasto WCAG AA, assenza di conflitti di scroll.
