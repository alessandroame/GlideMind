# Matrice di Stato delle Funzionalità (DESIDERATA)

Questo documento traccia lo stato di avanzamento delle funzionalità e dei moduli architetturali previsti in [MASTER_PLAN.md](file:///MASTER_PLAN.md).

| Modulo / Funzionalità | Fase | Stato | Note di Avanzamento |
| :--- | :---: | :---: | :--- |
| **Workspace Foundation & Governance** | Fase 0 | 🟢 Completato | Regole, skill, server di dev locale, test runner, triade di continuità cognitiva |
| **Migrazione Core Headless: `flyability.js`** | Fase 1 | 🟢 Completato | Algoritmo waterfall a cascata, priorità aeronautica, EDR, Deardorff, protezione sottovento |
| **Migrazione Core Headless: `geoSpatialMath.js`** | Fase 1 | 🟢 Completato | Formule WGS84, Haversine, bearing, scomposizione vento, Chaikin, Web Mercator, ENU, DEM |
| **Migrazione Core Headless: `soundingsMath.js`** | Fase 1 | 🟢 Completato | Termodinamica atmosferica, LCL Cloud Base, lapse rate adiabatico, stima thermal top, barometria ICAO |
| **Migrazione Core Headless: `igcParser.js`** | Fase 1 | 🟢 Completato | Parser per record GPS B-record conformi FAI IGC, anti-spike filter, trimming suolo, matching spot |
| **Migrazione Core Headless: `flightTelemetry.js`** | Fase 1 | 🟢 Completato | Decimazione LTTB, cinematica di volo, fasce FAI e gradienti CSS |
| **Migrazione Core Headless: `flightManeuvers.js`** | Fase 1 | 🟢 Completato | Rilevamento termiche, spirali, wingover, 360°, circuito a 8 e merge manovre |
| **Migrazione Core Headless: `openMeteoApi.js`** | Fase 1 | 🟢 Completato | Client Open-Meteo con cache LRU in memoria, retry 429, fallback modelli, dati sintetici e arricchimento EDR |
| **Design System & Shell Architetturale** | Fase 2 | 🟢 Completato | Shell HTML minima (108 righe), CSS custom properties, Fitts >= 48px, router 5-tab, store reattivo SSOT, sheetManager |
| **Vista Home Dashboard (`HomeDashboardView.js`)** | Fase 3 | 🟢 Completato | Architettura minimale a 2 blocchi: comprensori ordinati per volabilità ($T_{\text{best}}$ e $L_{\text{safe}}$ con Explainability e ricerca istantanea, zero PIN/preferiti) e blocco currency pilota |
| **Vista Previsioni Meteo (`ForecastView.js`)** | Fase 4 | 🟢 Completato | Panoramica comprensorio (Unico Binomio $T_{\text{best}}$/$L_{\text{safe}}$), tendina sub-spot a 2 livelli, scrubber sticky ancorato in basso senza scroll, indicatori vento/radiosondaggio a doppio stato (sintetico/grafico con marker orario sincronizzato), drawer picker comprensorio con preferiti e recenti, briefing AI Guido |
| **Smart Date Selector & Picker Globale** | Fase 4 | 🟢 Completato | Preset weekend adattivi (Oggi, Domani, Sab, Dom), zero duplicati di venerdì, calendar sheet con griglia 14gg, classificazione semantica della volabilità a 4 colori (🟢 Volabile, 🟡 Cautela, 🔴 Chiuso, ⚫ Severo) conforme a standard outdoor HMI con badge icona+testo e legenda, indicatore orizzonte sinottico (>7gg), sincronizzazione reattiva via `store.activeDate` tra tutte le viste e scorciatoie per voli passati nel Logbook |
| **Live Data Ingestion & Cache Sync (`ForecastView` & `HomeDashboardView`)** | Fase 4-bis | 🟡 In Lavorazione | Connessione background asincrona alle API reali di Open-Meteo (CORS nativo, zero proxy), pattern Stale-While-Revalidate a 0ms, indicatore discreto di freschezza dati/stato rete e fallback offline automatico |
| **Vista Mappa Comprensori & Volabilità (`SpotMapView.js`)** | Fase 5 | ⚪ Pianificato | Cartografia a due livelli di zoom con idratazione progressiva: livello Macro (zoom 5-8.9) con batch per macro-regione (max 25-30 spot, payload <500KB) e aureole di bacino a 4 colori; livello Micro (zoom >=9) con decollo $T_{\text{best}}$, cono vento e planata $E_{\text{richiesta}} \le E_{\text{glider}}$ interamente in RAM a zero costo di rete; cache entity-centric per `spotId`, timeline oraria 09-18 fluttuante con clearance >=24px e Headless Map Adapter per test Node.js |
| **Modulo Logbook di Volo (`LogbookView.js`)** | Fase 6 | ⚪ Pianificato | Inserimento traccia IGC con drag-and-drop, parsing chunkato asincrono anti-jank, salvaguardia anti-eviction mobile via `navigator.storage.persist()`, storage driver IndexedDB a due livelli (`flights_meta` con fingerprint deterministico e `flights_raw` per blob GPS on-demand), e KPI di carriera |
| **Backup, Auto-Sync & Restore Engine (`backupManager.js`)** | Fase 6-bis | ⚪ Pianificato | Full system snapshot (LocalStorage + IndexedDB) con ripristino Reconstruct o Smart Merge guidato da `updatedAt` (Last-Write-Wins), download blob sicuro anti-leak, export/import modulare separato per il solo Logbook (JSON/IGC bundle), sync dirty tracking e reminder periodico non invasivo |
| **Visualizzatore 3D Traiettoria (`FlightReplayView.js`)**| Fase 7 | ⚪ Pianificato | Architettura Adapter a doppio motore (`IReplay3dEngine`): primario MapLibre GL 3D + Three.js DEM Terrarium con fallback solido a CesiumJS (coordinate WGS84 native); telemetria 2D su Canvas 60 FPS disaccoppiata e degradazione vettoriale spaziale offline |
| **PWA, Internazionalizzazione & Offline Hardening** | Fase 8 | ⚪ Pianificato | Service Worker con isolamento (Cache-First asset locali, Network-Only pass-through per tile esterne anti-quota exceeded), Web App Manifest, supporto i18n a 4 lingue, audit WCAG 2.1 AA e palette ad alto contrasto outdoor |

Legenda Stati:
- 🟢 Completato: implementato, testato e consolidato.
- 🟡 In Lavorazione: in corso di sviluppo attivo o pianificato per il task corrente.
- ⚪ Pianificato: previsto nelle fasi successive della roadmap.
