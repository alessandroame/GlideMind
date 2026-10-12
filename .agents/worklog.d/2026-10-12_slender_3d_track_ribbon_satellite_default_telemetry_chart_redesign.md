# Worklog: Traiettoria 3D Slanciata, Basemap Satellitare Predefinita e Riprogettazione Scrubber Altimetrico

**Data**: 2026-10-12  
**Autore**: Antigravity  
**Ambito**: 3D Flight Replay (WebGL/Three.js), UI / Ergonomia Mobile (HMI), Telemetria Cartesiana 2D

---

## 1. Contesto & Obiettivo
In risposta al riscontro dell'utente:
1. **Nastro Traiettoria 3D Slanciato (Anti-Inglobamento Parapendio)**:
   - Ricalibrati i parametri di default e i tetti di clamp in `calculateRibbonDimensions`: `minWidthMeters = 0.35`, `maxWidthMeters = 1.2`, `targetPixels = 1.8`, `heightRatio = 0.5`.
   - In visuale ravvicinata, cockpit e inseguimento la larghezza del prisma 3D scende dinamicamente fino a 35cm (contro i precedenti 23m-46m), posizionandosi perfettamente al di sotto dell'imbrago senza mai occultare la calotta alare (10.5m), il fascio funicolare o il pilota.
   - Opacità del drop curtain verso il terreno DEM ridotta a 0.25 con colorazione FAI, garantendo percezione di quota senza appesantire la scena.
2. **Basemap Satellitare Predefinita (Anti-Distorsione 2D su Terreno DEM)**:
   - `MapLibreThreeEngine` e `FlightReplayView` impostano tassativamente `'satellite'` (Esri World Imagery) come layer predefinito. Le ortofoto aeree non contengono testi 2D o curve di livello che si deformano sulle creste montuose 3D a forte inclinazione (60°-75° pitch).
   - Aggiunta regola CSS `#main-view:has(.gm-flight-replay-fullscreen)` per azzerare padding e forzare layout a tutto schermo senza clipping.
   - Regola `#app-root:has(.gm-flight-replay-fullscreen)` per nascondere completamente `#bottom-nav-bar` e `#desktop-nav-bar` durante il replay 3D.
3. **Top Bar Responsive & Anti-Collisione**:
   - Altezza dinamica per notch e safe area: `calc(56px + env(safe-area-inset-top, 0px))`.
   - Su viewport mobile ($\le 640\text{px}$), il testo "Flight Log" del pulsante back si comprime automaticamente (`.gm-replay-back-text { display: none }`), riducendo la larghezza da 110px a 48px.
   - Etichette dei pulsanti telecamera accorciate in modo conciso ("Segui", "Pilota", "Libera"), risparmiando oltre 80px orizzontali.
   - Titolo e sottotitolo protetti da collisione tramite `flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis;`.
4. **Riprogettazione Scrubber Altimetrico 2D (`ReplayTelemetryCanvas`)**:
   - Marcatori di eventi milestone convertiti da sbarre verticali a tutta altezza (64px) a micro-tacche sul bordo inferiore (`bottom: 0; height: 6px; width: 4px; border-radius: 2px 2px 0 0; opacity: 0.85`).
   - Linee di riferimento altimetriche tratteggiate tenui a 33% e 66% della quota relativa.
   - Etichette filigrana di quota minima e massima in monospace discreto.
   - Riempimento d'area sfumato ciano trasparente (`rgba(56, 189, 248, 0.22)` a `0.01`) e tracciamento continuo a curve raccordate (`lineJoin = 'round'`, `lineCap = 'round'`) colorate secondo la scala variometrica FAI.
   - Ago scrubber verticale sottile da 1.5px con indicatore concentrico (bullseye ciano/bianco) posizionato esattamente sulla quota istantanea.
   - Barra delle fasi superiore assottigliata a 3px con angoli arrotondati.

---

## 2. File Modificati
- `core/flightReplayMath.js`: Aggiornati parametri e clamp in `calculateRibbonDimensions` per profilo slanciato (0.35m - 1.2m).
- `tests/core/flightReplayMath.test.mjs`: Aggiornate asserzioni unitarie per la nuova scala slanciata e i clamp estremi.
- `ui/3d/MapLibreThreeEngine.js`: Impostata basemap predefinita a `satellite`, attenuato drop curtain a opacità 0.25.
- `ui/views/FlightReplayView.js`: Default su satellite, etichette telecamera concise ("Segui", "Pilota", "Libera"), back button responsive con classe `.gm-replay-back-text`.
- `ui/3d/ReplayTelemetryCanvas.js`: Micro-tacche inferiori per gli eventi, griglia orizzontale tenue, etichette quote, sfumatura ciano trasparente e cursore bullseye concentrico.
- `css/theme.css`: Isolamento fullscreen `#main-view:has(.gm-flight-replay-fullscreen)`, occultamento nav bar, media query mobile $\le 640\text{px}$ per top bar.
- `MEMORY.md`: Aggiunta Lezione 142.

---

## 3. Verifica e Governance
- Test suite globale eseguita con successo: **123 suite, 705 passati, 0 falliti, 1 saltato**.
- Tutti i test di cinematica, proiezione, visibilità traccia e rendering altimetrico superati.
