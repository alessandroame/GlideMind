# Worklog: Risoluzione Visibilità Traccia 3D, Spessore Volumetrico e Allineamento al Terreno

## Contesto
Durante il collaudo del Replay 3D dei voli (`FlightReplayView` e `MapLibreThreeEngine`), l'utente ha riscontrato che la traccia era visibile ma risultava "molto sottile e molto staccata dal terreno".

## Causa Radice
1. **Spessore Visivo e Proiezione di Vista (Traccia Sottile)**:
   - La geometria del nastro era bidimensionale e puramente orizzontale ($\Delta y = 0$). Con la telecamera MapLibre inclinata di 62°–80° (pitch orografico radente), una striscia orizzontale vista di taglio appare sottilissima, riducendosi a una frazione di millimetro a schermo.
2. **Offset e Distacco dal Terreno (Traccia Staccata)**:
   - *Offset d'innesco*: Il punto 0 del tracciato di prova veniva generato con una deviazione trigonometrica $+0.0045^\circ$ est rispetto al decollo (circa 350m a est della cresta del Cornizzolo), posizionando il punto iniziale sopra un burrone dove il terreno scende di 350-400m, con conseguente sollevamento dell'origine Three.js $P_0$ rispetto al suolo.
   - *Quota sproporzionata sulla valle*: Nella fase di salita a 1500m, il tracciato traslava verso sud sulla piana di Suello (dove il terreno è a 250m), creando un dislivello visivo di oltre 1250 metri di vuoto tra la traccia e il suolo.
   - *Disaccoppiamento Geoidico DEM Terrarium vs GPS*: Mancava l'auto-snapping rigido dell'origine $P_0$ all'altimetria effettiva del raster DEM calcolata da `map.queryTerrainElevation([lon0, lat0])`.

## Modifiche Apportate
1. **Tubo 3D Volumetrico Prismatico (`ui/3d/MapLibreThreeEngine.js`)**:
   - Sostituito il nastro piatto 2D con un **tubo 3D a sezione romboidale a 4 vertici** (Top, Right, Bottom, Left) largo 20 metri e alto 14 metri. Da qualsiasi inclinazione della telecamera (dall'alto, di taglio, dal cockpit, in inseguimento laterale), la traiettoria presenta sempre uno spessore volumetrico solido ed evidente, colorato con i gradienti FAI variometrici.
   - Mantenuta la `THREE.Line` centrale continua ad alta opacità (1.0) con colori vertice.
2. **Auto-Snapping Rigid-Origin Altimetria DEM (`ui/3d/MapLibreThreeEngine.js`)**:
   - Calcolato `terrainDelta = terrainElev - origin.alt` tramite `map.queryTerrainElevation([origin.lon, origin.lat])` sia in `loadTrack` sia nel primo frame di `render`, ancorando esattamente il punto di decollo $P_0$ al suolo montuoso 3D, come prescritto da `geodesy_webgl_3d_spec.md`.
3. **Cinematica di Volo Realistica Aderente al Rilievo (`ui/views/FlightReplayView.js`)**:
   - Il punto $0$ parte rigorosamente dal decollo $(lat_0, lon_0, alt_0)$ sul prato.
   - Fase di termica/dinamica ($0\% \to 60\%$): il pilota compie spirali e otto restando ancorato alla cresta montuosa del Cornizzolo/Birone, salendo dolcemente di soli $+220\text{m}$ (quota max 1280m), volando a soli $50\text{--}150\text{m}$ sopra il crinale montuoso.
   - Fase di transizione e planata ($60\% \to 100\%$): il pilota lascia il costone e scende progressivamente con efficienza 8:1 verso l'atterraggio ufficiale di Suello, toccando il suolo esattamente a quota atterraggio ($260\text{m}$).

## Verifica e Risultati
- 107 suite di test su 107 superate (`npm test`, 630/630 test passati, 100% green).
- Traccia spessa, solida e tridimensionale da qualsiasi angolazione; traiettoria aderente al profilo orografico della montagna.
