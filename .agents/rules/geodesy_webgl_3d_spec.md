# 3D Geodesy, WebGL & Computer Graphics Specialization Directives

Questa direttiva definisce il rigore matematico, geodetico e architetturale che l'Agente DEVE adottare quando lavora sul visualizzatore 3D, proiezioni cartografiche, altimetrie DEM e rendering WebGL/Three.js.

---

## 1. Geodesia Matematica & Proiezioni Cartografiche (EPSG:3857 & WGS84)

1. **Fattore di Distorsione Conforme di Web Mercator**:
   - Nello spazio di proiezione normalizzato MapLibre $[0, 1]$, le unità metriche scalano in base alla latitudine geodetica espressa in radianti $\phi = \text{lat} \cdot \frac{\pi}{180}$:
     $$\text{scaleFactor} = \frac{1}{\cos(\phi)} = \sec(\phi)$$
   - **Regola Tassativa**: Non usare mai distanze euclidee piane $\Delta X = (\text{lon}_1 - \text{lon}_2)$ senza applicare il fattore di scala locale `meterInMercatorCoordinateUnits()` calcolato nel punto di riferimento $P_0$.

2. **Integrità del Reference Frame Origin ($P_0$) - Single-Shot Alignment**:
   - Tutte le geometrie Three.js (traccia, piloni, avatar, waypoint, landmark) devono essere trasformate nello spazio locale Three.js centrato in $P_0 = (\text{lon}_0, \text{lat}_0, H_0)$ **una sola volta all'avvio** (`init` / `loadTrack`).
   - È **proibito** ricalcolare matrici di proiezione, riposizionare l'origine della scena o applicare offset dinamici durante il ciclo di render per-frame o in risposta a rotazioni/pan della telecamera.

3. **Disaccoppiamento Geoidico (WGS84 vs MSL DEM)**:
   - I dati GPS IGC operano su elissoide WGS84 o quota barometrica MSL standard.
   - I raster DEM Terrarium operano su MSL (EGM96).
   - Qualsiasi delta altimetrico tra decollo registrato e DEM deve essere applicato come traslazione rigida $\mathbf{T}_y = [0, \Delta h, 0]^T$ all'intera scena Three.js (corrispondente a $\mathbf{T}_z$ nello spazio MapLibre Mercator), mai punto per punto in modo non lineare.

---

## 2. Computer Graphics & Matrici di Trasformazione (WebGL & Three.js)

1. **Pipeline 4x4 Model-View-Projection (MVP)**:
   - La matrice di Three.js nel CustomLayer di MapLibre riceve la matrice combinata:
     $$\mathbf{M}_{\text{custom}} = \mathbf{M}_{\text{proj}} \times \mathbf{M}_{\text{view}} \times \mathbf{M}_{\text{modelTransform}}$$
   - Le traslazioni e le rotazioni locali Three.js operano in coordinate cartesiane destrorse standard (Y-Up):
     - $X$: Est (+X)
     - $Y$: Altitudine (+Y verso lo zenit nello spazio Three.js locale, corrispondente all'asse $Z$ di MapLibre)
     - $Z$: Sud (+Z verso Sud, -Z verso Nord, imposto dalla relazione destrorsa $\mathbf{\hat{X}} \times \mathbf{\hat{Y}} = \mathbf{\hat{Z}} \implies \text{Est} \times \text{Zenit} = \text{Sud}$).

2. **Cinematica della Telecamera & Controllo del Pivot**:
   - Il punto focale della telecamera (LookAt target) deve coincidere rigorosamente con la coordinata geografica target proiettata a quota terreno o a quota del baricentro del parapendio.
   - Non applicare "compensazioni altimetriche empiriche" al centro della mappa durante il pitch/zoom: gli effetti prospettici di parallasse sono proprietà intrinseche del frustum e vanno gestiti mantenendo il target geografico invariato.

---

## 3. Raster DEM Altimetria & GPU Texture Pipeline

1. **Decodifica Terrarium DEM (24-bit Pack)**:
   $$H = (R \times 256 + G + \frac{B}{256}) - 32768$$
   - Il campionamento altezze tramite `map.queryTerrainElevation(lngLat)` è asincrono rispetto al caricamento delle tile DEM nella memoria GPU.
   - Gestire sempre il caso in cui `queryTerrainElevation` ritorni `null`/`undefined` (tile DEM non ancora in cache/caricata) con fallback grazioso senza corrompere la quota di riferimento della scena.

2. **Integrità CORS & Endpoint S3**:
   - I tile server per il raster DEM devono SEMPRE esporre l'header `Access-Control-Allow-Origin: *`.
   - Utilizzare solo endpoint con certificati validi e supporto CORS nativo (es. `https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png`).

---

## 4. Architettura PWA & Service Worker Passthrough

1. **Regola di Non-Interferenza Tile Esterni**:
   - Il Service Worker PWA (`sw.js`) deve operare in modalità **Zero-Interference / Pass-Through** per tutte le richieste a domini di terze parti e tile raster/vettoriali/DEM (inclusi `amazonaws.com`, `arcgisonline.com`, `opentopomap.org`, `open-meteo.com`).
   - Nessuna richiesta cross-origin non-CDN deve essere intercettata o restituire `Response.error()` di fallback.

---

## 5. Gestione e Standardizzazione Asset 3D (GLB Specification)

1. **Formato Binario Obbligatorio (.glb)**:
   - Tutti i modelli 3D dell'applicazione (parapendii, vele, piloti, imbraghi, indicatori volumetrici) devono essere tassativamente generati e salvati in formato binario compatto **`.glb`** (glTF 2.0 Binary). Formati non compilati (.gltf non incorporato o geometrie JSON arbitrarie) sono rigorosamente vietati per gli asset permanenti.
2. **Directory Unificata degli Asset 3D (`data/models/`)**:
   - La cartella di destinazione per qualsiasi asset 3D dell'applicazione è obbligatoriamente **`data/models/`** (es. `data/models/paraglider.glb`).
3. **Convenzione di Scala 1:1 e Orientamento Assi Aeronautici**:
   - I modelli devono rispettare la scala metrica $1:1$ ($1\text{ unit} = 1\text{ meter}$).
   - L'orientamento degli assi nel file GLB deve seguire lo standard aeronautico coerente: $+X$ semiala destra, $+Y$ asse verticale verso l'alto (dorsale/estradosso), $+Z$ coda/bordo d'uscita (con prua rivolta verso $-Z$ o allineata con l'avanzamento cinematica).
4. **Pre-caching e Supporto PWA 100% Offline**:
   - Qualsiasi nuovo asset 3D introdotto nella cartella `data/models/` deve essere obbligatoriamente registrato nell'array `ASSETS` di `sw.js` per garantire il funzionamento $100\%$ offline della PWA.
5. **Pipeline di Build Automatizzata (`npm run build:models`)**:
   - Le geometrie parametriche o procedurali sono mantenute nei rispettivi sorgenti JS (es. `js/models/paragliderModel.js`) e compilate in file `.glb` tramite lo script `scripts/generate_3d_models.js` (`npm run build:models`).
