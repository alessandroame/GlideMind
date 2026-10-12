# Worklog: Uniformazione Controlli Flottanti della Mini-Mappa del Volo (Parità con Previsioni)

**Data**: 2026-10-12  
**Autore**: Antigravity  
**Ambito**: UI / Ergonomia Cartografica (HMI), Mini-Mappa, Logbook Volo

---

## 1. Contesto & Diagnosi
In risposta alla richiesta dell'utente ("voglio sulla mini mappa del volo gli stessi controlli della mini mappa delle previsioni"):
- Nella mini-mappa delle previsioni (`ForecastView.js`), la card cartografica `.gm-mini-map-box` ospita direttamente al suo interno, flottanti sopra la cartografia:
  1. In alto a sinistra (`top: 8px; left: 8px`): il pulsante di cambio layer (`.gm-mini-map-layer-toggle`) con icona dinamica (Opzione 2: Globo orbitale per satellite / Mappa 3 pieghe per topo) e sfumatura radiale morbida.
  2. In alto a destra (`top: 8px; right: 8px`): il pulsante di espansione a schermo intero (`.gm-mini-map-expand-btn`) con icona a frecce diagonali opposte e medesima finitura a sfumatura radiale.
- Nella mini-mappa 2D del volo (`FlightDetailSheet.js`), il controllo layer era stato precedentemente confinato nella riga di intestazione esterna (`flex items-center gap-1.5`) accanto al titolo di sezione, mentre il pulsante di espansione della mappa era assente.

---

## 2. Modifiche Applicate

1. **Parità Strutturale del Container Mini-Mappa (`FlightDetailSheet.js`)**:
   - Assegnate al container `#flight-detail-map-container` le classi `.gm-mini-map-box.gm-flight-minimap-box` e l'attributo reattivo `data-map-layer="${activeLayer}"`.
   - Rimossi i controlli dall'intestazione esterna (dove resta solo il pulsante semantico "Mostra Tutto" quando una fase è selezionata).
   - Inseriti all'interno della scatola cartografica i due controlli canonici flottanti:
     - `#flight-detail-map-layer-toggle` (`.gm-mini-map-layer-toggle`, in alto a sinistra): commuta dinamicamente tra satellite e topo, aggiornando la mappa, lo store e l'attributo `data-map-layer` del container.
     - `#flight-detail-map-expand-btn` (`.gm-mini-map-expand-btn`, in alto a destra): apre direttamente la visualizzazione a tutto schermo del volo (Replay 3D volumetrico interattivo `#replay?flightId=...`).
2. **Elevazione Stacking Context su Leaflet (`css/theme.css`)**:
   - Aggiornato `z-index: 500` per `.gm-mini-map-layer-toggle` e `.gm-mini-map-expand-btn`, assicurando che entrambi i controlli galleggino in modo stabile al di sopra dei tile Leaflet (`z-index: 200`) e delle polilinee del tracciato (`z-index: 400`), evitando intercettazioni parassite di gesture.
   - Confermato il pavimento di tocco Fitts $\ge 48\times 48\text{px}$ tramite `::before` per l'uso all'aperto e con guanti.
3. **Automazione dei Test (`tests/ui/flightDetailSheet.test.mjs`)**:
   - Aggiunte asserzioni di markup per `.gm-mini-map-box`, `#flight-detail-map-expand-btn` e `.gm-mini-map-expand-btn`.
   - Aggiunto test di integrazione per verificare che il tocco sul pulsante di espansione della mini-mappa piloti correttamente la navigazione verso `#replay?flightId=...`.

---

## 3. Verifica e Governance
- Suite globale eseguita con successo: **124 suite, 711 test passati, 0 fallimenti, 1 saltato**.
- Tutti i quality gate architetturali Shift-Left verificati e superati.
