# Piano Architetturale: Fase 7 - Visualizzatore 3D Traiettoria (FlightReplayView)

> **Documento di Progettazione Tecnica e Audit di Fase**  
> *Modulo*: `FlightReplayView` & Motore 3D (`ui/views/FlightReplayView.js`, `ui/3d/`, `core/flightReplayMath.js`)  
> *Riferimento Specifiche*: [MASTER_PLAN.md](file:///MASTER_PLAN.md), [.agents/rules/geodesy_webgl_3d_spec.md](file:///.agents/rules/geodesy_webgl_3d_spec.md), [MEMORY.md](file:///MEMORY.md) (Vincoli #89, #99)  
> *Data*: 2026-10-10  
> *Stato*: Pronto per Implementazione

---

## 1. Obiettivi e Ruolo Funzionale

La **Fase 7** dota GlideMind di un visualizzatore 3D immersivo e reattivo per l'analisi cinematica post-volo dei tracciati IGC.

La vista viene invocata prioritariamente dal pulsante **"Visualizza Replay 3D"** nella scheda di dettaglio volo ([ui/views/FlightDetailSheet.js](file:///ui/views/FlightDetailSheet.js)) o tramite la rotta `#replay`.

### Vincoli Architetturali Cardine (Anti-Regressione ParaMeteo)
1. **Divieto Assoluto di Monolite**:
   - In ParaMeteo `flightReplay3d.js` conteneva 6.326 righe di codice promiscuo.
   - In GlideMind il motore è decomposto in **6 moduli specializzati**, ciascuno rigorosamente $< 600$ righe.
2. **Disaccoppiamento Headless del Core Matematico (`core/flightReplayMath.js`)**:
   - Zero dipendenze da `window`, `document`, WebGL o Three.js. Testabile al 100% in Node.js puro (`node:test`).
3. **Disaccoppiamento della Telemetria 2D su Canvas 2D (60 FPS)**:
   - Profilo altimetrico interattivo, variometro con fasce FAI e scrubber temporale renderizzati su `<canvas>` 2D a doppio buffer autonomo.
   - Nessun frame-drop o blocco dell'interfaccia provocato dal carico della GPU 3D.
4. **Architettura ad Adapter a Doppio Motore (`IReplay3dEngine`)**:
   - **Primario**: MapLibre GL 3D (v4.7.1) + Three.js (r128) con DEM Terrarium RGB.
   - **Fallback**: CesiumJS (v1.119.0) WGS84 nativo o rendering cartesiano spaziale offline in assenza di rete DEM.
   - **Mock Headless**: `HeadlessReplayEngine` a latenza 0ms per i test automatici Node.js.
5. **Caricamento Asincrono On-Demand delle Librerie Esterne**:
   - Three.js e MapLibre GL **non** devono essere caricati staticamente in `index.html` per non rallentare l'avvio della Home (Doherty threshold < 400ms). Vengono caricati on-demand solo all'accesso alla rotta `#replay`.

---

## 2. Decomposizione dei Moduli

```
GlideMind 3D Replay Architecture
─────────────────────────────────────────────────────────────────────────────
PRESENTAZIONE (UI Shell)
┌───────────────────────────────────────────────────────────────────────────┐
│ ui/views/FlightReplayView.js (< 500 righe)                                │
│ - Lifecycle: mount(), unmount(), render()                                 │
│ - Controlli Touch >= 48px: Play/Pause, Velocità (1x..20x), Modi Camera    │
│ - Viewport 100dvh con back-link verso #logbook                            │
└───────────────────────────────────────────────────────────────────────────┘
                                   │
         ┌─────────────────────────┴─────────────────────────┐
         ▼                                                   ▼
┌─────────────────────────────────┐ ┌───────────────────────────────────────┐
│ ui/3d/ReplayTelemetryCanvas.js  │ │ ui/3d/IReplay3dEngine.js (Interface)   │
│ - Canvas 2D a 60 FPS            │ │ - init(container, options)            │
│ - HUD quota, Vz, velocità       │ │ - loadTrack(points, metadata)         │
│ - Fasce FAI colorate            │ │ - setProgress(t), setCamera(mode)     │
│ - Scrubber touch indipendente   │ │ - destroy(), on('contextlost', ...)   │
└─────────────────────────────────┘ └───────────────────────────────────────┘
                                                             │
                  ┌──────────────────────────────────────────┼───────────────────────────────────────┐
                  ▼                                          ▼                                       ▼
    ┌───────────────────────────┐              ┌───────────────────────────┐           ┌───────────────────────────┐
    │ MapLibreThreeEngine.js    │              │ CesiumReplayEngine.js     │           │ HeadlessReplayEngine.js   │
    │ - MapLibre GL 3D          │              │ - Coordinate WGS84 native │           │ - Test Node.js a 0ms      │
    │ - Three.js CustomLayer    │              │ - Fallback per GPU fragili│           │ - Nessun browser richiesto│
    │ - Terrarium DEM RGB       │              └───────────────────────────┘           └───────────────────────────┘
    └───────────────────────────┘
                  │
                  ▼
DOMINIO PURO HEADLESS (Core)
┌───────────────────────────────────────────────────────────────────────────┐
│ core/flightReplayMath.js (< 400 righe, 100% testabile Node.js)           │
│ - calculateCoordinatedBankAngle(turnRate, speed): rollio aerodinamico     │
│ - calculateKinematicPitchAngle(vz, speed): beccheggio dinamico            │
│ - interpolateTrackSample(p0, p1, factor): interpolazione Hermite/lineare  │
│ - calculateAvatarMinScale(camDist, vFov, vpHeight): scala avatar 3D       │
│ - projectTrackToThreeLocal(points, p0): single-shot origin alignment      │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Contratti Dati & Interfacce

### 3.1 Interfaccia Astratta `IReplay3dEngine`
```javascript
export class IReplay3dEngine {
  async init(canvasContainer, options = {}) { throw new Error('Not implemented'); }
  async loadTrack(points, options = {}) { throw new Error('Not implemented'); }
  seek(progressPercent) { throw new Error('Not implemented'); }
  setPlaybackSpeed(speedMultiplier) { throw new Error('Not implemented'); }
  setCameraMode(mode) { throw new Error('Not implemented'); } // 'chase' | 'cockpit' | 'free'
  setElevationOffset(deltaMeters) { throw new Error('Not implemented'); }
  play() { throw new Error('Not implemented'); }
  pause() { throw new Error('Not implemented'); }
  destroy() { throw new Error('Not implemented'); }
}
```

### 3.2 Stato Reattivo nello Store (`core/store.js`)
```javascript
// Aggiunta a defaultInitialState
activeReplayFlightId: null,
replay: {
  isPlaying: false,
  progress: 0,        // 0.0 -> 1.0
  currentTimeSec: 0,
  speed: 1,           // 1x, 2x, 5x, 10x, 20x
  cameraMode: 'chase' // 'chase' | 'cockpit' | 'free'
}
```

### 3.3 Routing (`ui/router.js`)
- Registrazione di `'replay'` nelle rotte ammesse (`VALID_ROUTES`).
- Montaggio condizionato del controller `FlightReplayView.js`.
- Rilevamento automatico dell'id del volo:
  1. Da parametro query hash: `#replay?flightId=fl_...`
  2. Da stato reattivo: `store.getState().activeReplayFlightId`
  3. Se assente: caricamento automatico dell'ultimo volo disponibile nel Logbook.

---

## 4. Risoluzione dei Punti di Rischio Identificati nell'Audit

| # | Rischio / Problema | Causa Radice | Risoluzione Architetturale |
| :-: | :--- | :--- | :--- |
| **1** | **Vicolo Cieco nel Router** | `ui/router.js` include solo i 5 tab di navigazione; `#replay` viene rigettato e reindirizzato alla Home. | Includere `'replay'` in `VALID_ROUTES` e registrare il controller dedicato nel router. |
| **2** | **Appesantimento Bundle / Splash Screen** | Importare Three.js, MapLibre e Cesium in `index.html` consuma banda e memoria al primo caricamento dell'app. | Caricatore asincrono on-demand (`core/scriptLoader.js`) attivato solo all'apertura della vista Replay. |
| **3** | **Perdita Contesto WebGL su Mobile** | Dispositivi mobili a bassa memoria rilasciano il contesto grafico (`webglcontextlost`) in background. | Listener su `webglcontextlost` e `webglcontextrestored` con degradazione fluida su griglia cartesiana vettoriale piana. |
| **4** | **Jank dello Scrubber 2D** | Legare il rendering della timeline altimetrica al frame-rate di Three.js provoca scatti durante il drag. | Canvas 2D a doppio buffer separato dal canvas WebGL, aggiornato istantaneamente a 60 FPS all'input del puntatore. |
| **5** | **Asset 3D Parapendio Mancante** | La directory `data/models/` non esiste ancora in GlideMind. | Creare `data/models/` con generatore o asset compatto `.glb` (glTF 2.0 Binary) e fallback procedurale Three.js. |
| **6** | **Discrepanza Altimetrica DEM vs WGS84** | Le quote GPS barometriche possono trovarsi sotto il livello delle mesh del terreno DEM. | Applicazione dell'offset rigido $\Delta H = H_{\text{DEM}}(P_0) - H_{\text{GPS}}(P_0)$ all'intera scena tramite `computeDemAltitudeOffset`. |

---

## 5. Sequenza Operativa di Implementazione (Roadmap Chirurgica)

1. **Step 1: Estensione Router & Store**:
   - Registrazione rotta `'replay'` in `ui/router.js` e aggiunta proprietà `activeReplayFlightId`, `replay` in `core/store.js`.
2. **Step 2: Core Headless Math (`core/flightReplayMath.js`)**:
   - Implementazione di rollio coordinato, pitch, interpolazione e proiezioni.
   - Suite di test automatizzati `tests/core/flightReplayMath.test.mjs` (100% passanti a 0ms).
3. **Step 3: Adapter Interfaccia & Headless Mock (`ui/3d/`)**:
   - Creazione di `IReplay3dEngine.js` e `HeadlessReplayEngine.js`.
4. **Step 4: Telemetria 2D su Canvas (`ui/3d/ReplayTelemetryCanvas.js`)**:
   - Profilo altimetrico interattivo con scrubbing touch e indicatore variometrico FAI.
5. **Step 5: Controller Vista (`ui/views/FlightReplayView.js`)**:
   - Layout outdoor `100dvh`, pulsanti di controllo Fitts $\ge 48\text{px}$, drawer telemetria e gestione ciclo di vita `mount()`/`unmount()`.
6. **Step 6: Implementazione Motore Primario (`ui/3d/MapLibreThreeEngine.js`)**:
   - Setup MapLibre GL 4.7.1, Three.js r128, Terrarium DEM RGB, nastro 3D della traccia e avatar parapendio.
7. **Step 7: Validazione Shift-Left & Pre-Delivery Gates**:
   - Verifica su browser headless, test dei touch target e contrasti WCAG.
