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




