# Piano Architetturale: Fase 7 - Visualizzatore 3D Traiettoria (FlightReplayView)

> **Documento di Progettazione Tecnica e Audit di Fase**  
> *Modulo*: `FlightReplayView` & Motore 3D (`ui/views/FlightReplayView.js`, `ui/3d/`, `core/flightReplayMath.js`)  
> *Riferimento Specifiche*: [MASTER_PLAN.md](file:///MASTER_PLAN.md), [.agents/rules/geodesy_webgl_3d_spec.md](file:///.agents/rules/geodesy_webgl_3d_spec.md), [MEMORY.md](file:///MEMORY.md) (Vincoli #89, #99)  
> *Data*: 2026-10-10  
> *Stato*: Approvato e Integrato con Contromisure Preventive

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
// Dichiarazione esplicita in defaultInitialState
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
Per preservare la conformità con la suite di test esistente sui 5 tab della barra di navigazione e ammettere contemporaneamente la rotta specialistica `#replay`:
```javascript
export const PRIMARY_NAV_ROUTES = Object.freeze(['home', 'forecast', 'map', 'logbook', 'settings']);
export const VALID_ROUTES = Object.freeze([...PRIMARY_NAV_ROUTES, 'replay']);
```
- Montaggio del controller `FlightReplayView.js`.
- Rilevamento automatico dell'id del volo:
  1. Da parametro query hash: `#replay?flightId=fl_...`
  2. Da stato reattivo: `store.getState().activeReplayFlightId`
  3. Se assente: caricamento automatico dell'ultimo volo disponibile nel Logbook (`logbookManager.getAllFlights()`).

---

## 4. Dettaglio delle Contromisure sui 6 Rischi Identificati

### 4.1 Rischio 1: Vicolo Cieco nel Router (Dead-End UX)
* **Criticità Rilevata**: In `ui/router.js`, `VALID_ROUTES` non conteneva `replay`. Cliccando su *"Visualizza Replay 3D"* in `FlightDetailSheet.js`, l'hash `#replay` veniva rigettato da `normalizeRoute()` e reindirizzato forzatamente alla Home (`home`).
* **Contromisura di Progetto**:
  - Estendere `VALID_ROUTES` includendo `'replay'`.
  - Mantenere la distinzione tra tab visibili nella barra di navigazione desktop/mobile (`PRIMARY_NAV_ROUTES`) e viste immersive a pieno schermo.
  - Implementare in `FlightReplayView.js` un pulsante di ritorno esplicito in alto a sinistra:
    ```html
    <button type="button" class="gm-btn gm-btn-ghost" data-action="exit-replay" aria-label="Torna al Logbook">
      ← Logbook
    </button>
    ```

### 4.2 Rischio 2: Appesantimento Bundle / Violazione Doherty Threshold (< 400ms)
* **Criticità Rilevata**: Three.js (r128 ~ 600 KB) e MapLibre GL (v4.7.1 ~ 800 KB) inseriti staticamente nel tag `<head>` di `index.html` rallenterebbero l'avvio della Home, degradando le prestazioni su connessioni mobili outdoor.
* **Contromisura di Progetto**:
  - Implementazione del caricatore asincrono `core/scriptLoader.js`:
    ```javascript
    const loadedScripts = new Set();
    export async function loadScriptOnce(src, globalCheckName) {
      if (globalCheckName && window[globalCheckName]) return window[globalCheckName];
      if (loadedScripts.has(src)) return;
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => { loadedScripts.add(src); resolve(); };
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
    ```
  - La funzione `mount()` di `FlightReplayView` invoca `load3dLibraries()` mostrando uno skeleton screen elegante; la Home e le altre viste rimangono a 0ms di overhead.

### 4.3 Rischio 3: Perdita di Contesto GPU (`webglcontextlost`) e Resilienza Mobile
* **Criticità Rilevata**: Nei dispositivi mobili il browser rilascia arbitrariamente il contesto WebGL quando l'applicazione va in secondo piano, provocando il freeze del canvas.
* **Contromisura di Progetto**:
  - Intercettazione esplicita degli eventi sul canvas WebGL:
    ```javascript
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault(); // Impedisce il freeze permanente del contesto
      this.isContextLost = true;
      this.pause();
      this.surfaceToast('Contesto grafico sospeso, ripristino in corso...');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.isContextLost = false;
      this.rebuildScene();
    });
    ```
  - In caso di mancato ripristino o assenza di connettività per le tile DEM Terrarium, attivazione immediata della modalità degradata su **griglia cartesiana vettoriale piana 3D**, preservando il tracciato e la telemetria senza crash.

### 4.4 Rischio 4: Jank dello Scrubber 2D (Decoupled 60 FPS Canvas)
* **Criticità Rilevata**: Sincronizzare lo scrub della timeline direttamente dentro il ciclo di rendering Three.js causa stuttering e cali di frame rate percepibili sul touch.
* **Contromisura di Progetto**:
  - Componente autonomo `ui/3d/ReplayTelemetryCanvas.js` che gestisce un proprio `<canvas>` 2D a doppio buffer.
  - La gestione degli eventi di puntatore (`pointerdown`, `pointermove`, `pointerup`) aggiorna direttamente la coordinata $X$ locale, disegna la linea verticale di tracking e ricalcola i badge numerici (quota, velocità, variometro) in $< 2\text{ms}$.
  - Il motore 3D riceve l'evento di seek disaccoppiato tramite `engine.seek(progressPercent)` senza bloccare l'interazione touch.

### 4.5 Rischio 5: Asset 3D Parapendio e Fallback Procedurale
* **Criticità Rilevata**: La directory `data/models/` non esiste in GlideMind. Se il file binario `data/models/paraglider.glb` manca o non è scaricabile offline, il replay fallirebbe.
* **Contromisura di Progetto**:
  - Creazione della cartella `data/models/`.
  - Implementazione in `ui/3d/models/paragliderModel.js` di una funzione a doppio livello:
    1. Tentativo di caricamento via `GLTFLoader` del modello `data/models/paraglider.glb`.
    2. In caso di errore o assenza, generazione istantanea di una mesh procedurale Three.js: profilo alare a cuspide estruso, fascio funi a linee semitrasparenti e box pilota sagomato conforme agli assi aeronautici (+X ala destra, +Y dorso, -Z prua).

### 4.6 Rischio 6: Interpolazione Cinematica a 60 FPS su Campioni LTTB
* **Criticità Rilevata**: I punti `decimatedPoints` memorizzati in `flights_raw` sono 1.500 campioni LTTB. Su un volo di 2 ore (7.200s), l'intervallo temporale tra i punti è di circa 4.8 secondi, provocando avanzamenti a scatti se non interpolati.
* **Contromisura di Progetto**:
  - Implementazione dell'interpolatore temporale Hermite / lineare in `core/flightReplayMath.js`:
    ```javascript
    export function interpolateTrackSample(pPrev, pNext, tFraction) {
      return {
        x: pPrev.x + (pNext.x - pPrev.x) * tFraction,
        y: pPrev.y + (pNext.y - pPrev.y) * tFraction,
        z: pPrev.z + (pNext.z - pPrev.z) * tFraction,
        alt: pPrev.alt + (pNext.alt - pPrev.alt) * tFraction,
        vario: pPrev.vario + (pNext.vario - pPrev.vario) * tFraction,
        speedKmh: pPrev.speedKmh + (pNext.speedKmh - pPrev.speedKmh) * tFraction,
        heading: interpolateAngleDegrees(pPrev.heading, pNext.heading, tFraction),
        bankAngle: calculateCoordinatedBankAngle(...)
      };
    }
    ```

---

## 5. Sequenza Operativa di Implementazione (Roadmap Chirurgica)

1. **Step 1: Estensione Router & Store**:
   - Registrazione rotta `'replay'` in `ui/router.js` e aggiunta proprietà `activeReplayFlightId`, `replay` in `core/store.js`.
2. **Step 2: Core Headless Math (`core/flightReplayMath.js`)**:
   - Implementazione di rollio coordinato, beccheggio, interpolazione e proiezioni.
   - Suite di test automatizzati `tests/core/flightReplayMath.test.mjs` (100% passanti a 0ms).
3. **Step 3: Script Loader & Adapter Interfaccia (`core/scriptLoader.js` & `ui/3d/IReplay3dEngine.js`)**:
   - Creazione del caricatore asincrono on-demand e di `HeadlessReplayEngine.js` per i test Node.js.
4. **Step 4: Telemetria 2D su Canvas (`ui/3d/ReplayTelemetryCanvas.js`)**:
   - Profilo altimetrico interattivo con scrubbing touch e indicatore variometrico FAI.
5. **Step 5: Controller Vista (`ui/views/FlightReplayView.js`)**:
   - Layout outdoor `100dvh`, pulsanti di controllo Fitts $\ge 48\text{px}$, drawer telemetria e gestione ciclo di vita `mount()`/`unmount()`.
6. **Step 6: Implementazione Motore Primario (`ui/3d/MapLibreThreeEngine.js`)**:
   - Setup MapLibre GL 4.7.1, Three.js r128, Terrarium DEM RGB, nastro 3D della traccia e avatar parapendio.
7. **Step 7: Validazione Shift-Left & Pre-Delivery Gates**:
   - Verifica su browser headless, test dei touch target e contrasti WCAG.
