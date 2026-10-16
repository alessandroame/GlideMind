# 2026-10-16 - Fase 7-quinquies: Motore 3D Replay V2 (Camere in Quota, Stabilizzazione Termica, Fisica Pendolare e Traccia Spline)

## 1. Contesto & Motivazione
Il motore di replay 3D iniziale (`MapLibreThreeEngine.js`, `paragliderModel.js`, `flightReplayMath.js`) presentava 6 limiti fisici e visivi emersi durante la revisione `/grill-me`:
1. **Camera rigida e rotazione vertiginosa in termica**: `map.jumpTo({ center: [pt.lon, pt.lat], bearing: pt.heading })` senza smorzamento faceva ruotare le montagne a $15\text{–}25^\circ/\text{s}$ durante i 360° in termica e puntava al fondovalle anziché alla quota 3D della vela ($+800\text{ m AGL}$).
2. **Clipping visuale in `Pilota` (POV)**: la camera `cockpit` intersecava i poligoni di `PilotPod` e `PilotHead`.
3. **Jitter 1 Hz GPS e beccheggio geometrico irrealistico**: il calcolo istantaneo su segmenti GPS da $1\text{ s}$ causava micro-scatti di rollio e usava la pendenza della rampa $\arctan(v_z/v_h)$ come beccheggio dell'ala anziché l'assetto aerodinamico reale ($[-9^\circ, +7^\circ]$) e la fisica pendolare centrifuga.
4. **Livrea monocromatica e scala eccessiva**: la calotta monocromatica arancione non distingueva estradosso/intradosso né bordo d'attacco, e `minPixelSize = 36` ingrandiva eccessivamente la vela sopra le termiche.
5. **Nastro spezzato nei 360° e tendina DEM collassata sotto il decollo**: la mancanza di suddivisione spline e normali miter causava strozzature nei 360°, mentre `_buildDropCurtain` usava `groundMsl = originAlt` (`groundY = 0`) prima del caricamento dei tile DEM, collassando a lunghezza zero tutti i piloni verticali sotto la quota di decollo (`Math.min(pt.y, 0) === pt.y`).
6. **Assenza della traccia futura (Ghost Track) e della scia**: durante il play la parte futura del volo scompariva completamente.

## 2. Interventi Implementati
- **Core Headless (`core/flightReplayMath.js`)**:
  - `smoothTrackKinematics`: filtro Gaussiano pesato nel tempo ($\sigma = 1.8\text{s}$, finestra $\pm 4.5\text{s}$) per `smoothHeading`, `smoothTurnRateDegSec`, `smoothBankAngle`, `aerodynamicPitchAngle` ($[-9^\circ, +7^\circ]$), `brakeLeft`/`brakeRight` e centroide mobile termica (`isThermalOrbit`, `thermalCenterLon`/`Lat`).
  - `computeCameraGroundTargetForAltitude` & `stepCameraSpringDamper`: proiezione del raggio ottico in quota $\Delta H \cdot \tan\theta + d_{\text{lookAhead}}$ sul piano di MapLibre, stabilizzazione dell'orizzonte in termica ($\tau_{\text{bearing}} = 6.5\text{s}$ e blend al $65\%$ sul centroide termico), offset yaw **Look-Into-Turn** ($\pm 20^\circ$) in modalità `Pilota` e supporto per orbita touch manuale (`userBearingOffsetDeg`, `userPitchOffsetDeg`, `userZoomOffset`).
  - `computePendulumPose` & `buildSmoothTrackGeometryData`: cinematica pendolare centrifuga (traslazione interna calotta e oscillazione esterna pod) e suddivisione spline Catmull-Rom con normali orizzontali miter-bisector unitarie.
- **Modello 3D Parapendio (`ui/3d/models/paragliderModel.js`, `scripts/generate_3d_models.js`, `data/models/paraglider.glb`)**:
  - Livrea racing bicolore a vertex colors (`COLOR_0`: bordo d'attacco e stabilo bianchi `#f8fafc`, banda ambra `#f59e0b`, estradosso rosso carminio `#dc2626`, intradosso argento ghiaccio `#e2e8f0`).
  - Pendolo articolato su `GliderCanopy`, `PilotPod`, `PilotHead` e `SuspensionLines`, morphing del bordo d'uscita interno in frenata e occultamento automatico di `PilotPod`/`PilotHead` (`visible = false`) quando `cameraMode === 'cockpit'`.
- **Motore WebGL 3D (`ui/3d/MapLibreThreeEngine.js`, `ui/3d/HeadlessReplayEngine.js`)**:
  - Integrazione di `stepCameraSpringDamper`, orbita touch libera in modalità `Segui` (con reset al ri-tap su `Segui` e `fitTrackBounds` al ri-tap su `Libera`), scala contenuta (`minPixelSize = 22`, `maxScale = 6.5`), drop-line AGL verticale + anello ombra al suolo sotto la vela (`avatarGroundLine`, `avatarShadowRing`), Ghost Track futura (`ghostRibbonMesh`, `ghostLineMesh`), scia aerodinamica (`wakeTrailMesh`) e fix di `_buildDropCurtain` con fallback `_minTrackY` e `_refreshDropCurtainElevations()`.

## 3. Verifica
- **Test unitari e di governance**: `57/57` test specifici 3D e `823/823` test complessivi della suite (`node --test`).
