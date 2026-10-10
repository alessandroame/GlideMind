# Scheda Intervento: Fase 7.1 - Core Matematico di Replay 3D & Adapter Mock

- **Data**: 2026-10-10
- **Autore**: Alessandro Amè & Pair Programmer
- **Tipo**: Feature / Core Math / 3D Graphics / State Management
- **Stato**: Completato

---

## 1. Contesto & Obiettivi

La Fase 7 introduce in GlideMind il visualizzatore 3D della traiettoria di volo (`FlightReplayView.js`), accessibile dal pulsante primario *"Visualizza Replay 3D"* di [FlightDetailSheet.js](file:///ui/views/FlightDetailSheet.js) e dalla rotta diretta `#replay`.
Per evitare il rischio di monolite (eredità critica del vecchio `flightReplay3d.js` in ParaMeteo da oltre 6.300 righe) e conformemente al piano architetturale [docs/plans/phase-7-3d-flight-replay.md](file:///docs/plans/phase-7-3d-flight-replay.md), lo sviluppo è articolato in moduli con responsabilità singola (< 600 righe ciascuno).

Lo **Step 7.1** realizza le fondamenta computazionali headless:
1. Il modulo matematico e cinematico puro privo di dipendenze DOM/WebGL.
2. L'interfaccia astratta del motore 3D `IReplay3dEngine` con gestione eventi.
3. L'adapter di simulazione `HeadlessReplayEngine` a latenza 0ms per i test Node.js.
4. L'integrazione della rotta `'replay'` nel router e dello slice reattivo nello store.

---

## 2. Modifiche Apportate

1. **Core Matematico Headless ([core/flightReplayMath.js](file:///core/flightReplayMath.js))**:
   - `calculateCoordinatedBankAngle(turnRateDegSec, groundSpeedMs)`: rollio aerodinamico $\theta = \arctan\left(\frac{v \cdot \omega}{g}\right)$ con clamping a $65^\circ$ e supporto radianti/gradi.
   - `calculateKinematicPitchAngle(vzMs, groundSpeedMs)`: beccheggio cinematico della traiettoria $\alpha = \arctan\left(\frac{v_z}{v_h}\right)$ con clamping a $45^\circ$.
   - `interpolateAngleDegrees(a1, a2, factor)`: interpolazione angolare continua lungo l'arco più breve attraverso il confine $0^\circ / 360^\circ$.
   - `interpolateCatmullRom(p0, p1, p2, p3, t)`: interpolazione spline cubica $C^1$ continua.
   - `interpolateTrackSample(pPrev, pNext, factor, pPrevPrev, pNextNext)`: interpolazione cinematica progressiva (lat, lon, quota, velocità, vario, prua, bank e pitch calcolati dinamicamente).
   - `calculateAvatarMinScale(distMeters, fovDeg, vpHeight, minPx)`: fattore di ingrandimento proiettivo prospettico affinché il modello 3D del parapendio mantenga sempre una dimensione a schermo $\ge 36\text{px}$ a qualsiasi distanza di telecamera.
   - `projectTrackToThreeLocal(points, origin)`: proiezione metrico-spaziale topocentrica su terna destrorsa Three.js Y-Up (+X Est, +Y Zenith, +Z Sud) centrata sul punto di decollo $P_0$.
   - Applicazione rigorosa della normalizzazione IEEE 754 per evitare valori `-0` (MEMORY #5).

2. **Interfaccia Astratta Motore 3D ([ui/3d/IReplay3dEngine.js](file:///ui/3d/IReplay3dEngine.js))**:
   - Definizione dei metodi di ciclo di vita e controllo: `init()`, `loadTrack()`, `seek()`, `setPlaybackSpeed()`, `setCameraMode()`, `setElevationOffset()`, `play()`, `pause()`, `destroy()`.
   - Sistema di sottoscrizione eventi: `on()`, `off()`, `emit()` per `timeupdate`, `play`, `pause`, `ended`, `camerachange`, `speedchange`, `contextlost`, `contextrestored`, `error`.

3. **Adapter Mock Headless ([ui/3d/HeadlessReplayEngine.js](file:///ui/3d/HeadlessReplayEngine.js))**:
   - Implementazione concreta a 0ms per l'automazione dei test in ambiente Node.js.
   - Simulazione deterministica di avanzamento playback (`step(dt)`), calcolo campioni interpolati con Catmull-Rom e test di resilienza a perdita di contesto WebGL (`simulateContextLost` / `simulateContextRestored`).

4. **Integrazione Store Reattivo ([core/store.js](file:///core/store.js))**:
   - Aggiunto `activeReplayFlightId: null` e slice `replay: { isPlaying, progress, currentTimeSec, speed, cameraMode }` in `DEFAULT_INITIAL_STATE`.
   - Escluso lo slice `replay` dalla persistenza `localStorage` (MEMORY #90, #99).

5. **Integrazione Router ([ui/router.js](file:///ui/router.js))**:
   - Separazione pulita tra `PRIMARY_NAV_ROUTES` (i 5 tab visibili nella navbar) e `VALID_ROUTES` (che ammette `'replay'`).
   - Aggiunto il titolo per la rotta `replay` in `renderRoutePlaceholder`.

6. **Suite di Test Automatizzati**:
   - Creata [tests/core/flightReplayMath.test.mjs](file:///tests/core/flightReplayMath.test.mjs) (25 test unitari).
   - Creata [tests/ui/replay3dEngine.test.mjs](file:///tests/ui/replay3dEngine.test.mjs) (9 test unitari).
   - Aggiornato [tests/ui/router.test.mjs](file:///tests/ui/router.test.mjs) (7 test unitari).

---

## 3. Risultati dei Test & Verifiche

- Esecuzione `npm test`: **100 suite native eseguite, 591/591 test superati con successo (0 falliti)**.
- Nessuna dipendenza DOM o WebGL introdotta nel Core Headless.
