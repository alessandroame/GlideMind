# Giornale Cronologico degli Interventi & ADR (WORKLOG)

Questo giornale registra la cronologia degli interventi architetturali e operativi nel repository GlideMind. I dettagli granulari sono archiviati in `.agents/worklog.d/`.

---

## 2026-10-07 - Fase 0: Workspace Foundation & Governance
- **Tipo**: Architettura / Inizializzazione
- **Dettagli**: [.agents/worklog.d/2026-10-07_phase-0-foundation.md](file:///.agents/worklog.d/2026-10-07_phase-0-foundation.md)
- **Sintesi**:
  - Definizione del piano architetturale generale ([MASTER_PLAN.md](file:///MASTER_PLAN.md)) e delle specifiche per le Fasi 0-8.
  - Configurazione delle regole ingegneristiche in `.agents/rules/` e delle skill di dominio in `.agents/skills/`.
  - Installazione globale dei plugin di Antigravity in `~/.gemini/config/plugins/` e bonifica delle giunzioni NTFS locali.
  - Implementazione del test harness nativo (`node:test`) con [tests/smoke.test.mjs](file:///tests/smoke.test.mjs) e del server di sviluppo statico locale [scripts/serve.js](file:///scripts/serve.js).
  - Inizializzazione della triade di continuità cognitiva (`MEMORY.md`, `WORKLOG.md`, `DESIDERATA.md`).

---

## 2026-10-07 - Fase 1: Core Engine Migration (geoSpatialMath & flyability)
- **Tipo**: Refactoring / Migrazione Headless
- **Dettagli**: [.agents/worklog.d/2026-10-07_phase-1-core-engine-migration.md](file:///.agents/worklog.d/2026-10-07_phase-1-core-engine-migration.md)
- **Sintesi**:
  - Estrazione e decoupling di [core/geoSpatialMath.js](file:///core/geoSpatialMath.js) (formule WGS84, Haversine, bearing, scomposizione vento, Chaikin, Web Mercator, ENU, calibrazione DEM).
  - Estrazione e decoupling di [core/flyability.js](file:///core/flyability.js) (algoritmo waterfall, priorità aeronautica, EDR, Deardorff, protezione sottovento, timeline scoring).
  - Suite di test automatizzati con 31 unit test nativi in [tests/core/geoSpatialMath.test.mjs](file:///tests/core/geoSpatialMath.test.mjs) e [tests/core/flyability.test.mjs](file:///tests/core/flyability.test.mjs).

---

## 2026-10-07 - Fase 1: Soundings Thermodynamics & IGC Tracklog Engine
- **Tipo**: Refactoring / Migrazione Headless
- **Dettagli**: [.agents/worklog.d/2026-10-07_phase-1-soundings-and-igc-migration.md](file:///.agents/worklog.d/2026-10-07_phase-1-soundings-and-igc-migration.md)
- **Sintesi**:
  - Implementazione headless pura di [core/soundingsMath.js](file:///core/soundingsMath.js) (Magnus-Tetens, inversione RH, LCL Cloud Base Esposito-Hennig, gradienti e lapse rate WMO, barometria ICAO, rilevamento inversioni termiche e stima ceiling convettivo).
  - Implementazione headless pura di [core/igcParser.js](file:///core/igcParser.js) (parsing B-record e H-record conformi FAI GNSS, conversione UTC/locale, trimming statico pre/post volo, filtro anti-spike $\pm 18\text{ m/s}$, matching catalogo spot decolli/atterraggi e iniezione analizzatore telemetria).
  - Suite di unit test con 53 test nativi in [tests/core/soundingsMath.test.mjs](file:///tests/core/soundingsMath.test.mjs) e [tests/core/igcParser.test.mjs](file:///tests/core/igcParser.test.mjs), inclusa validazione end-to-end su traccia IGC di volo reale.

---

## 2026-10-07 - Fase 1: Flight Telemetry Kinematics & Maneuvers Classifier
- **Tipo**: Refactoring / Migrazione Headless
- **Dettagli**: [.agents/worklog.d/2026-10-07_phase-1-flight-telemetry-and-maneuvers.md](file:///.agents/worklog.d/2026-10-07_phase-1-flight-telemetry-and-maneuvers.md)
- **Sintesi**:
  - Implementazione headless pura di [core/flightTelemetry.js](file:///core/flightTelemetry.js) (decimazione adattiva LTTB per Canvas a 60 FPS, smoothing altimetrico simmetrico, ground speed, glide ratio L/D, guadagno cumulato termica vs dinamica, fasce FAI e gradienti CSS).
  - Implementazione headless pura di [core/flightManeuvers.js](file:///core/flightManeuvers.js) (rilevamento termiche con baricentro pesato e stima vento di deriva, rilevamento wingover, spirali rapide, 360°, circuito a 8, orecchie e soppressione in avvicinamento finale, riconciliazione e merge idempotente).
  - Suite di unit test con 38 test nativi in [tests/core/flightTelemetry.test.mjs](file:///tests/core/flightTelemetry.test.mjs) e [tests/core/flightManeuvers.test.mjs](file:///tests/core/flightManeuvers.test.mjs).

---

## 2026-10-07 - Fase 1: Open-Meteo Ingestion Engine & Cache Decoupling
- **Tipo**: Refactoring / Migrazione Headless
- **Dettagli**: [.agents/worklog.d/2026-10-07_phase-1-open-meteo-client.md](file:///.agents/worklog.d/2026-10-07_phase-1-open-meteo-client.md)
- **Sintesi**:
  - Implementazione headless pura di [core/openMeteoApi.js](file:///core/openMeteoApi.js) (costruttore URL parametrico per variabili di superficie e livelli isobarici 1000-500 hPa, cache LRU in memoria con TTL e serializzazione JSON, client fetch con AbortController, backoff esponenziale HTTP 429, fallback a `best_match` su modelli regionali fuori dominio, fallback offline su cache stale, generatore deterministico di meteo sintetico e calcolo EDR/Deardorff).
  - Suite di unit test con 25 test nativi in [tests/core/openMeteoApi.test.mjs](file:///tests/core/openMeteoApi.test.mjs) con zero dipendenze dal DOM o chiamate di rete esterne.

---

## 2026-10-07 - Fase 2: Design System & Shell Architetturale
- **Tipo**: Architettura / UI Shell / State Management
- **Dettagli**: [.agents/worklog.d/2026-10-07_phase-2-design-system-and-shell.md](file:///.agents/worklog.d/2026-10-07_phase-2-design-system-and-shell.md)
- **Sintesi**:
  - Implementazione del Single Source of Truth headless [core/store.js](file:///core/store.js) con pattern Pub/Sub, difensiva deep-clone e adapter di memorizzazione iniettabile (in-memory per test, localStorage per browser).
  - Implementazione dei design tokens aeronautici in [css/theme.css](file:///css/theme.css) con palette ad alto contrasto per esterni, vincolo Fitts's law ($\ge 44\text{px}$), viewport `100dvh`, caroselli a snap orizzontale e stili responsive nav/drawer.
  - Implementazione della shell ultraleggera [index.html](file:///index.html) (108 righe) con semantic landmarks (#app-root, #desktop-nav-bar, #main-view, #bottom-nav-bar, #sheet-container).
  - Implementazione del router a 5 schede [ui/router.js](file:///ui/router.js) con sincronizzazione bidirezionale dell'hash, navigazione da tastiera protetta da input guard e ciclo di vita di montaggio viste.
  - Implementazione del gestore centralizzato [ui/sheetManager.js](file:///ui/sheetManager.js) a singolo overlay attivo con dismiss via tap, Escape e pulsante 'X'.
  - Suite di unit e integration test in [tests/core/store.test.mjs](file:///tests/core/store.test.mjs), [tests/ui/router.test.mjs](file:///tests/ui/router.test.mjs), [tests/ui/shellIntegrity.test.mjs](file:///tests/ui/shellIntegrity.test.mjs) e [tests/server.test.mjs](file:///tests/server.test.mjs) (24 nuovi test, totale 173 test superati).

---

## 2026-10-08 - Fase 3: Semplificazione Architetturale Home Dashboard
- **Tipo**: Architettura / UI Design / ADR
- **Dettagli**: [.agents/worklog.d/2026-10-08_home-architecture-simplification.md](file:///.agents/worklog.d/2026-10-08_home-architecture-simplification.md)
- **Sintesi**:
  - Dismissione e rimozione del mockup statico monolitico (`mockup-preview.html`) per prevenire debito da doppio binario.
  - Ridefinizione della specifica concettuale di `HomeDashboardView.js` su due soli blocchi essenziali: (1) Elenco comprensori preferiti (`pinnedLocationIds`) ordinato decrescente per volabilità (miglior decollo $T_{\text{best}}$ + atterraggio di rientro $L_{\text{safe}}$ con $E_{\text{richiesta}}$); (2) Riga sintetica di currency e stato di volo pilota con azione rapida `+ Carica IGC`.
  - Aggiornamento della navigazione in [index.html](file:///index.html) ("Previsioni", "Impostazioni") e integrazione classi di utilità touch in [css/theme.css](file:///css/theme.css).
  - Formalizzazione del vincolo in `MEMORY.md` (Sezione 14), aggiornamento `DESIDERATA.md` e redazione della specifica di implementazione in `phase-3-home-dashboard-spec.md`.

---

## 2026-10-08 - Fase 3: Implementazione HomeDashboardView & Allineamento Laws of UX 2026
- **Tipo**: Feature / UI View / Ergonomia Outdoor
- **Dettagli**: [.agents/worklog.d/2026-10-08_phase-3-home-dashboard-implementation.md](file:///.agents/worklog.d/2026-10-08_phase-3-home-dashboard-implementation.md)
- **Sintesi**:
  - Adeguamento del touch floor a $\ge 48\text{px}$ in [css/theme.css](file:///css/theme.css) per allineamento alle nuove direttive Fitts's Law 2026.
  - Implementazione degli stili per Toast Undo Floating ([.gm-toast](file:///css/theme.css)) ed elemento Skeleton pulsante ([.gm-skeleton](file:///css/theme.css)).
  - Implementazione del modulo headless [core/comprensorio.js](file:///core/comprensorio.js) con normalizzazione catalogo, calcolo planata atterraggio $E_{\text{richiesta}} = D / \Delta H$ con soglie di sicurezza glider proxy (EN-A: 5.5, EN-B: 6.5), valutazione $T_{\text{best}}$ e $L_{\text{safe}}$, ed Explainability inline.
  - Implementazione della vista reattiva [ui/views/HomeDashboardView.js](file:///ui/views/HomeDashboardView.js) a due blocchi con pattern Undo (NN/G #3, finestra di grazia 6s su unpin) e azione primaria Von Restorff `+ Carica IGC`.
  - Registrazione nel bootstrap in [ui/app.js](file:///ui/app.js).
  - Creazione delle suite di test in [tests/core/comprensorio.test.mjs](file:///tests/core/comprensorio.test.mjs) e [tests/ui/homeDashboardView.test.mjs](file:///tests/ui/homeDashboardView.test.mjs) (19 nuovi test, totale 192 test superati).

---

## 2026-10-08 - Fase 3: Regola dell'Unico Binomio e Selezione Ibrida con Override Meteo
- **Tipo**: Architettura / Dominio Aeronautico / UI
- **Dettagli**: [.agents/worklog.d/2026-10-08_unico-binomio-e-selezione-ibrida.md](file:///.agents/worklog.d/2026-10-08_unico-binomio-e-selezione-ibrida.md)
- **Sintesi**:
  - Introduzione formale della **Regola dell'Unico Binomio (1 Decollo + 1 Atterraggio per Comprensorio)** per eliminare il sovraccarico cognitivo outdoor (*Miller's Law* e *Hick's Law*).
  - Implementazione della strategia **Ibrido con Override Meteo**: uso di default del decollo principale/storico censito (`isPrimary: true`), con commutazione automatica su decollo alternativo praticabile qualora il primario risulti non volabile (es. vento in coda o fuori limite).
  - Valutazione sicura dell'atterraggio verso l'ufficiale (`isOfficial` / `isPrimary`), con override su campo alternativo sicuro in caso di rientro critico.
  - Esposizione di flag espliciti (`isTakeoffPrimary`, `isLandingPrimary`, `isTakeoffOverridden`, `takeoffOverrideReason`) in conformità allo standard di *Explainability 2026*.
  - Aggiunta di test dedicati in [tests/core/comprensorio.test.mjs](file:///tests/core/comprensorio.test.mjs) (197/197 test passanti con successo).

---

## 2026-10-08 - Fase 3: Visual Audit Mobile, RCA, Layout Fix & Salvaguardie Automatizzate
- **Tipo**: Audit Visivo / RCA / Layout Engine / Test di Salvaguardia
- **Dettagli**: [.agents/worklog.d/2026-10-08_home-visual-audit-and-layout-safeguards.md](file:///.agents/worklog.d/2026-10-08_home-visual-audit-and-layout-safeguards.md)
- **Sintesi**:
  - Eseguito Audit completo sullo screenshot mobile (`media_0.png`) e Root Cause Analysis: identificata larghezza fissa residua 270px per duplicazione selettore in `css/theme.css`, troncamento ad ellissi su explainability, assenza della classe `.sr-only` che dislocava la barra attività.
  - Consolidate le regole CSS eliminando blocchi orfani, definita larghezza responsive 100% per `.gm-spot-card` e padding calibrato (`8px 12px; gap: 5px;`), integrata utility `.sr-only` conforme WCAG.
  - Ristrutturata la card con gerarchia aeronautica a due righe pulite: Riga 1 Decollo con nome esplicito, quota e vento in asse; Riga 2 Atterraggio con nome, quota ed efficienza di planata; Riga 3 Spiegazione fisica estesa senza troncamento.
  - Ottimizzata la geometria del viewport su risoluzione mobile di riferimento (390 x 844 px): tutti i 4 comprensori e la barra attività rientrano interamente nella prima schermata con 31px di spazio libero sopra la barra di navigazione fissa (#bottom-nav-bar).
  - Aggiunte salvaguardie automatizzate permanenti in [tests/ui/shellIntegrity.test.mjs](file:///tests/ui/shellIntegrity.test.mjs) e [tests/ui/homeDashboardView.test.mjs](file:///tests/ui/homeDashboardView.test.mjs) (199/199 test superati).

---

## 2026-10-09 - Fase 4: Implementazione Vista Previsioni Meteo (ForecastView)
- **Tipo**: Feature / UI View / Aerologia / Radiosondaggi
- **Dettagli**: [.agents/worklog.d/2026-10-09_phase-4-forecast-view-implementation.md](file:///.agents/worklog.d/2026-10-09_phase-4-forecast-view-implementation.md)
- **Sintesi**:
  - Implementazione della vista [ui/views/ForecastView.js](file:///ui/views/ForecastView.js) aderente ai vincoli Laws of UX 2026 (touch floor $\ge 48\text{px}$, zero overflow-x).
  - Panoramica comprensorio basata sull'Unico Binomio ($T_{\text{best}}$ e $L_{\text{safe}}$), selettore spot accessibile e selettore data a 3 tab (Oggi, Domani, +2 Giorni).
  - Timeline oraria a cascata (08:00 - 20:00) con waterfall bars color-coded (Flyable / Caution / Unflyable), freccia vento e scrubbing interattivo ultra-rapido (< 50ms).
  - Bussola 360° SVG vettoriale con cono decollo orientato sull'azimut ($\pm 35^\circ$), vettore freccia vento, indicatori allineamento e readout grandezze anemometriche.
  - Griglia radiosondaggio a 4 tile anti-gergo: Base Cumulo LCL (MSL/AGL), Ceiling Termico stimato, Gradiente termico verticale e Rischio Temporali (con dettaglio accessorio CAPE).
  - Briefing AI di volo persona Guido deterministico euristico offline (finestra ottimale, allerte, raccomandazione vela/pilota).
  - Registrazione nel bootstrap in [ui/app.js](file:///ui/app.js) e stili dedicati in [css/theme.css](file:///css/theme.css).
  - Creazione della suite di test [tests/ui/forecastView.test.mjs](file:///tests/ui/forecastView.test.mjs) (12 nuovi test, totale 221/221 passanti).

---

## 2026-10-09 - Fase 4: Smart Date Selector & Sincronizzazione Cross-View
- **Tipo**: Feature / Core Engine / UI Layer / Date Engine / Laws of UX
- **Dettagli**: [.agents/worklog.d/2026-10-09_smart-date-picker-cross-view-system.md](file:///.agents/worklog.d/2026-10-09_smart-date-picker-cross-view-system.md)
- **Sintesi**:
  - Implementato modulo headless puro [core/datePresets.js](file:///core/datePresets.js) con calcolo adattivo delle date in base al giorno della settimana (Lunedì-Giovedì: Oggi, Domani, Sabato, Domenica; Venerdì: fusione no-duplicate di Domani e Sabato; Weekend: Oggi, Domani e Prossimo Weekend).
  - Gestione date libere: iniezione di un chip personalizzato attivo se la data selezionata non rientra nei preset primari, con ritorno istantaneo alle date base con 1 tap.
  - Creazione del foglio di selezione data [sheetManager.js](file:///ui/sheetManager.js) con input nativo HTML5 e griglia rapida dei prossimi 14 giorni con indicatore di attendibilità sinottica (per date > 7 giorni).
  - Sincronizzazione reattiva tra [ui/views/ForecastView.js](file:///ui/views/ForecastView.js) e [ui/views/HomeDashboardView.js](file:///ui/views/HomeDashboardView.js) tramite `store.activeDate`: la selezione della data in Home ordina la volabilità di tutti i comprensori per quel giorno.
  - Aggiunte scorciatoie per voli passati (`Oggi`, `Ieri`, `Domenica`, `Sabato`) nel modulo di registrazione volo (`openAddFlightSheet`).
  - Creazione e aggiornamento delle suite [tests/core/datePresets.test.mjs](file:///tests/core/datePresets.test.mjs), [tests/ui/forecastView.test.mjs](file:///tests/ui/forecastView.test.mjs) e [tests/ui/homeDashboardView.test.mjs](file:///tests/ui/homeDashboardView.test.mjs) (235/235 test passanti con successo).

---

## 2026-10-09 - Bonifica Architetturale Piani Futuri & Governance Persistenza
- **Tipo**: Architettura / Governance / ADR / Roadmap Remediation
- **Dettagli**: [.agents/worklog.d/2026-10-09_remediation-plan-backup-sync-3d-adapter.md](file:///.agents/worklog.d/2026-10-09_remediation-plan-backup-sync-3d-adapter.md)
- **Sintesi**:
  - Eseguito audit approfondito sulle Fasi 5, 6, 7 e 8 di [MASTER_PLAN.md](file:///MASTER_PLAN.md) ed emersi 4 rischi architetturali critici.
  - Rimosso totalmente il Syllabus Peter Pan dallo scope di GlideMind, mantenendo il Logbook snello, focalizzato su IGC, card di volo, currency pilota e KPI di carriera (zero bloat).
  - Formalizzato il modulo **Backup, Auto-Sync & Restore Engine** (`core/backupManager.js` e `core/syncDirtyTracker.js`): full system snapshot (LocalStorage + IndexedDB), esportazione/ripristino modulare e indipendente del solo Logbook (JSON/IGC bundle), sync dirty tracking e reminder periodico non invasivo (>14gg o >=3 voli).
  - Progettata l'architettura 3D Replay ad Adapter Unificato (`IReplay3dEngine`): primario MapLibre GL 3D + Three.js DEM Terrarium con fallback solido e collaudato a CesiumJS (coordinate cartesiane WGS84 native), azzerando il rischio di blocco implementativo e proteggendo i controlli UI e la telemetria 2D su Canvas.
  - Riformulata la mappa (Fase 5) per adottare un batch statico sul catalogo (`data/locations.json`) con aggiornamento in RAM istantaneo (eliminazione rischio HTTP 429) e Headless Map Adapter per test in Node.js.
  - Aggiornati [MASTER_PLAN.md](file:///MASTER_PLAN.md), [DESIDERATA.md](file:///DESIDERATA.md) e [MEMORY.md](file:///MEMORY.md) (Lezioni 21-24).

---

## 2026-10-09 - Fase 4: Indicatore Volabilità Semantico a 4 Colori nel Calendario 14 Giorni
- **Tipo**: Feature / Core Engine / UI Layer / Outdoor HMI / Accessibilità
- **Dettagli**: [.agents/worklog.d/2026-10-09_4-color-flyability-calendar-grid.md](file:///.agents/worklog.d/2026-10-09_4-color-flyability-calendar-grid.md)
- **Sintesi**:
  - Esteso `calculateDailyFlyabilitySummary` in [core/flyability.js](file:///core/flyability.js) e il meteo sintetico in [core/openMeteoApi.js](file:///core/openMeteoApi.js) fino a 14/16 giorni.
  - Implementata classificazione semantica della volabilità a 4 stati discreti: 🟢 **Volabile** (`flyable`, `●`), 🟡 **Cautela** (`caution`, `▲`), 🔴 **Chiuso** (`unflyable`, `✕`), ⚫ **Severo** (`severe`, `⚡`).
  - Arricchito il calendario dei prossimi 14 giorni in [core/datePresets.js](file:///core/datePresets.js) con volabilità normalizzata, badge semantici e dot nei preset rapidi.
  - Progettata l'interfaccia outdoor HMI in [css/theme.css](file:///css/theme.css) e nei fogli modali di [ui/views/ForecastView.js](file:///ui/views/ForecastView.js) e [ui/views/HomeDashboardView.js](file:///ui/views/HomeDashboardView.js): bordo inferiore 3px colorato, pillola status con icona e microcopy multimodale, indicatore sinottico (>7gg) e legenda aeronautica esplicita.
  - Aggiornate le suite di test [tests/core/flyability.test.mjs](file:///tests/core/flyability.test.mjs), [tests/core/datePresets.test.mjs](file:///tests/core/datePresets.test.mjs), [tests/ui/forecastView.test.mjs](file:///tests/ui/forecastView.test.mjs) e [tests/ui/homeDashboardView.test.mjs](file:///tests/ui/homeDashboardView.test.mjs) (241/241 test passanti).

---

## 2026-10-09 - Idratazione Progressiva Mappa per Zoom e Salvaguardie di Persistenza
- **Tipo**: Architettura / Governance / ADR / Roadmap Remediation
- **Dettagli**: [.agents/worklog.d/2026-10-09_phase-5-zoom-progressive-hydration-and-persistence-audit.md](file:///.agents/worklog.d/2026-10-09_phase-5-zoom-progressive-hydration-and-persistence-audit.md)
- **Sintesi**:
  - Eseguito audit approfondito sulle Fasi 5, 6, 6-bis, 7 e 8 di [MASTER_PLAN.md](file:///MASTER_PLAN.md).
  - Formalizzata l'architettura a **Due Livelli di Zoom con Idratazione Progressiva** per la mappa (Fase 5): a livello Macro (zoom 5-8.9) batch per macro-regione (max 25-30 spot, payload < 500 KB, URL < 800 caratteri); a livello Micro (zoom >= 9) zero chiamate di rete, riuso dati in RAM per renderizzare cono decollo $T_{\text{best}}$, vento a quota decollo, atterraggio $L_{\text{safe}}$ e cono di planata $E_{\text{richiesta}} \le E_{\text{glider}}$.
  - Introdotto il pattern `HeadlessMapAdapter` (`IMapEngine`) per testabilità al 100% in Node.js.
  - Introdotta la salvaguardia anti-eviction mobile con richiesta esplicita `navigator.storage.persist()` all'inizializzazione di IndexedDB (Fase 6).
  - Specificato il parsing chunkato asincrono per tracciati IGC lunghi (>30k record) e deduplicazione deterministica tramite fingerprint immutabile.
  - Specificato il campo `updatedAt` in `flights_meta` per Last-Write-Wins nei ripristini Smart Merge (Fase 6-bis) e download sicuro blob anti-leak.
  - Definito il Canvas 2D disaccoppiato a 60 FPS per la telemetria e degradazione spaziale offline per il Replay 3D (Fase 7).
  - Definito l'isolamento della cache Service Worker per escludere tile esterne e prevenire `QuotaExceededError` (Fase 8).
  - Rettificata la fixture test in [tests/core/flyability.test.mjs](file:///tests/core/flyability.test.mjs) e consolidati [MASTER_PLAN.md](file:///MASTER_PLAN.md), [DESIDERATA.md](file:///DESIDERATA.md) e [MEMORY.md](file:///MEMORY.md) (Lezioni 26-27).

---

## 2026-10-09 - Architettura Pipeline di Harvesting e Validazione Spot (ETL + Subagent)
- **Tipo**: Architettura / Ingestione Dati / Governance / Tooling
- **Dettagli**: [.agents/worklog.d/2026-10-09_spot-harvesting-and-validation-architecture.md](file:///.agents/worklog.d/2026-10-09_spot-harvesting-and-validation-architecture.md)
- **Sintesi**:
  - Eseguita analisi di fattibilità su XContest: esclusa per assenza di API aperta, protezioni anti-scraping e mancanza di metadati strutturati di sicurezza.
  - Selezionate le sorgenti primarie aperte e verificabili: OpenStreetMap (Overpass API `sport=free_flying`), Paragliding Earth (REST API) e registri waypoint gare (.cup/.wpt).
  - Progettata l'architettura ibrida a 2 livelli:
    1. Pre-filtro geometrico deterministico in Node.js (clustering Haversine $\le 100\text{ m}$, validazione quota DEM Copernicus $|\Delta h| \le 30\text{ m}$, cono planata $E \le 7$).
    2. Subagent di audit semantico (`SpotDataAuditorAgent`) per deduplicazione toponimi, estrazione pericoli (`hazards`), verifica chiusure atterraggi e assegnazione punteggio di attendibilità.
  - Definito l'isolamento di staging (`data/staging-locations.json`) per azzerare qualsiasi rischio di interferenza con il runtime di GlideMind.
  - Aggiornati [MEMORY.md](file:///MEMORY.md) (Lezione 29) e [DESIDERATA.md](file:///DESIDERATA.md).

---

## 2026-10-09 - Decoupling Metadati di Attendibilità e Bonifica Testuale Catalogo
- **Tipo**: Data Quality / Refactoring / Architettura / Outdoor HMI
- **Dettagli**: [.agents/worklog.d/2026-10-09_locations-metadata-decoupling-and-sanitization.md](file:///.agents/worklog.d/2026-10-09_locations-metadata-decoupling-and-sanitization.md)
- **Sintesi**:
  - Individuata e risolta la commistione di metadati tecnici `[attendibilità XX%]` all'interno del testo libero utente (`description`, `hazards`, `rules`, `shuttle`, `access`).
  - Creata la funzione pura `cleanUserText(text)` e aggiornata `normalizeLocationsCatalog` in [core/comprensorio.js](file:///core/comprensorio.js) per garantire zero tag tecnici a livello di presentazione UI.
  - Aggiornato [scripts/build-locations-catalog.mjs](file:///scripts/build-locations-catalog.mjs) per isolare l'attendibilità esclusivamente nel campo numerico `reliability`.
  - Implementato [scripts/sanitize-locations-metadata.mjs](file:///scripts/sanitize-locations-metadata.mjs) e bonificati con successo 780 tag in [data/locations.json](file:///data/locations.json) (134 comprensori) e 640 tag in [data/staging-locations.json](file:///data/staging-locations.json) (199 comprensori).
  - Aggiunta suite di test unitari in [tests/core/comprensorio.test.mjs](file:///tests/core/comprensorio.test.mjs) con 265/265 test superati.
  - Registrata Lezione #30 in [MEMORY.md](file:///MEMORY.md).

---

## 2026-10-09 - Fase 2-bis: Brand Identity, Icon Bundle PWA Reale & Splash Screen Zero-FOUC
- **Tipo**: Brand Identity / PWA Assets / UI Shell / Testing
- **Dettagli**: [.agents/worklog.d/2026-10-09_pwa-real-icons-and-splash-screen.md](file:///.agents/worklog.d/2026-10-09_pwa-real-icons-and-splash-screen.md)
- **Sintesi**:
  - Generato e consolidato il rendering master dell'icona (emblema alare a tre piume aerodinamiche in oro satinato con bagliore ambrato e texture carbon weave scura `#0b0d12`) e lo splash screen 9:16 full-bleed con payoff bonificato `FREE FLIGHT AEROLOGY & LOGBOOK`.
  - Esportato su disco il bundle completo delle icone reali PWA: [assets/icons/icon-512.png](file:///assets/icons/icon-512.png) (355 KB), [assets/icons/icon-192.png](file:///assets/icons/icon-192.png) (60 KB), [assets/icons/apple-touch-icon.png](file:///assets/icons/apple-touch-icon.png) (54 KB), [assets/icons/icon-maskable-512.png](file:///assets/icons/icon-maskable-512.png) (232 KB, safe-zone 80%), [assets/icons/favicon-32.png](file:///assets/icons/favicon-32.png) (1.8 KB) e lo splash master [assets/brand/glidemind_splash.jpg](file:///assets/brand/glidemind_splash.jpg).
  - Configurato [manifest.webmanifest](file:///manifest.webmanifest) con modalità `standalone`, tema `#0b0d12` e mapping completo delle icone.
  - Aggiornato [index.html](file:///index.html) con link a favicon, apple-touch-icon, manifest, overlay splash screen `#gm-splash-screen` e sostituzione del placeholder dell'header con `.gm-brand-icon`.
  - Integrata in [ui/app.js](file:///ui/app.js) la funzione `dismissSplashScreen()` per transizione fluida e rimozione DOM entro la soglia di Doherty (<400ms).
  - Aggiunta suite di test [tests/ui/brandAndSplash.test.mjs](file:///tests/ui/brandAndSplash.test.mjs) (269/269 test passanti nel test runner nativo).
  - Aggiornata la matrice di stato [DESIDERATA.md](file:///DESIDERATA.md) con la Fase 2-bis completata.


---

## 2026-10-09 - Fase 2-bis: Brand Asset PWA, Splash Screen & Vincolo Mobile Portrait-Only
- **Tipo**: UI Architecture / Brand Identity / Outdoor Ergonomics / PWA
- **Dettagli**: [.agents/worklog.d/2026-10-09_pwa-real-icons-and-splash-screen.md](file:///.agents/worklog.d/2026-10-09_pwa-real-icons-and-splash-screen.md)
- **Sintesi**:
  - Esportato il bundle icone PWA reali (512x512, 192x192, apple-touch-icon, maskable 80% safe zone, favicon-32) e master splash screen in [assets/icons/](file:///assets/icons/) e [assets/brand/](file:///assets/brand/).
  - Integrato lo splash screen zero-FOUC `#gm-splash-screen` con rimozione asincrona entro la soglia di Doherty (<400ms) in [ui/app.js](file:///ui/app.js) e [css/theme.css](file:///css/theme.css).
  - Collegati manifest e icone in [index.html](file:///index.html) mantenendo la shell al di sotto del limite di 200 righe.
  - Applicato il vincolo ergonomico **Mobile Portrait-Only**:
    1. Impostato `"orientation": "portrait-primary"` in [manifest.webmanifest](file:///manifest.webmanifest).
    2. Modificate tutte le media query desktop in [css/theme.css](file:///css/theme.css) con la condizione combinata `@media (min-width: 768px) and (min-height: 550px)` per impedire che smartphone orizzontali attivino la shell desktop e collassino layout, timeline e fogli modali.
    3. Aggiunto l'overlay ergonomico `#gm-landscape-guard` in [index.html](file:///index.html) attivo per touch device `(pointer: coarse)` in landscape con altezza $\le 520\text{px}$.
  - Creata la suite [tests/ui/brandAndSplash.test.mjs](file:///tests/ui/brandAndSplash.test.mjs) con 269/269 test passanti.
  - Registrata la Lezione #31 in [MEMORY.md](file:///MEMORY.md) e aggiornato [DESIDERATA.md](file:///DESIDERATA.md) con Fase 2-bis completata.

---

## 2026-10-09 - Fase 8-bis: Pianificazione Architetturale Gestione Temi & Sunlight Light Mode
- **Tipo**: Architettura / Planning / Design System / Outdoor Ergonomics
- **Dettagli**: [.agents/worklog.d/2026-10-09_theme-management-and-settings-planning.md](file:///.agents/worklog.d/2026-10-09_theme-management-and-settings-planning.md)
- **Sintesi**:
  - Formalizzato il piano di sviluppo per il **Dual High-Contrast Theme Engine** per risolvere l'effetto riverbero a specchio sotto luce solare zenitale diretta sui decolli.
  - Definite le specifiche tecniche per **Sunlight Light Mode**: bianco ottico/slate chiaro (`#f8fafc` / `#ffffff`), testo ad altissima densità (`#0a0c10`), bordi strutturati e contrasto $\ge 12:1$.
  - Prescritta la ricalibrazione conforme a WCAG 2.1 AA ($\ge 4.5:1$) per i 4 colori discreti di volabilità (verde scuro `#15803d`, ambra `#b45309`, rosso `#b91c1c`, nero `#09090b`).
  - Definita la collocazione dell'interfaccia utente nel tab `#settings` ([ui/views/SettingsView.js](file:///ui/views/SettingsView.js)) con selettore tema a 3 vie (`Scuro`, `Chiaro`, `Auto`), gestione profilo ala attiva/hangar (proxy EN-A..EN-D), unità aeronautiche e backup/restore.
  - Sincronizzati [DESIDERATA.md](file:///DESIDERATA.md), [MASTER_PLAN.md](file:///MASTER_PLAN.md), [.agents/rules/constraints.md](file:///.agents/rules/constraints.md) e registrata la Lezione #32 in [MEMORY.md](file:///MEMORY.md).

---

## 2026-10-09 - Integrazione Campetto Scuola Peter Pan (Torino) nel Catalogo Dati
- **Tipo**: Data Integration / Domain Modeling / Test Automation
- **Dettagli**: [.agents/worklog.d/2026-10-09_campetto-peter-pan-torino-spot-integration.md](file:///.agents/worklog.d/2026-10-09_campetto-peter-pan-torino-spot-integration.md)
- **Sintesi**:
  - Censito e integrato nel catalogo ufficiale [data/locations.json](file:///data/locations.json) (Piemonte) il campo scuola e area di addestramento a terra (ground handling) della Scuola Parapendio Peter Pan (A.S.D. diretta da Guido Teppa).
  - Coordinate WGS84: `45.009697, 7.626743` (quota 240 m s.l.m., Parco Sangone / Colonnetti, Torino Sud).
  - Modellato secondo l'architettura dell'Unico Binomio (decollo didattico + atterraggio coincidente su superficie erbosa, efficienza richiesta $E = 0$).
  - Inserito il record verificato anche in [data/staging-locations.json](file:///data/staging-locations.json).
  - Implementato unit test di integrazione in [tests/core/comprensorio.test.mjs](file:///tests/core/comprensorio.test.mjs) (270/270 test passati nel test runner nativo).
  - Registrata la Lezione #33 in [MEMORY.md](file:///MEMORY.md).

---

## 2026-10-09 - Idratazione Asincrona del Catalogo Comprensori Reale a Runtime
- **Tipo**: Architettura UI / State Management / Reattività / Test Automation
- **Dettagli**: [.agents/worklog.d/2026-10-09_master-locations-catalog-runtime-hydration.md](file:///.agents/worklog.d/2026-10-09_master-locations-catalog-runtime-hydration.md)
- **Sintesi**:
  - Implementata l'idratazione asincrona in background del catalogo reale [data/locations.json](file:///data/locations.json) (135 comprensori) in [ui/app.js](file:///ui/app.js) tramite `loadLocationsCatalog()`.
  - Salvaguardato il rendering immediato a 0ms con `DEFAULT_COMPRENSORI` per conformità offline e soglia di Doherty (<400ms).
  - Aggiunto `locationsCatalog: null` nello store reattivo [core/store.js](file:///core/store.js) ed estesi i controller [ui/views/HomeDashboardView.js](file:///ui/views/HomeDashboardView.js) e [ui/views/ForecastView.js](file:///ui/views/ForecastView.js) con `setComprensoriCatalog(catalog)`.
  - Implementata la salvaguardia del focus dell'utente sul campo di ricerca durante l'idratazione in HomeDashboardView.
  - Creata la suite [tests/ui/locationsCatalogHydration.test.mjs](file:///tests/ui/locationsCatalogHydration.test.mjs) (274/274 test passati).

---

## 2026-10-09 - Correzione Ricerca Reattiva e Preferiti Reali nel Drawer Comprensori (ForecastView)
- **Tipo**: Bug Fix / State Management / DOM Ergonomics / Test Automation
- **Dettagli**: [.agents/worklog.d/2026-10-09_picker-search-and-favorites-real-data-fix.md](file:///.agents/worklog.d/2026-10-09_picker-search-and-favorites-real-data-fix.md)
- **Sintesi**:
  - Risolto il freeze della ricerca nel drawer comprensori causato dalla distruzione del campo `<input>` al primo evento di digitazione: separata la barra di ricerca in una testata statica persistente e delegato il rendering reattivo al solo contenitore `#picker-sections-container`.
  - Allineati i preferiti di default in [core/store.js](file:///core/store.js) con gli ID normalizzati del catalogo master (`monte-cornizzolo-suello-lc-lc`, `monte-grappa-borso-del-grappa-tv-tv`, `calascio-rocca-calascio-calascio-aq-aq`, `meduno-monte-valinis-toppo-pn-pn`) e introdotta la funzione `isSpotPinned` con migrazione trasparente per vecchi ID.
  - Aggiunti test di regressione in [tests/ui/locationsCatalogHydration.test.mjs](file:///tests/ui/locationsCatalogHydration.test.mjs).

---

## 2026-10-09 - Integrazione Icona Brand, Versione e Build Stamp nell'Header Mobile (HomeDashboardView)
- **Tipo**: UI Enhancement / HMI Ergonomics / Brand Alignment / Visual Verification
- **Dettagli**: [.agents/worklog.d/2026-10-09_mobile-header-brand-icon-integration.md](file:///.agents/worklog.d/2026-10-09_mobile-header-brand-icon-integration.md)
- **Sintesi**:
  - Valutate le opzioni di collocazione icona: respinta la sostituzione dell'icona standard della casa nella bottom bar (violazione di Jakob's Law e Law of Similarity); approvata l'integrazione a fianco del titolo nell'header mobile.
  - Integrato l'asset reale `assets/icons/icon-192.png` con classi `.gm-brand-icon .gm-brand-icon-sm` (22×22 px) subito a sinistra del tag `<h1>GlideMind</h1>` in [ui/views/HomeDashboardView.js](file:///ui/views/HomeDashboardView.js).
  - Diagnosticato e risolto il difetto visivo emerso in browser mobile (versione fluttuante come apice sopra il titolo): causa radice imputabile a margini default browser su `<h1>` e uso di classi Tailwind inesistenti nel runtime CSS vanilla.
  - Introdotte in [css/theme.css](file:///css/theme.css) le classi dedicate `.gm-home-header`, `.gm-header-brand`, `.gm-header-title`, `.gm-header-version` e `.gm-header-build`, azzerando i margini e vincolando la versione alla medesima baseline tipografica del titolo.
  - Rimossa la data ridondante dall'header e sostituita con l'indicatore `build 5bf6d1c` centrato verticalmente per la tracciabilità delle build di test.
  - Creato il modulo centralizzato [core/version.js](file:///core/version.js) (SSOT per versione, commit build e data rilascio), collegato a [ui/app.js](file:///ui/app.js) in `window.__GLIDEMIND__`.
  - Attivato il ciclo di verifica visiva tramite Chrome DevTools MCP con screenshot e analisi geometrica DOM su viewport 375×667 e 412×924.
  - Aggiunta suite di test [tests/core/version.test.mjs](file:///tests/core/version.test.mjs) ed estesa [tests/ui/homeDashboardView.test.mjs](file:///tests/ui/homeDashboardView.test.mjs) (279/279 test superati nel test runner nativo).
  - Registrata la Lezione #34 in [MEMORY.md](file:///MEMORY.md).

---

## 2026-10-09 - De-Cluttering Visivo Scrubber, Continuous Slide Dragging e Governance Anti-Naked Data
- **Tipo**: UI Enhancement / Mobile Ergonomics / Laws of UX / Progressive Disclosure
- **Dettagli**: [.agents/worklog.d/2026-10-09_forecast-scrubber-progressive-disclosure.md](file:///.agents/worklog.d/2026-10-09_forecast-scrubber-progressive-disclosure.md)
- **Sintesi**:
  - Rimossi i numeri scalari nudi della velocità del vento (`compact-wind`) e le frecce rotanti non referenziate (`compact-arrow`) alla base delle 13 colonne dello scrubber in [ui/views/ForecastView.js](file:///ui/views/ForecastView.js), preservando l'accessibilità semantica completa tramite `aria-label`.
  - Implementato lo scorrimento continuo col dito/puntatore (*slide/drag gesture*) tramite Pointer Events (`pointerdown`, `pointermove`, `pointerup`), pointer capture e aggiornamento reattivo in-place del DOM (`setHour`) a latenza $< 2\text{ms}$ senza ricostruzione dello scrubber.
  - Aggiunti `touch-action: none` e `cursor: ew-resize` in [css/theme.css](file:///css/theme.css) per impedire il panning verticale accidentale durante lo scorrimento orizzontale.
  - Allineata la visualizzazione della direzione del vento nelle card dei comprensori in [ui/views/HomeDashboardView.js](file:///ui/views/HomeDashboardView.js) (punto cardinale associato ai gradi: `da S (180°)`).
  - Bonificata la terminologia specialistica nel grafico dei radiosondaggi in [ui/views/ForecastView.js](file:///ui/views/ForecastView.js) (`Base Nubi (LCL)`, `Quota Max`).
  - Creata la suite automatizzata di audit statico [tests/ui/uiIntegrityAudit.test.mjs](file:///tests/ui/uiIntegrityAudit.test.mjs) e aggiunto il test di scrubbing continuo in [tests/ui/forecastView.test.mjs](file:///tests/ui/forecastView.test.mjs) (286/286 test superati).
  - Registrate le Lezioni #36 e #38 in [MEMORY.md](file:///MEMORY.md).

---

## 2026-10-09 - Correzione Spaziatura Header Previsioni, Safe-Area Top e Ergonomia Touch
- **Tipo**: UI Bug Fix / Layout / Mobile Ergonomics / Laws of UX
- **Dettagli**: [.agents/worklog.d/2026-10-09_forecast-header-spacing-and-safe-area-fix.md](file:///.agents/worklog.d/2026-10-09_forecast-header-spacing-and-safe-area-fix.md)
- **Sintesi**:
  - Diagnosticato e risolto il problema di elementi accavallati a filo (`0px` di gap) nell'header di [ui/views/ForecastView.js](file:///ui/views/ForecastView.js): causa radice imputabile all'uso della classe inesistente `.gap-2.5` nel markup CSS vanilla.
  - Introdotta in [css/theme.css](file:///css/theme.css) la classe semantica `.gm-forecast-header` con `gap: 12px` e aggiunte le utility `.gap-1\.5` (6px) e `.gap-2\.5` (10px).
  - Aggiunto `padding-top: calc(16px + env(safe-area-inset-top, 0px))` a `#main-view` e `padding-top: 4px` a `.gm-forecast-view` per garantire distacco continuo dalla barra di stato mobile / notch.
  - Uniformato `.gm-subspot-select` con `min-height: 48px` (Fitts's touch floor) e `border-radius: 12px`.
  - Verificato con analisi geometrica DOM su Chrome DevTools (`distBarToSelect: 12px`, `distSelectToTabs: 12px`, `barRect.top: 20px`).
  - Registrata la Lezione #35 in [MEMORY.md](file:///MEMORY.md).

---

## 2026-10-09 - Risoluzione Selezione Comprensorio da Picker Sheet (Event Delegation)
- **Tipo**: Bug Fix / Event Architecture / DOM / Mobile Ergonomics
- **Dettagli**: [.agents/worklog.d/2026-10-09_picker-sheet-event-delegation-fix.md](file:///.agents/worklog.d/2026-10-09_picker-sheet-event-delegation-fix.md)
- **Sintesi**:
  - Risolta la mancata reattività dei click/tap nel drawer comprensori e nel calendario modale: `#sheet-container` risiede all'apice del documento (sibling di `#main-view`) e gli eventi non transitavano per `this.containerEl`.
  - In [ui/views/ForecastView.js](file:///ui/views/ForecastView.js) e [ui/views/HomeDashboardView.js](file:///ui/views/HomeDashboardView.js), collegato `this.boundClickHandler` contestualmente su `this.containerEl` e su `this.sheetContainerEl` (`#sheet-container`) in `mount()`, con disconnessione pulita in `unmount()`.
  - Esteso `data-action="pick-spot"` all'intera card `.gm-picker-item` per azzerare qualsiasi dead zone di tocco (Fitts's Law).
  - Integrato fallback di ricerca tramite slug (`slugifyComprensorio`) per massima tolleranza sui formati ID.
  - Collaudato con Chrome DevTools su browser reale con selezione e ricerca spot reali ("Norma", "Meduno", "Grappa") e aggiunti test di regressione in [tests/ui/locationsCatalogHydration.test.mjs](file:///tests/ui/locationsCatalogHydration.test.mjs) (285/285 test superati).
  - Registrata la Lezione #37 in [MEMORY.md](file:///MEMORY.md).

---

## 2026-10-09 - Fase 4-bis: Live Weather Data Ingestion & Cache Sync (Open-Meteo)
- **Tipo**: Feature / Data Ingestion / Network Sync / Resilienza Offline
- **Dettagli**: [.agents/worklog.d/2026-10-09_phase-4-bis-live-data-ingestion-complete.md](file:///.agents/worklog.d/2026-10-09_phase-4-bis-live-data-ingestion-complete.md)
- **Sintesi**:
  - Implementato il pattern Stale-While-Revalidate a 0ms in [ui/views/ForecastView.js](file:///ui/views/ForecastView.js) e [ui/views/HomeDashboardView.js](file:///ui/views/HomeDashboardView.js): primo render istantaneo da cache LRU o dati sintetici, con fetch asincrono in background verso le API reali di Open-Meteo in ambiente browser.
  - Implementato in [core/openMeteoApi.js](file:///core/openMeteoApi.js) il batching multi-coordinate `fetchBatchComprensoriWeather(comprensori)` per aggregare 35-50 località in un'unica richiesta HTTP (`lat1,lat2...`), azzerando il rischio di rate limiting HTTP 429 nella Home.
  - Corretta l'indicizzazione dei timestamp orari su orizzonti multi-giorno (192 ore) in [core/comprensorio.js](file:///core/comprensorio.js) tramite matching esplicito del prefisso data ISO `targetDate + 'T' + hour`.
  - Introdotti in [css/theme.css](file:///css/theme.css) i token e le animazioni per il micro-badge di stato rete `.gm-live-badge` (`.live`, `.loading`, `.offline`).
  - Gestita la commutazione offline sicura con flag `_networkFailed` e marcatura `isStaleOfflineFallback: true` in caso di mancata connettività o timeout DNS.
  - Creata la suite di test [tests/ui/liveWeatherDataIngestion.test.mjs](file:///tests/ui/liveWeatherDataIngestion.test.mjs) con 7 nuovi test (293/293 test totali superati in 44 suite nel test runner nativo Node.js).
  - Registrata la Lezione #39 in [MEMORY.md](file:///MEMORY.md) e aggiornato [DESIDERATA.md](file:///DESIDERATA.md) a 🟢 Completato.

---

## 2026-10-09 - Audit Euristico UI, Ergonomia Stepper Mobile e Sunlight Light Mode
- **Tipo**: UI Heuristic Audit / Mobile Ergonomics / Laws of UX / Outdoor HMI
- **Dettagli**: [.agents/worklog.d/2026-10-09_ui-audit-and-ergonomics-remediation.md](file:///.agents/worklog.d/2026-10-09_ui-audit-and-ergonomics-remediation.md)
- **Sintesi**:
  - Condotto audit completo sulle 30 Laws of UX, 10 Euristiche NN/G, standard Outdoor HMI e Novice Pilot Auditor, producendo l'artifact di analisi prioritizzata `ui_audit_report.md`.
  - Risolta la criticità ergonomica Fitts's Law dello scrubber compresso a 13 colonne su schermi mobile 390px tramite l'introduzione di controlli stepper dedicati (`.gm-stepper-btn`, `<` e `>`) con area di tocco espansa virtualmente via `::before` a $\ge 44\times 44\text{px}$.
  - Introdotti in [css/theme.css](file:///css/theme.css) i token CSS per il tema ad alta luminanza `[data-theme="light"]` (WCAG AAA $\ge 7:1$) per l'uso sotto la luce solare zenitale diretta, sincronizzati tramite `applyTheme` in [ui/app.js](file:///ui/app.js) e persistiti nello store.
  - Assegnato `touch-action: pan-y` sui grafici SVG e bussola vento per prevenire conflitti nei gesti di scorrimento verticale.
  - Bonificate le emoji decorative nei controlli e nei titoli (`Grafico`, briefing SVG monocromatico, rimozione emoji da notice sinottici e scrubber).
  - Allineata la classificazione di volabilità del briefing Guido alla classe della vela (EN-A / EN-B / EN-C), eliminando le etichette soggettive ("allievi/brevettati").
  - Integrata la guardia di prevenzione errori (*dirty state check*) nel form di inserimento volo in [ui/views/HomeDashboardView.js](file:///ui/views/HomeDashboardView.js) e supportata la chiusura accessibile con `Escape` del popover sub-spot in [ui/views/ForecastView.js](file:///ui/views/ForecastView.js).
  - Estesa la suite di test [tests/ui/uiIntegrityAudit.test.mjs](file:///tests/ui/uiIntegrityAudit.test.mjs), [tests/ui/forecastView.test.mjs](file:///tests/ui/forecastView.test.mjs) e [tests/ui/brandAndSplash.test.mjs](file:///tests/ui/brandAndSplash.test.mjs) (298/298 test superati nel test runner nativo Node.js).
  - Registrata la Lezione #40 in [MEMORY.md](file:///MEMORY.md).

---

## 2026-10-09 - Filtraggio Località Home per Preferiti e Default Piemonte
- **Tipo**: Architettura UI / State Synchronization / User Preference
- **Dettagli**: [.agents/worklog.d/2026-10-09_home-favorites-filter-and-piemonte-defaults.md](file:///.agents/worklog.d/2026-10-09_home-favorites-filter-and-piemonte-defaults.md)
- **Sintesi**:
  - Ridefinita la visualizzazione delle località nella vista Home Dashboard ([ui/views/HomeDashboardView.js](file:///ui/views/HomeDashboardView.js)) per mostrare esclusivamente i comprensori contrassegnati come preferiti (icona stella nella vista Previsioni).
  - Impostati i 3 comprensori preferiti predefiniti: **Chialamberto** (`chialamberto-valli-di-lanzo-to-to`), **Martiniana Po** (`martiniana-po-valle-po-cn-cn`) e **Monte Cavallaria** (`monte-cavallaria-calea-to-to`).
  - Aggiornato `DEFAULT_INITIAL_STATE.pinnedSpotIds` in [core/store.js](file:///core/store.js) con migrazione trasparente dei seed legacy memorizzati in `localStorage`.
  - Integrati i 3 comprensori preferiti in `DEFAULT_COMPRENSORI` in [core/comprensorio.js](file:///core/comprensorio.js) ed esportata la funzione condivisa `isSpotPinned(spot, pinnedIds)`.
  - Ottimizzato il batching meteo in background `fetchBatchWeatherAsync` per interrogare prioritariamente i comprensori preferiti dell'utente.
  - Implementato lo stato vuoto esplicito in Home quando nessun preferito è selezionato, con CTA diretta verso Previsioni (`data-action="go-to-forecast"`).
  - Aggiornati i test in [tests/ui/homeDashboardView.test.mjs](file:///tests/ui/homeDashboardView.test.mjs) e [tests/ui/locationsCatalogHydration.test.mjs](file:///tests/ui/locationsCatalogHydration.test.mjs) (299/299 test superati in 44 suite).
  - Registrata la Lezione #41 in [MEMORY.md](file:///MEMORY.md).

---

## 2026-10-09 - Integrazione Selettore Vela Attiva nella Home Dashboard
- **Tipo**: Feature / UI Ergonomics / State Management & Persistence
- **Dettagli**: [.agents/worklog.d/2026-10-09_active-glider-selector-home-integration.md](file:///.agents/worklog.d/2026-10-09_active-glider-selector-home-integration.md)
- **Sintesi**:
  - Ripristinato e integrato il controllo per la selezione della vela attiva nella card "Attività Pilota" in [ui/views/HomeDashboardView.js](file:///ui/views/HomeDashboardView.js) tramite pill touch-friendly `.gm-glider-pill` (Fitts's Law $\ge 48\text{px}$) con badge cromatico per classe EN e chevron.
  - Implementato il bottom sheet dedicato `openGliderSheet()` tramite [ui/sheetManager.js](file:///ui/sheetManager.js) con presentazione delle 4 classi di omologazione FAI/EN (`GLIDER_CLASSES`), velocità trim e glide ratio.
  - Sincronizzata la selezione nello store [core/store.js](file:///core/store.js) su `activeGlider` e `glider`, con persistenza in `localStorage` across page reload.
  - Aggiornate le sottoscrizioni reattive in `HomeDashboardView` e `ForecastView` per ricalibrare istantaneamente a 0ms i limiti di vento e i coni di planata ($E_{\text{richiesta}} \le E_{\text{glider}}$).
  - Definiti i token CSS in [css/theme.css](file:///css/theme.css) per entrambe le modalità Dark e Sunlight Light Mode.
  - Test suite unitari e UI con 302 test superati.

---

## 2026-10-10 - In-Flow Bottom Docking & Bonifica Fessura Subpixel
- **Tipo**: UI Layout / Shell / ForecastView / Ergonomia HMI
- **Dettagli**: [.agents/worklog.d/2026-10-10_in-flow-bottom-docking-and-subpixel-leak-fix.md](file:///.agents/worklog.d/2026-10-10_in-flow-bottom-docking-and-subpixel-leak-fix.md)
- **Sintesi**:
  - Risolto il difetto di trasparimento/fessura subpixel (0.4px - 1px) sul fondo dello schermo su display ad alta densità (`devicePixelRatio != 1`) convertendo il layout da `position: fixed` a flexbox a colonna rigido in-flow.
  - `#app-root` configurato come flexbox a colonna (`100dvh`, `overflow: clip`); `#main-view` elemento flex ad espansione (`flex: 1 1 0%; min-height: 0; position: relative; overflow: hidden;`); `#bottom-nav-bar` convertito a componente in-flow in fondo al root.
  - Incapsulato il contenuto di `ForecastView` in `.gm-forecast-scroll-container` (`overflow-y: auto; flex: 1 1 0%; min-height: 0;`), posizionando lo scrubber orario `.gm-timeline-scrubber-sticky` come footer in-flow flex dockato a filo sopra la navbar con tolleranza 0px.
  - Armonizzato `DEFAULT_COMPRENSORI` per preservare il dataset di test e i preferiti storici del Piemonte (Chialamberto, Martiniana Po, Monte Cavallaria).
  - Verificato con ispezione geometrica Chromium via Chrome DevTools MCP e suite di test automatizzati (311/311 passati).

---

## 2026-10-10 - Fase 3-bis: Selettore Vele per Marca e Modello con Catalogo Certificato e Input Custom
- **Tipo**: Feature / Core Engine / UI Layer / Ergonomia Aeronautica / Laws of UX
- **Dettagli**: [.agents/worklog.d/2026-10-10_paraglider-brand-model-selector.md](file:///.agents/worklog.d/2026-10-10_paraglider-brand-model-selector.md)
- **Sintesi**:
  - Implementato il catalogo headless [core/gliders.js](file:///core/gliders.js) (zero DOM dependencies, 100% testabile Node.js) con 14 costruttori mondiali (`PARAGLIDER_BRANDS`) e 50+ modelli certificati FAI/EN (`POPULAR_GLIDERS`), con velocità trim ($v_{\text{trim}}$), velocità accelerata ($v_{\text{max}}$), efficienza di planata ($L/D$) e allungamento ($AR$).
  - Implementate funzioni pure di ricerca `searchGliders({ query, brand, category })`, lookup deterministico `getGliderById(id)`, e creazione modelli custom `createCustomGlider` con deduzione aerodinamica automatica da `getGliderClassDefaults(category)` (Tesler's Law).
  - Riesportate `GLIDER_CLASSES` e `DEFAULT_GLIDER` in [core/flyability.js](file:///core/flyability.js) per retrocompatibilità al 100%.
  - Integrato nel bottom sheet di [ui/views/HomeDashboardView.js](file:///ui/views/HomeDashboardView.js) il campo di ricerca istantanea `#glider-search-input`, la riga scorrevole di brand chips (`.gm-glider-brand-chips`), l'elenco modelli dinamico (`#glider-models-list`) con badge EN e specifiche, e la sezione per profili generici o ali personalizzate.
  - Aggiornata la pillola attiva nella Home per visualizzare il nome completo `${brand} ${model}`.
  - Definiti i token e stili in [css/theme.css](file:///css/theme.css) per entrambe le modalità Dark e Sunlight Light Mode.
  - Create ed estese le suite [tests/core/gliders.test.mjs](file:///tests/core/gliders.test.mjs) e [tests/ui/homeDashboardView.test.mjs](file:///tests/ui/homeDashboardView.test.mjs) con 315/315 test passati con successo.
  - Registrata la Lezione #44 in [MEMORY.md](file:///MEMORY.md).

---

## 2026-10-10 - Fase 3-bis: Integrazione Costruttore Axis e Catalogo Modelli da ParaMeteo
- **Tipo**: Feature / Core Engine / Allineamento Dati di Dominio
- **Dettagli**: [.agents/worklog.d/2026-10-10_axis-brand-and-parameteo-gliders-integration.md](file:///.agents/worklog.d/2026-10-10_axis-brand-and-parameteo-gliders-integration.md)
- **Sintesi**:
  - Allineato il catalogo vele con il database canonico di ParaMeteo (`C:\github\ParaMeteo\data\gliders.json`), aggiungendo il costruttore **Axis** a `PARAGLIDER_BRANDS` e tutti i suoi 6 modelli certificati (`Compact 4`, `Pluto 4`, `Comet 4`, `Vega 6`, `Venus 4 / SC`, `Sirius 2 (Tandem)`) a `POPULAR_GLIDERS` in [core/gliders.js](file:///core/gliders.js).
  - Riconciliati anche i modelli ParaMeteo per altri costruttori (`Ozone Zeno 2`, `Nova Sector`, `Niviuk Artik R`).
  - Aggiornati i test unitari di catalogo in [tests/core/gliders.test.mjs](file:///tests/core/gliders.test.mjs) e i test UI in [tests/ui/homeDashboardView.test.mjs](file:///tests/ui/homeDashboardView.test.mjs) con verifica del brand chip Axis, filtri per marca e ricerca rapida.
  - Tutti i 316 test passati con successo (100% pass rate).

---

## 2026-10-10 - Risoluzione Errore di Routing (`navigateTo`) e Blocco WAI-ARIA su Focus Retention in Sheet Modali
- **Tipo**: Bug Fix / Accessibilità WAI-ARIA / Router UI Lifecycle
- **Dettagli**: [.agents/worklog.d/2026-10-10_wai-aria-focus-retention-and-router-navigation-fix.md](file:///.agents/worklog.d/2026-10-10_wai-aria-focus-retention-and-router-navigation-fix.md)
- **Sintesi**:
  - Risolta l'eccezione di navigazione `TypeError: this.router.navigateTo is not a function` al click su una card comprensorio nella Home Dashboard.
  - Aggiunto l'alias `navigateTo: navigate` al router singleton in [ui/router.js](file:///ui/router.js) e introdotto il proxy `navigateTo(route, params)` in [ui/views/HomeDashboardView.js](file:///ui/views/HomeDashboardView.js) e [ui/views/ForecastView.js](file:///ui/views/ForecastView.js) con supporto bi-direzionale `navigate` / `navigateTo`.
  - Risolto il blocco di accessibilità Chromium `Blocked aria-hidden on an element because its descendant retained focus`: in [ui/sheetManager.js](file:///ui/sheetManager.js), alla chiusura del foglio modale (`closeSheet`), il focus viene evacuato preventivamente ripristinando `previousActiveElement` (se esterno) o invocando `.blur()` prima di applicare `aria-hidden="true"`.
  - Applicato l'attributo standard `inert` su `#sheet-container` in [index.html](file:///index.html) e gestito dinamicamente in `openSheet` / `closeSheet`.
  - Creata la nuova suite di test [tests/ui/sheetManager.test.mjs](file:///tests/ui/sheetManager.test.mjs) e aggiornate [tests/ui/router.test.mjs](file:///tests/ui/router.test.mjs) e [tests/ui/homeDashboardView.test.mjs](file:///tests/ui/homeDashboardView.test.mjs).
  - Tutti i 325 test passati con successo (46 suite, 0 regressioni). Registrata la Lezione #45 in [MEMORY.md](file:///MEMORY.md).

---

## 2026-10-10 - Collapsing Sticky Header in ForecastView e Ottimizzazione Sublabel Date Presets
- **Tipo**: Feature / Ergonomia Outdoor HMI / Progressive Disclosure
- **Dettagli**: [.agents/worklog.d/2026-10-10_collapsing-sticky-header-forecast-view.md](file:///.agents/worklog.d/2026-10-10_collapsing-sticky-header-forecast-view.md)
- **Sintesi**:
  - Implementato in [ui/views/ForecastView.js](file:///ui/views/ForecastView.js) il collapsing sticky header `#forecast-sticky-bar` con transizione GPU e threshold di scroll (60px), mantenendo visibili comprensorio, sub-spot attivo con quota, live badge e azione scroll-to-top rapida.
  - Rimossa la ridondanza nominale del giorno della settimana nelle sublabel dei preset in [core/datePresets.js](file:///core/datePresets.js) (es. "Sabato 11 Ott" -> "11 Ott" sotto il pulsante "Oggi").
  - Estesa la suite di test con 3 nuovi test in [tests/ui/forecastView.test.mjs](file:///tests/ui/forecastView.test.mjs).

---

## 2026-10-10 - Rifattorizzazione Vocabolario Volabilità: Transizione da "Aperto/Chiuso" a "Volabile/Non Volabile"
- **Tipo**: Refactor / HMI Aeronautica / Allineamento Semantico
- **Dettagli**: [.agents/worklog.d/2026-10-10_volabilita-badge-vocabulary-refactor.md](file:///.agents/worklog.d/2026-10-10_volabilita-badge-vocabulary-refactor.md)
- **Sintesi**:
  - Rimosso l'uso improprio di terminologia da impianti fisici o commerciali (`Aperto`, `Chiuso`), allineando l'applicazione alla volabilità meteorologica dell'aerologia locale: 🟢 **`Volabile`**, 🟡 **`Cautela`**, 🔴 **`Non Volabile`**, ⚫ **`Severo`**.
  - Allineati deterministicamente: [core/comprensorio.js](file:///core/comprensorio.js), [core/flyability.js](file:///core/flyability.js), [core/datePresets.js](file:///core/datePresets.js), le legende del calendario e badge a colpo d'occhio in [ui/views/HomeDashboardView.js](file:///ui/views/HomeDashboardView.js) e [ui/views/ForecastView.js](file:///ui/views/ForecastView.js).
  - Aggiornate tutte le suite di test collegate ([tests/core/comprensorio.test.mjs](file:///tests/core/comprensorio.test.mjs), [tests/core/flyability.test.mjs](file:///tests/core/flyability.test.mjs), [tests/core/datePresets.test.mjs](file:///tests/core/datePresets.test.mjs), [tests/ui/homeDashboardView.test.mjs](file:///tests/ui/homeDashboardView.test.mjs), [tests/ui/forecastView.test.mjs](file:///tests/ui/forecastView.test.mjs)).
  - Registrata la Lezione Appresa #47 in [MEMORY.md](file:///MEMORY.md).


---

## 2026-10-10 - Standard di Codifica: Governance Lingua Inglese Esclusiva nel Codice e Attivazione AGENTS.md
- **Tipo**: Governance / Standard di Ingegneria / Architettura Customizzazioni Antigravity
- **Dettagli**: [.agents/worklog.d/2026-10-10_strict-english-code-rule-governance.md](file:///.agents/worklog.d/2026-10-10_strict-english-code-rule-governance.md)
- **Sintesi**:
  - Esteso il plugin globale [C:/github/antigravity-plugins/plugins/engineering-workflow/rules/AGENTS.md](file:///C:/github/antigravity-plugins/plugins/engineering-workflow/rules/AGENTS.md) con la Sezione 3 (`Standard di Codifica: Lingua Inglese Esclusiva nel Codice Sorgente`), applicabile a tutti i progetti correnti e futuri.
  - Definito il perimetro rigido: lingua inglese esclusiva per identificatori, commenti di codice, annotazioni TODO, JSDoc, test automatizzati (`describe`/`it`), asserzioni, log interni, eccezioni e commit Git.
  - Distinta la localizzazione di prodotto (testi e copywriting della UI in italiano) dal codice sottostante e preservata la conversazione naturale in chat nella lingua dell'utente.
  - Creato [AGENTS.md](file:///AGENTS.md) alla radice del workspace GlideMind con inclusione sintattica `@[...]` di [.agents/rules/constraints.md](file:///.agents/rules/constraints.md) e collegamenti a tutte le specifiche di dominio, attivando l'iniezione automatica delle regole ad ogni avvio di sessione.
  - Suite di test convalidata: `node scripts/validate.mjs --all` sui plugin (9/9 OK) e `npm test` su GlideMind (325/325 passati).
  - Registrata la Lezione Appresa #48 in [MEMORY.md](file:///MEMORY.md).

---

## 2026-10-10 - Neutralizzazione del Calendario e Selettore Data nella Home Dashboard
- **Tipo**: Refactor / UX & Flight Safety / Bias Cognitivo
- **Dettagli**: [.agents/worklog.d/2026-10-10_neutral-home-date-picker.md](file:///.agents/worklog.d/2026-10-10_neutral-home-date-picker.md)
- **Sintesi**:
  - Eliminato il fallback silente su Monte Cornizzolo per il calcolo della volabilità nel selettore date della Home Dashboard, rimuovendo un grave bias cognitivo di disinformazione meteorologica per decolli con orografia ed esposizioni diverse.
  - In [ui/views/HomeDashboardView.js](file:///ui/views/HomeDashboardView.js): rimossi i dot di volabilità arbitrari dai tab rapidi della `renderDateBar` e neutralizzata la griglia 14 giorni in `openDatePickerSheet` (date pulite, orizzonte sinottico >7gg, zero classi `fly-*`, zero badge e rimozione della legenda per singolo sito). Titolo del foglio aggiornato a *"Seleziona Data Previsioni"*.
  - Preservata la valutazione di volabilità a 4 colori in [ui/views/ForecastView.js](file:///ui/views/ForecastView.js), dove lo spot è univoco e contestualizzato.
  - Aggiornato il test unitario in [tests/ui/homeDashboardView.test.mjs](file:///tests/ui/homeDashboardView.test.mjs). Tutti i 325 test passati con successo.
  - Registrata la Lezione Appresa #49 in [MEMORY.md](file:///MEMORY.md).

---

## 2026-10-10 - Risoluzione UX Laws, Accessibilità e Touch Ergonomics nella Home Dashboard
- **Tipo**: UX Law & Accessibility Remediation / Ergonomia Outdoor
- **Dettagli**: [.agents/worklog.d/2026-10-10_home-ux-laws-remediation.md](file:///.agents/worklog.d/2026-10-10_home-ux-laws-remediation.md)
- **Sintesi**:
  - Eseguito audit e risolute le criticità UX Laws nella Home Dashboard (esclusa la sezione attività di volo/currency per direttiva esplicita).
  - **Postel's Law (Robustezza)**: Normalizzazione caratteri accentati e diacritici Unicode nella ricerca dei comprensori (`normalizeSearchText`), con estensione della ricerca anche ai nomi dei singoli decolli e atterraggi del comprensorio.
  - **Fitts's Law & Touch Target Floor ($\ge 44\text{px}$)**: Aumentata altezza minima del campo di ricerca `.gm-search-input` a 44px; inserito pulsante rapido di azzeramento ricerca `.gm-search-clear` ($44\times 44\text{px}$); soppressa l'icona nativa browser `::-webkit-search-cancel-button` per evitare la duplicazione del tasto "X"; delegato l'evento `input` sul `containerEl` per rendere la ricerca immune ai re-render asincroni; portati i pulsanti compatti a 44px di altezza minima.
  - **Jakob's Law & WCAG POUR**: Card comprensorio dotate di `role="button"`, `tabindex="0"`, chevron indicatore (`.gm-spot-chevron`) e gestione da tastiera (`Enter` e `Space` per navigare a `ForecastView`).
  - **NN/G #9 & Cheap Takeover**: Aggiunto pulsante 1-tap "Azzera ricerca" nello stato di lista vuota e supporto al tasto `Escape`.
  - **WCAG POUR & Sunlight High-Contrast**: `aria-live="polite"` sul conteggio risultati, `aria-controls` sull'input, selettori `:focus-visible` ad alto contrasto e token CSS per tema luce ad alta luminanza solare.
  - Convalidati 331 test su 46 suite (+6 test unitari dedicati in [tests/ui/homeDashboardView.test.mjs](file:///tests/ui/homeDashboardView.test.mjs)) e verifica visiva completata via DevTools browser live.
  - Registrata la Lezione Appresa #50 in [MEMORY.md](file:///MEMORY.md).

---

## 2026-10-10 - Governance UX Dati Meteo Offline & Gestione Dati Non Disponibili (Zero Mock Mascherati)
- **Tipo**: UX Architecture / Integrità Dati / Anti-Sycophancy
- **Dettagli**: [.agents/worklog.d/2026-10-10_offline-and-unavailable-weather-ux.md](file:///.agents/worklog.d/2026-10-10_offline-and-unavailable-weather-ux.md)
- **Sintesi**:
  - Eliminata la generazione di valori meteo sintetici e verdetti fittizi (`CAUTELA`, `NON VOLABILE`, `15 km/h da SW`) quando la data selezionata non è presente in cache o si è offline, applicando il principio *Zero Placebo UI*.
  - Introdotto lo stato neutro esplicito `Dati N/D` (`.gm-badge-nd`), vento `-- km/h` e messaggio `Previsione non disponibile offline`, preservando al contempo l'efficienza orografica di planata (`1:X.X`) come dato geometrico certo indipendente dalla rete.
  - Indicizzata la mappa cache per `spotId_targetDate` in [ui/views/HomeDashboardView.js](file:///ui/views/HomeDashboardView.js), con chiusura deterministica del transitorio di caricamento (skeleton screen) in blocco `finally` e commutazione affidabile a `'live'` o `'offline'`.
  - Introdotto parametro `allowSynthetic: false` in [core/comprensorio.js](file:///core/comprensorio.js) ed esteso il calcolo dinamico di `forecast_days` in [core/openMeteoApi.js](file:///core/openMeteoApi.js) per supportare batch fino a 14-16 giorni.
  - Aggiunta suite di test [tests/ui/offlineWeatherUX.test.mjs](file:///tests/ui/offlineWeatherUX.test.mjs) (4 test dedicati, 335 totali superati).
  - Registrata la Lezione Appresa #51 in [MEMORY.md](file:///MEMORY.md).

---

## 2026-10-10 - Ergonomia Date Picker, Contrasto WCAG e Selettore Tema Top Bar
- **Tipo**: Feature & UX/A11y Remediation / Ergonomia Outdoor
- **Dettagli**: [.agents/worklog.d/2026-10-10_date-picker-ergonomics-and-theme-selector.md](file:///.agents/worklog.d/2026-10-10_date-picker-ergonomics-and-theme-selector.md)
- **Sintesi**:
  - Risolto il problema di overflow orizzontale dei preset data su schermi mobile stretti ($\le 390\text{px}$) mediante carosello a snap orizzontale a riga singola (`.gm-date-tabs` con `overflow-x: auto`, `scroll-snap-type: x mandatory`, `touch-action: pan-x`), preservando target touch $\ge 48\text{px}$ e azzerando l'overflow della pagina.
  - Allineata la conformità WAI-ARIA tablist: assegnato `role="tab"` e `aria-selected` al pulsante calendario `.gm-date-tab-calendar`.
  - Aggiunto stile `:focus-visible` (`outline: 2px solid var(--gm-accent)`) per gli elementi della griglia data (WCAG 2.4.7).
  - Garantito contrasto WCAG AA/AAA ($\ge 8.5:1$) in Sunlight Mode (`[data-theme="light"]`) forzando il colore del testo a scuro (`#09090b`) su sfondo ambra per tab, date e pulsanti attivi.
  - Riorganizzato il bottom sheet data applicando il principio Occam's Razor: griglia 14 giorni posizionata in cima come azione primaria Hero 1-tap, con form nativo relegato a opzione secondaria.
  - Risolta la desincronizzazione di `activeDate` in [ui/views/ForecastView.js](file:///ui/views/ForecastView.js) ed eliminati doppi render/fetch ridondanti nei click handler di [ui/views/HomeDashboardView.js](file:///ui/views/HomeDashboardView.js) tramite delegazione al listener reattivo dello store.
  - Implementato selettore tema compatto a 3 stati (*Chiaro* / *Scuro* / *Auto*) nella top bar a destra del numero di build in Home, racchiuso in un menu ad espansione con trigger a icona/etichetta e target touch conforme ($\ge 44\text{px}$), supporto alla media query `prefers-color-scheme` in [ui/app.js](file:///ui/app.js), controllo da tastiera (Escape/focus restore) e persistenza nello store (`ui.theme`).
  - Aggiunti test in [tests/ui/homeDashboardView.test.mjs](file:///tests/ui/homeDashboardView.test.mjs) e [tests/ui/forecastView.test.mjs](file:///tests/ui/forecastView.test.mjs) (338/338 test superati).
  - Registrata la Lezione Appresa #52 in [MEMORY.md](file:///MEMORY.md).

---

## 2026-10-10 - Ripristino Visibilità Modal Sheet e Date Picker in Modalità Desktop
- **Tipo**: Fix / Visual Regression / Ergonomia Desktop
- **Dettagli**: [.agents/worklog.d/2026-10-10_desktop-sheet-modal-visibility-fix.md](file:///.agents/worklog.d/2026-10-10_desktop-sheet-modal-visibility-fix.md)
- **Sintesi**:
  - Diagnosticata e risolta la mancata visibilità dei pannelli modali (`openSheet()`, es. date picker calendario, selettore comprensori, selettore vele) su schermi desktop (`min-width: 768px` e `min-height: 550px`).
  - Causa radice: la classe `.gm-sheet` dichiarava `opacity: 0; transform: scale(0.95);` nella media query desktop, ma al subentro della classe `.active` mancava la regola `#sheet-container.active .gm-sheet`, lasciando `opacity: 0` inalterata e rendendo il pannello modale 100% trasparente su sfondo oscurato.
  - Aggiornato [css/theme.css](file:///css/theme.css) introducendo `opacity: 1;` sia nella dichiarazione base attiva sia nella media query desktop con transizione `transform: scale(1);` ed eliminazione della barra di trascinamento touch `.gm-sheet-handle-bar`.
  - Aggiunto test di salvaguardia in [tests/ui/shellIntegrity.test.mjs](file:///tests/ui/shellIntegrity.test.mjs) (339/339 test superati).

---

## 2026-10-10 - Rimozione Badge Shortkey dalla Barra di Navigazione Desktop
- **Tipo**: UI Polish / De-cluttering
- **Dettagli**: [.agents/worklog.d/2026-10-10_remove-desktop-navbar-shortkey-badges.md](file:///.agents/worklog.d/2026-10-10_remove-desktop-navbar-shortkey-badges.md)
- **Sintesi**:
  - Rimossi i badge visivi delle scorciatoie (`[H]`, `[F]`, `[M]`, `[L]`, `[S]`) dai link della barra di navigazione desktop in [index.html](file:///index.html).
  - Rimossa la classe CSS non più utilizzata `.gm-kbd-badge` da [css/theme.css](file:///css/theme.css).
  - Test verificati con successo: 339/339 superati.

---

## 2026-10-10 - Ottimizzazione UX Scrubber Orario e Contrasto Sunlight WCAG AA
- **Tipo**: UX Architecture / Visual Ergonomics / WCAG Compliance
- **Dettagli**: [.agents/worklog.d/2026-10-10_timeline-scrubber-ux-refinement.md](file:///.agents/worklog.d/2026-10-10_timeline-scrubber-ux-refinement.md)
- **Sintesi**:
  - Rimosso l'header superiore dello scrubber orario in [ui/views/ForecastView.js](file:///ui/views/ForecastView.js) (label tecnica `Scrubber Orario`, pulsanti stepper `<` e `>` e visualizzazione ore selezionate), recuperando 36–40px verticali utili sul viewport mobile.
  - Introdotto il marcatore situazionale "ORA" (`.is-now` con badge `.compact-now-badge`) per identificare l'ora corrente locale quando si consulta la data odierna (`today`), con attenuazione visiva (`.is-past`, opacità 0.6) per le ore già trascorse.
  - Aggiunto supporto alla navigazione oraria tramite tastiera con i tasti `ArrowLeft` e `ArrowRight`.
  - Incrementata la larghezza della capsula semaforica `.compact-bar` da 9px a 14px (+55%), con sfondo colorato di stato (`--gm-status-*-bg`) e riempimento solido ad alta glanceability (100% volabile, 65% cautela, 35% non volabile).
  - Risolto il deficit di contrasto in modalità chiara (`[data-theme="light"]`) in [css/theme.css](file:///css/theme.css) introducendo un bordo esplicito `1px solid rgba(0, 0, 0, 0.28)` (contrasto $\ge 3:1$, WCAG 2.1 Non-Text Contrast) e colore testo orario ad alto contrasto (`#1e293b`, > 10:1).
  - Aggiornate le asserzioni di test in [tests/ui/uiIntegrityAudit.test.mjs](file:///tests/ui/uiIntegrityAudit.test.mjs) e aggiunti test in [tests/ui/forecastView.test.mjs](file:///tests/ui/forecastView.test.mjs) (340/340 test superati).
  - Registrata la Lezione Appresa #54 in [MEMORY.md](file:///MEMORY.md).

---

## 2026-10-10 - Risoluzione Artefatto Sticky Hover e Focus Durante lo Swipe dello Scrubber
- **Tipo**: Bug Fix / Mobile Touch Ergonomics
- **Dettagli**: [.agents/worklog.d/2026-10-10_fix-scrubber-touch-swipe-sticky-hover.md](file:///.agents/worklog.d/2026-10-10_fix-scrubber-touch-swipe-sticky-hover.md)
- **Sintesi**:
  - Diagnosticata e risolta la permanenza visiva dello sfondo evidenziato (`#2e3549`) sulla colonna oraria in cui iniziava lo swipe del dito (es. toccando le 12:00 e trascinando alle 17:00).
  - Causa radice: sui browser mobile, il tocco attiva la pseudo-classe `:hover`, che rimaneva permanentemente applicata all'elemento iniziale poiché le regole `:hover` non erano confinate a dispositivi con mouse.
  - Confinate le regole `:hover` di `.gm-timeline-col-compact` sotto `@media (hover: hover) and (pointer: fine)` in [css/theme.css](file:///css/theme.css), azzerando l'effetto su touchscreen.
  - Applicato il pattern Roving Tabindex (`tabindex="0"` solo sulla colonna attiva, `tabindex="-1"` sulle altre) e invocato il blur deterministico del focus residuo in `handlePointerDown` e `handlePointerUp` in [ui/views/ForecastView.js](file:///ui/views/ForecastView.js).
  - Implementata la guardia anti-trailing click (`this.hasDraggedPointer`) per prevenire click sintetici spuri al termine del trascinamento.
  - Aggiunti test di verifica in [tests/ui/forecastView.test.mjs](file:///tests/ui/forecastView.test.mjs) (340/340 test superati).
  - Registrata la Lezione Appresa #55 in [MEMORY.md](file:///MEMORY.md).








