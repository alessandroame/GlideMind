# Intervento: Spessore Dinamico Zoom-Adattivo della Traccia 3D e Colorazione Cromatica Variometrica FAI

- **Data**: 2026-10-12
- **Ambito**: 3D Flight Replay (`ui/3d/MapLibreThreeEngine.js`, `core/flightReplayMath.js`)
- **Stato**: Completato (🟢)

---

## 1. Contesto & Diagnosi
Nel visualizzatore di replay 3D del volo (`MapLibreThreeEngine`), la traccia della traiettoria era estrusa con dimensioni metriche fisse arbitrarie (20 metri di larghezza e 14 metri di altezza) ed era colorata con una tinta unita Magenta Elettrico (`#ff007f`) con una spina dorsale Giallo Neon.
Quando la telecamera si avvicinava al parapendio (visuale 'chase' ravvicinata o visuale 'cockpit' a zoom 16-18), la traccia assumeva proporzioni sproporzionate (più del doppio dell'apertura alare di 10.5m), nascondendo la vela, il pilota e l'orografia. Inoltre, la tinta fissa impediva al pilota di cogliere visivamente le fasi di termica e di discesa lungo la traiettoria 3D. Anche le linee di caduta verso il terreno (drop curtain) avevano un colore rosa incoerente con il contesto variometrico.

---

## 2. Decisioni Architetturali & Implementazione

1. **Algoritmo di Dimensionamento Dinamico Zoom-Adattivo (`calculateRibbonDimensions`)**:
   - Creato modulo matematico puro headless in `core/flightReplayMath.js` (zero dipendenze DOM o Three.js).
   - Calcola la risoluzione orografica di Web Mercator:
     $$\text{metersPerPixel}(Z, \phi) = \frac{156543.03392 \times \cos(\phi)}{2^Z}$$
   - Mantiene uno spessore visivo costante a schermo di ~3.5 pixel:
     $$W_{\text{meters}} = \text{clamp}(1.0, 400.0, \text{metersPerPixel} \times 3.5)$$
     $$H_{\text{meters}} = W_{\text{meters}} \times 0.65$$
   - A zoom 18 (ravvicinato), la traccia si riduce a soli ~1.45m di larghezza (14% dell'apertura alare), apparendo come un nastro aerodinamico sottile e pulito.
   - A zoom 12 (panoramico), scala a ~93m nel mondo 3D, garantendo di non collassare mai a subpixel invisibili a schermo.

2. **Aggiornamento In-Flight a 60 FPS senza Allocazioni GPU**:
   - Pre-calcolati e memorizzati i normali orizzontali di prua in `_ribbonNormals` (`Float32Array(n * 2)`).
   - Nel ciclo di rendering di `MapLibreThreeEngine.js`, quando $|\Delta\text{zoom}| > 0.08$, viene invocato `_updateRibbonDimensions(zoom)`, che aggiorna direttamente in-place l'array di posizioni del `BufferGeometry` con `posAttr.needsUpdate = true` (<0.05ms di esecuzione, zero garbage collection).

3. **Colorazione Variometrica FAI Standard (`sampleVarioRgb`)**:
   - Assegnati vertice per vertice i coefficienti RGB FAI (`sampleVarioRgb(pt.vario)`):
     - Salita Forte ($\ge +3.0\text{ m/s}$): Rosso `#dc2626`
     - Salita Moderata ($+1.5\dots+3.0\text{ m/s}$): Arancione `#ea580c`
     - Salita Debole ($+0.2\dots+1.5\text{ m/s}$): Ambra `#f59e0b`
     - Planata ($-0.8\dots+0.2\text{ m/s}$): Verde Smeraldo `#10b981`
     - Discesa ($-2.0\dots-0.8\text{ m/s}$): Azzurro `#0284c7`
     - Discesa Forte ($\le -2.0\text{ m/s}$): Indaco `#4338ca`
   - Applicata la medesima sfumatura sia al prisma volumetrico a diamante, sia alla spina centrale `centerLineMesh`, sia alle linee di caduta verticali del `curtainMesh` (`opacity: 0.40`).

---

## 3. Verifica e Test
- Aggiunta suite di test unitari in `tests/core/flightReplayMath.test.mjs` per `calculateRibbonDimensions`.
- Aggiornato test di integrazione in `tests/ui/replayTakeoffLandingTrackVisibility.test.mjs` verificando la presenza dei colori variometrici FAI e la riduzione dinamica dello spessore al variare dello zoom.
- Esecuzione dell'intera test suite (`npm test`): 703 test passati con successo, zero fallimenti.
