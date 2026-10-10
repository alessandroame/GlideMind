# Parità Dati Cartografici: Settore di Esposizione Decollo e Linea di Planata in Vista Fullscreen

- **Data**: 2026-10-10
- **Autore**: Alessandro Amé
- **Ambito**: Cartografia Comprensorio, Mappa Fullscreen, Analisi Volo (`ui/map/mapEngineAdapter.js`, `ui/views/ForecastView.js`, `tests/ui/mapTakeoffSector.test.mjs`, `tests/ui/forecastView.test.mjs`)

---

## 1. Contesto e Requisito

Su richiesta dell'utente ("vorrei i dati della minimappa anche in quella fullscreen tipo l'esposizione del decollo etc"), è stata rilevata una discrepanza informativa tra:
1. **Mini-Mappa Contestuale** (`renderSpotMiniMap`): mostrava il settore di esposizione del decollo a 70° (`generateTakeoffSectorSvg`) con hub centrale quota, freccia azimutale del pendio, badge numerico dei gradi e colorazione reattiva all'allineamento del vento (verde in asse, ambra al traverso, rosso sottovento), la manica a vento orientata al decollo e la linea di planata geodesica tratteggiata con il codice colore di efficienza (`isSafe`, `severity`).
2. **Mappa Fullscreen di Analisi Volo** (`renderComprensorioFlightMap`): mostrava solo pin generici ed essenziali senza il settore di esposizione del decollo e priva della congiungente geodesica di planata tra decollo e atterraggio.

---

## 2. Modifiche Architetturali e Implementative

### 2.1 Adapter Cartografico (`ui/map/mapEngineAdapter.js`)
- **`LeafletMapEngine.renderComprensorioFlightMap`**:
  - Sostituito il pin rettangolare isolato con il settore di esposizione del decollo aeronautico (`generateTakeoffSectorSvg`, prefix `fl-to-sector-`), posizionato a `zIndexOffset: 450` con hub centrale quota `▲ [Quota]m` e freccia azimutale.
  - Aggiunta la polilinea geodesica di planata (`flightGlideLine`) con stile tratteggiato (`dashArray: '5, 7'`, peso 3px, opacità 0.9) tra le coordinate di decollo e atterraggio, colorata dinamicamente in base all'efficienza richiesta (`#16a34a` sicuro, `#ca8a04` cautela, `#dc2626` non volabile).
  - Ancorata la manica a vento al suolo sul centro del settore a `zIndexOffset: 650`.
- **`LeafletMapEngine.updateFlightProcedures`**:
  - Aggiunto l'aggiornamento reattivo in-place di `flightTakeoffSector` al variare della direzione e velocità oraria del vento dallo scrubber.
  - Aggiunto l'aggiornamento in-place del colore della linea di planata `flightGlideLine` al variare di `glideMetrics`.
- **`HeadlessMockMapEngine`**:
  - Tracciamento deterministico di `hasTakeoffSector`, `hasGlideLine`, `glideMetrics` e `lastFlightUpdateOptions` per l'esecuzione dei test in Node.js puro senza JSDOM.

### 2.2 Controller Vista (`ui/views/ForecastView.js`)
- In `openFlightAnalysisOverlay()`: iniettato `glideMetrics: evalData?.glideMetrics` nei payload di montaggio mappa per entrambi i rami (browser DOM e Node.js headless).
- In `updateFlightAnalysisOverlay()`: inoltrati `glideMetrics`, `takeoffWeather`, `takeoff` e `landing` in `updateFlightProcedures()`.

---

## 3. Verifica e Governance

- Suite `tests/ui/mapTakeoffSector.test.mjs`: aggiunti test specifici per la presenza del settore di decollo, della linea di planata e dei loro aggiornamenti dinamici su vento e indici di sicurezza.
- Suite `tests/ui/forecastView.test.mjs`: estese le asserzioni di apertura e scrubbing orario per verificare la persistenza dei dati aeronautici e la parità con la mini-mappa.
- Esecuzione completa: **448 test passati su 448 in 61 suite (100% pass)**.
