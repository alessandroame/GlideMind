# Scheda Intervento: Implementazione Mappa Comprensori & Volabilità con 6 Miglioramenti Architetturali (Fase 5 - SpotMapView.js)

- **Data**: 2026-10-10
- **Modulo**: `ui/views/SpotMapView.js`, `ui/map/mapEngineAdapter.js`, `core/mapDataPartition.js`, `core/geoSpatialMath.js`, `core/comprensorio.js`, `css/theme.css`, `index.html`, `ui/app.js`
- **Oggetto**: Completamento integrale della Fase 5 della roadmap di GlideMind. Implementazione del visualizzatore cartografico interattivo 2D basato su Leaflet con Headless Map Adapter (`IMapEngine`) per test deterministici in Node.js a 0ms, integrando 6 miglioramenti di ergonomia e aerologia: progressive scaling a 3 livelli (dot 14px -> aureole 8-10km -> vettori micro), pulsante 1-tap 'Top Spot' focus, campionamento del vento a quota decollo reale, cono di planata con correzione per componente di vento lungo la rotta, controlli flottanti non bloccanti con touch-action pan-x e switch reattivo tile per dual theme engine.

---

## 1. Contesto & Diagnosi

L'analisi e rianalisi di Fase 5 ha evidenziato l'opportunità di valorizzare i contratti e le lezioni apprese nelle fasi precedenti:
1. **Rifiuto dell'Over-Engineering WebGL per la Consultazione 2D Pre-Volo**: L'adozione di MapLibre GL 3D su una vista mobile di pianificazione meteo avrebbe comportato ~1 MB di bundle aggiuntivo, consumo intensivo di GPU sotto il sole e complessità estrema di mock nei test headless. Leaflet 2D snello (~150 KB) garantisce rendering immediato a 60 FPS e isolamento completo.
2. **Prevenzione Errori HTTP 414 / HTTP 429**: L'interrogazione simultanea di 134 comprensori generava URL oltre 4.000 caratteri. Con il partizionamento a macro-regioni (max 25-30 comprensori focali) e la cache entity-centric in RAM (TTL 30 min), la richiesta batch Open-Meteo rispetta le quote ed esegue lo scrubbing orario istantaneamente in RAM (<15ms).
3. **Sovraffollamento a Zoom Macro (Cluttering)**: Il tracciamento indiscriminato di cerchi da 8-10 km a zoom 5-7 creava sovrapposizioni illeggibili in aree dense (es. Canavese o Lago di Garda).
4. **Disallineamento Fisico Vento di Superficie vs Quota Decollo**: Esporre il vento a 10m AGL travisava le reali condizioni di cresta (es. 25 km/h a 1.500m slm con brezza debole a fondovalle).

---

## 2. Decisioni Architetturali (ADR)

1. **Headless Map Adapter Pattern (`IMapEngine`) in `ui/map/mapEngineAdapter.js`**:
   - Disaccoppia la vista dalla libreria cartografica: `LeafletMapEngine` per il browser DOM, `HeadlessMockMapEngine` per i test Node.js.
   - Zero polyfill JSDOM/WebGL nei test.
2. **Progressive Marker Scaling a 3 Livelli**:
   - *Zoom < 7.5 (Macro)*: Pillole semantiche compatte (dot 14px a 4 colori con nome spot).
   - *Zoom 7.5 - 8.9 (Medio)*: Aureole semitrasparenti di bacino aerologico (raggio 8-10 km) con badge di quota al centro.
   - *Zoom >= 9.0 (Micro)*: Vettori ad alta fedeltà con cono azimutale di decollo, freccia del vento reale calcolata a quota decollo (`XX km/h DIR (quota slm)`), marker atterraggio sicuro e linea geodetica tratteggiata colorata in base all'efficienza di planata con vento.
3. **Pulsante 1-Tap "Top Spot" (Glanceability & Hick's Law)**:
   - Nell'header della mappa, una pillola flottante `[ 🟢 Top Spot: Nome (HH:00) 🎯 ]` individua deterministicamente lo spot con la volabilità migliore (minima severità, massimo score) all'ora selezionata.
   - Con un singolo tap, esegue `flyTo` animato e apre la scheda di sintesi (`SheetManager`).
4. **Cono di Planata Corretto per Vento (`core/geoSpatialMath.js`)**:
   - `calculateWindCorrectedGlideRatio`: calcola la velocità al suolo $v_{\text{ground}} = \max(5, v_{\text{trim}} - v_{\text{headwind}})$ e rettifica l'efficienza richiesta sul terreno ($E_{\text{richiesta\_vento}} = E_{\text{still}} \cdot \frac{v_{\text{trim}}}{v_{\text{ground}}}$).
   - Segnala graficamente rientri critici o impossibili in caso di forte vento contrario.
5. **Ergonomia Outdoor e Gestione Gesture (`theme.css`)**:
   - Mappa a schermo intero con layer UI flottanti a `pointer-events: none` e controlli interni a `pointer-events: auto`.
   - Scrubber orario (09:00 - 18:00) dockato sopra la bottom bar con clearance $\ge 24\text{px}$ e `touch-action: pan-x`.
   - Touch targets $\ge 48\times 48\text{px}$.
6. **Switch Reattivo Layer Cartografico per Dual Theme Engine**:
   - Passaggio trasparente tra `CartoDB Dark Matter` (tema scuro) e `CartoDB Positron` (Sunlight Light Mode) al variare di `store.ui.theme`.

---

## 3. Impatto sui File di Progetto

- `core/geoSpatialMath.js`: Aggiunto `calculateWindCorrectedGlideRatio` e alias `calculateBearing = computeBearing`.
- `core/comprensorio.js`: Supporto opzionale di parametri vento in `calculateGlideToLanding`.
- `core/mapDataPartition.js`: Modulo headless per macro-regioni (Nord-Ovest, Nord-Est, Centro, Sud/Isole), filtri di raggio e calcolo spot mancanti.
- `ui/map/mapEngineAdapter.js`: Interfaccia `IMapEngine`, `LeafletMapEngine` e `HeadlessMockMapEngine`.
- `ui/views/SpotMapView.js`: Controller della vista mappa con scrubber orario, top spot focus e drawer contestuale.
- `ui/app.js`: Registrata rotta `map` nel router e idratazione catalogo in `loadLocationsCatalog`.
- `css/theme.css`: Stili per mappa, top bar, scrubber dockato e marker semantici con supporto Sunlight Mode.
- `index.html`: Inclusi script e foglio di stile Leaflet 1.9.4 mantenendo il file a 133 righe (< 200).
- `tests/core/mapDataPartition.test.mjs`: Test unitari per partizionamento geografico e differenze insiemistiche.
- `tests/ui/spotMapView.test.mjs`: Test di ciclo di vita, progressive scaling e sincronizzazione store.
- `DESIDERATA.md`: Fase 5 promossa a `🟢 Completato`.

---

## 4. Verifica di Conformità

- **Test Suite**: 377 test superati su 377 in 51 suite (`npm test`), con zero fallimenti.
- **Isolamento Headless**: La suite viene eseguita interamente in Node.js puro senza JSDOM né errori di WebGL/Canvas.
- **Ergonomia e Shift-Left**: Verificato il rispetto dei 5 Gate di Qualità Shift-Left.
