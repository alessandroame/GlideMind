# Fase 7.3: Motore 3D MapLibre+Three.js, Allineamento Geodetico P0, Avatar Parapendio GLB & Chiusura Fase 7

**Data**: 2026-10-10  
**Autore**: GlideMind Agent  
**Ambito**: Cartografia 3D, WebGL, Computer Graphics, glTF 2.0 Binary & Completamento Replay 3D  

---

## 1. Contesto & Motivazione

Con la definizione della matematica headless (Fase 7.1) e dell'interfaccia UI a schermo intero con canvas telemetrico 2D (Fase 7.2), la Fase 7 si completa con il motore di rendering 3D primario ad alte prestazioni (`MapLibreThreeEngine.js`), la pipeline degli asset 3D (`data/models/paraglider.glb` e `ui/3d/models/paragliderModel.js`), l'allineamento geodetico a singolo scatto $P_0$ e la gestione resiliente della perdita del contesto grafico WebGL.

---

## 2. Decisioni & Interventi Architetturali

1. **Motore 3D MapLibre GL + Three.js (`ui/3d/MapLibreThreeEngine.js`)**:
   - Cartografia MapLibre GL 3D (v4.7.1) con sorgente raster DEM Terrarium (`https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png`).
   - Implementazione del CustomLayer Three.js (r128) con rendering mode `3d`.
   - **Allineamento Geodetico $P_0$ (Single-Shot Origin Alignment)**: Calcolo all'avvio dell'origine Mercatore e del fattore di scala metrico locale (`meterInMercatorCoordinateUnits()`). Matrice di trasformazione che converte lo spazio Three.js locale (X: Est, Y: Zenit, Z: Sud) nello spazio Mercatore MapLibre (X: Est, Y: Sud, Z: Zenit) mediante traslazione su $P_0$, scaling metrico e inversione di base.
   - Nastro 3D della traiettoria estruso con sfumatura di colore per vertice basata sulla salita/discesa variometrica FAI (`sampleVarioRgb`).
   - Piloni di caduta verticale a terra (drop curtain) per la percezione intuitiva della quota rispetto al rilievo.
   - Cinematica della telecamera a 3 modalità: Insegui (chase), Pilota (cockpit first-person) e Libera (interazione utente indipendente).
   - Gestione del ciclo di vita WebGL con listener `webglcontextlost` (`e.preventDefault()`) e `webglcontextrestored`, evitando congelamenti e garantendo il ripristino istantaneo dei buffer.
   - Piena resilienza headless in Node.js per test automatizzati a 0ms senza errori DOM.

2. **Pipeline Asset 3D e Parapendio GLB (`scripts/generate_3d_models.js`, `data/models/paraglider.glb`, `ui/3d/models/paragliderModel.js`)**:
   - Generatore autonomo a zero dipendenze esterne (`scripts/generate_3d_models.js`) per compilare geometrie conformi a glTF 2.0 Binary (.glb).
   - Generato il modello `data/models/paraglider.glb` (23.8 KB) con ala parametrica (apertura ~10.5m, corda ~2.4m, arco anedro, profilo alare biconvesso camberato), fascio funi e pod imbrago pilota aerodinamico.
   - Aggiunto lo script `"build:models": "node scripts/generate_3d_models.js"` in `package.json`.
   - Modulo `ui/3d/models/paragliderModel.js` con caricamento asincrono GLB via `GLTFLoader` e fallback immediato a mesh procedurale parametrica Three.js, unito all'aggiornatore di assetto avionico `updateAvatarPose` (rollio coordinato, beccheggio cinematico, prua e moltiplicatore di scala prospettico anti-subpixel).

3. **Integrazione View Controller (`ui/views/FlightReplayView.js`)**:
   - Aggiornato `_createEngine()` per instanziare dinamicamente `MapLibreThreeEngine` nei browser WebGL e mantenere `HeadlessReplayEngine` nei contesti Node.js/test.

4. **Allineamento Memoria & Roadmap**:
   - Aggiornato `MEMORY.md` con la Lezione 111 (*Integrazione 3D MapLibre GL & Three.js CustomLayer: Allineamento Geodetico P0 a Singolo Scatto e Resilienza WebGL Context*).
   - Aggiornato `DESIDERATA.md` con la marcatura di Fase 7 a `🟢 Completato`.

5. **Test Automatizzati**:
   - `tests/ui/paragliderModel.test.mjs` (5 test): mesh procedurale, orientamento aeronautico e scale, fallback offline, compatibilità mock GLTFLoader.
   - `tests/ui/mapLibreThreeEngine.test.mjs` (10 test): ciclo di vita, proiezione topocentrica, seek e interpolazione Hermite, cambi camera e velocità, context lost/restored, distruzione pulita delle risorse.
   - Totale: 106 suite e 619 test passati al 100% con successo (0 fallimenti).
