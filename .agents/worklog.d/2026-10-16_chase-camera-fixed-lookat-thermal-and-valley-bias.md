# 2026-10-16 — Revisione Cinematica Camera `Segui` (`chase`): Look-At Fisso, Soppressione Traslazioni in Termica, Solver Ray-Terrain Anti-Vibrazione e Sguardo Bloccato in Pausa

## Contesto
In modalità camera `Segui` (`chase`), l'accoppiamento diretto tra punto di mira filtrato (`focusLat/Lon/Alt`) e posizione dell'occhio camera, unito all'iterazione cobweb non smorzata sull'elevazione del terreno, causava:
1. Perdita di puntamento centrale sulla vela durante le spirali in termica e a replay in pausa/fermo.
2. Traslazione radiale improvvisa di $1.441\text{ m}$ all'ingresso/uscita termica (`baseZoom: 14.3 -> 15.6`) e oscillazione laterale del braccio camera ($\sim 500\text{–}1.500\text{ m}$).
3. Vibrazione verticale ad alta frequenza (instabilità cobweb $|T'(E)| = |\text{slope} \cdot \tan\theta| > 1$ su pendii $> 30^\circ$, oscillazione di `rayVertDropM = eyeAlt - focusAlt` e overshoot Catmull-Rom su intervalli LTTB non uniformi).

## Decisioni Architetturali
1. **Disaccoppiamento Look-At Fisso $\mathbf{P}_G(t)$ vs Ancora Spaziale $\mathbf{A}(t)$ (`core/flightReplayMath.js`)**:
   - `focusLat`, `focusLon` e `focusAlt` sono vincolati al 100% alle coordinate 3D istantanee del parapendio, con `anchorAlt = focusAlt` così da mantenere `rayVertDropM = vertArmHeightM` costante ed evitare oscillazioni di pitch durante salite/discendenze.
   - L'interpolazione verticale (`y`, `alt`) in `interpolateTrackSample` usa una cubica monotona di Fritsch-Carlson eliminando gli overshoot sulle griglie temporali LTTB non uniformi.
   - L'ancora orizzontale `anchorLat/Lon` e l'azimut `rigBearing` usano un kernel Gaussiano simmetrico ($\sigma = 8.5\text{ s}$, $W = 22.0\text{ s}$) coi centri dei cerchi osculatori: in termica applicano $\tau = 8.5\text{ s}$, deadband $18\text{ m}$ e blocco azimut $\propto (1 - w_{\text{thermal}})^2$ (soppressione $> 95\%$); in planata applicano $\tau = 0.14\text{ s} / \text{playbackSpeed}$ ed *elastic leash* di $12\text{ m}$, con orientamento preferenziale lato valle (`valleyBearingDeg`).
2. **Solver Illinois Regula Falsi + Bisezione per Intersezione Raggio-Terreno (`MapLibreThreeEngine.js`)**:
   - Sostituita l'iterazione cobweb post-`jumpTo` con `_solveAndApplyCameraGroundTarget`: risolve il punto fisso $T(E^*) = E^*$ con metodo Secante-Bisezione bracketed (tolleranza $0.02\text{ m}$) e supporto a `altitudeDeltaMeters` negativi (`[-400, 2800] m`), eliminando la vibrazione verticale sui pendii ripidi.
3. **Mantenimento Sguardo sulla Vela a Replay Fermo (`lockAnchorToFocus` & `_syncCameraGazeWhenPaused`)**:
   - Quando `isPlaying === false` (in `pause()`, `seek()`, gesti utente `_onMapRotate`/`_onMapPitch`/`_onMapZoom`/`_onMapMove`, `_onMapIdle` e aggiornamenti DEM in `glCustomLayer.render`), l'ancora si allinea a `focusLat/Lon` (`lockAnchorToFocus: true`) preservando `autoRigBearing` (`preserveAutoRigBearing: true`).

## Impatto e Verifica
- File modificati: `core/flightReplayMath.js`, `ui/3d/MapLibreThreeEngine.js`, `tests/core/flightReplayMath.test.mjs`, `tests/ui/mapLibreThreeEngine.test.mjs`.
- Test suite: 837/837 test superati (`node --test`).
