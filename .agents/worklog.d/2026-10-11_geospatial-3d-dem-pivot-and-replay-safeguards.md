# Geodesia 3D & Replay WebGL: Compensazione del Perno Terreno DEM e Salvaguardie Mobile

**Data**: 2026-10-11  
**Autore**: GlideMind Agent  
**Ambito**: Geodesia 3D, WebGL CustomLayer, MapLibre v4, Three.js, Subagent Governance  

---

## 1. Contesto & Motivazione

Durante i test sul campo del Replay 3D dei voli su rilievi montuosi, è emersa un'anomalia geometrica evidente:
- La traiettoria di volo appariva disconnessa dallo scenario montuoso.
- Avanzando verso un pendio in salita la traccia sprofondava verso il suolo; avanzando verso fondovalle in discesa la traccia saliva fluttuando in aria.
- Durante rotazioni e panoramiche a 360°, la traccia oscillava vistosamente rispetto ai crinali.
- Su terreno pianeggiante o a quota costante, il fenomeno non si manifestava.
- La telecamera non variava quota autonoma (nessun ascensore/collision-avoidance: avanzando contro la roccia la telecamera entra dentro il suolo).

---

## 2. Diagnosi & Reverse Engineering di MapLibre GL JS v4.7.1

Scaricando e ispezionando il runtime compilato di `maplibre-gl.js` v4.7.1:

1. **Il Calcolo Matrici (`_calcMatrices()`)**:
   MapLibre colloca il perno focale della vista al centro dello schermo sulla quota del terreno DEM (`this.elevation`). Per farlo, applica una traslazione alla propria matrice di proiezione interna:
   ```javascript
   this.mercatorMatrix = e.scale([], s, [this.worldSize, this.worldSize, this.worldSize]);
   // ...
   e.translate(s, s, [0, 0, -this.elevation]);
   this.modelViewProjectionMatrix = s;
   ```
2. **L'Emissione del CustomLayer**:
   In `customLayer.render()`:
   ```javascript
   s.render(gl, this.transform.customLayerMatrix(), {
     farZ: this.transform.farZ,
     nearZ: this.transform.nearZ,
     fov: this.transform._fov,
     modelViewProjectionMatrix: this.transform.modelViewProjectionMatrix,
     projectionMatrix: this.transform.projectionMatrix
   });
   ```
   dove `customLayerMatrix()` restituisce `this.mercatorMatrix`, calcolata **prima** di applicare `-this.elevation`.
3. **Causa Radice del Disallineamento**:
   Il codice client in `MapLibreThreeEngine.js` utilizzava il secondo parametro `matrix` (`customLayerMatrix()`), proiettando la traiettoria Three.js con il perno focale a livello del mare ($0\text{ m}$), mentre MapLibre renderizzava le montagne con il perno a quota $H_{\text{center}}$. Al variare della quota sotto il centro dello schermo, i due frame divergevano verticalmente.

---

## 3. Decisioni & Persistenza delle Conoscenze

1. **Istruzione dell'Agente Specialista (`geospatial_3d_flight_auditor`)**:
   - Aggiornato [`.agents/agents/geospatial_3d_flight_auditor/agent.md`](file:///c:/github/GlideMind/.agents/agents/geospatial_3d_flight_auditor/agent.md) rimuovendo il divieto ambiguo su compensazioni del centro e prescrivendo:
     - Compensazione obbligatoria dell'elevazione del centro: $\Delta Z = (\text{alt}_{\text{effettiva}} - \text{map.transform.elevation}) \cdot \text{meterScale}$, o uso di `args.modelViewProjectionMatrix`.
     - `polygonOffset: true` sui materiali Three.js al decollo e atterraggio per prevenire lo Z-fighting con il DEM.
     - Protezione da pitch estremo ($>75^\circ$) verso l'orizzonte con fallback su Last Known Good Elevation.
     - Race condition DEM all'avvio: calcolo `terrainDelta` vincolato a `map.once('idle')`.
     - Gestione del ciclo di vita WebGL su mobile (`webglcontextlost` / `webglcontextrestored`).
     - Allocazioni zero nel render loop per preservare i 60 FPS.
2. **Aggiornamento Memoria di Progetto (`MEMORY.md`)**:
   - Registrata la **Lezione 116** con analisi del problema, causa radice su `customLayerMatrix()` e le 7 salvaguardie operative per i Replay 3D su mobile.
