# Matrice di Stato delle Funzionalità (DESIDERATA)

Matrice di stato delle funzionalità di GlideMind riferita a [MASTER_PLAN.md](file:///c:/github/GlideMind/MASTER_PLAN.md).
> **Governance**: mantenere ogni cella `Note di Avanzamento` entro **160 caratteri** (i dettagli risiedono in [WORKLOG.md](file:///c:/github/GlideMind/WORKLOG.md) e `.agents/worklog.d/`). Storico verboso archiviato in [`.agents/archive/DESIDERATA_v1_archive.md`](file:///c:/github/GlideMind/.agents/archive/DESIDERATA_v1_archive.md).

---

## 1. Backlog Attivo & Funzionalità Pianificate

| Modulo / Funzionalità | Fase | Stato | Note / Specifica di Riferimento |
| :--- | :---: | :---: | :--- |
| **Telemetria Centraline Meteo Fisiche in Diretta** | Fase 4-quater | ⚪ Pianificato | Sensori live (OpenWindMap/MeteoHub/Holfuy) e guardia quota ([spec](file:///c:/github/GlideMind/docs/plans/phase-4-quater-live-weather-stations.md)) |
| **Zonizzazione Territoriale & Vincoli Aeroclub** | Fase 5-quinquies | ⚪ Pianificato | Aree verdi/rosse/piegaggio in `data/locations/*.json` ([spec](file:///c:/github/GlideMind/docs/plans/phase-5-quinquies-club-safety-zoning.md)) |
| **Raccolta, Correzione Spot & Ingestion Proposte** | Fase 5-sexies | ⚪ Pianificato | Form contribuzione 1-tap GPS + CLI `scripts/review-proposal.mjs` ([spec](file:///c:/github/GlideMind/docs/plans/phase-5-sexies-community-spot-proposals.md)) |
| **Full System Snapshot Backup & Restore** | Fase 6-bis | ⚪ Pianificato | Snapshot LocalStorage + IndexedDB con Smart Merge in `core/backupManager.js` |
| **Condivisione Contestuale & Deep Linking Ospite** | Fase 7-bis | ⚪ Pianificato | Share 1-tap e traccia LTTB in URL `< 1.5 KB` (`core/urlState.js`, [spec](file:///c:/github/GlideMind/docs/plans/phase-7-bis-universal-contextual-sharing.md)) |
| **Internazionalizzazione Multi-Lingua (i18n 4 lingue)** | Fase 8 | ⚪ Pianificato | Estensione dizionario i18n completo (IT, EN, FR, DE) per tutte le viste UI |
| **Motore di Disegno CAD & Annotazione Rotte** | Post-Fase 7 | ⚪ Pianificato | Editor vettoriale spline Chaikin con Undo/Redo a 50 stati ([spec](file:///c:/github/GlideMind/docs/plans/future-interactive-drawing-engine.md)) |

---

## 2. Funzionalità Completate & Consolidate

| Modulo / Funzionalità | Fase | Stato | Note di Avanzamento |
| :--- | :---: | :---: | :--- |
| **Workspace Foundation & Governance** | Fase 0 | 🟢 Completato | Regole, skill, server dev `scripts/serve.js`, test runner `node:test` e triade cognitiva |
| **Core Headless: `flyability.js`** | Fase 1 | 🟢 Completato | Algoritmo waterfall a cascata, priorità aeronautica, EDR, Deardorff e guardia sottovento |
| **Core Headless: `geoSpatialMath.js`** | Fase 1 | 🟢 Completato | Formule WGS84, Haversine, bearing, scomposizione vento, Chaikin, Web Mercator, ENU e DEM |
| **Core Headless: `soundingsMath.js`** | Fase 1 | 🟢 Completato | Magnus-Tetens, LCL Cloud Base, lapse rate WMO, inversioni termiche e barometria ICAO |
| **Core Headless: `igcParser.js`** | Fase 1 | 🟢 Completato | Parser FAI IGC B/H-record, filtro anti-spike $\pm 18\text{ m/s}$, trimming suolo e matching spot |
| **Core Headless: `flightTelemetry.js`** | Fase 1 | 🟢 Completato | Decimazione LTTB 60 FPS, cinematica di volo, segmentazione fasi e fasce variometriche FAI |
| **Core Headless: `flightManeuvers.js`** | Fase 1 | 🟢 Completato | Clustering termiche con tolleranza inversioni, spirali, wingover, 360° e circuito a 8 |
| **Core Headless: `openMeteoApi.js`** | Fase 1 | 🟢 Completato | Client con cache LRU, promise pooling, circuit breaker HTTP 429, fallback `best_match` e mock |
| **Design System & Shell Architetturale** | Fase 2 | 🟢 Completato | `index.html` (108 righe), `css/theme.css` dual-theme, Fitts $\ge 48\text{px}$, `store.js` e `router.js` |
| **Brand Identity, Icon Bundle & Splash** | Fase 2-bis | 🟢 Completato | Icone PWA (512, 192, maskable, apple-touch), `manifest.webmanifest` e splash zero-FOUC |
| **Home Dashboard (`HomeDashboardView.js`)** | Fase 3 | 🟢 Completato | Layout Above-the-Fold meteo-centrico, barra simbiotica, card a 2 righe con timeline `3.5px` |
| **Catalogo Vele & Fattore Prudenza Pilota** | Fase 3-bis | 🟢 Completato | 55+ modelli (`core/gliders.js`), parametri fisici $V_{\text{trim}}$/E senza badge EN (`NOTE-004`) |
| **Vista Previsioni (`ForecastView.js`)** | Fase 4 | 🟢 Completato | Switcher `Panoramica|Decollo|Atterraggio`, grafici 1:1 LED/fasce/zoom, scrubbar uniforme (`NOTE-003`) |
| **Smart Date Selector & Calendario 7 Colonne** | Fase 4 | 🟢 Completato | Stepper monoriga `[‹ Data ▾ ›]` + quick chips e sheet calendario 14gg a 7 colonne (`Lun–Dom`) |
| **Live Ingestion & Multi-Day Cache** | Fase 4-bis | 🟢 Completato | Chiave cache disambiguata `${spot.id}_${takeoff.id}_${landing.id}_${dateStr}` e badge quota 429 |
| **Finestre di Volo & Previsioni a 2 Livelli** | Fase 4-ter | 🟢 Completato | `core/flightWindows.js`, disaccoppiamento oro-meteo decollo/atterraggio e `evaluateTimelineSlot` |
| **Pipeline Harvesting & Audit Spot** | Tooling | 🟢 Completato | Harvesting OSM Overpass + PG Earth, filtro geometrico Haversine/DEM e `spot-data-auditor` |
| **Mappa Comprensori (`SpotMapView.js`)** | Fase 5 | 🟢 Completato | Adapter Leaflet `IMapEngine`, barra esterna, mirino GPS/spot e scrubber diurno a pillole uniformi |
| **Mini-Mappa & Maniche a Vento (`windsock.js`)** | Fase 5-bis | 🟢 Completato | Doppia manica a vento shortest-path, pin atterraggio circolare `22px` e callout planata a 2 righe |
| **Analisi Volo Comprensorio & Procedure** | Fase 5-ter | 🟢 Completato | Overlay `100dvh`, settore decollo $70^\circ$, linea di planata e circuiti atterraggio (`flightProcedures.js`) |
| **Catalogo Europeo Sharded & Clustering** | Fase 5-quater | 🟢 Completato | Sharding `data/locations/<country>.json` (IT, CH, FR, AT, DE), viewport culling e cluster 60 FPS |
| **Logbook & Filtri a Pills (`LogbookView.js`)** | Fase 6 | 🟢 Completato | Dual-store `flights_meta`/`flights_raw`, card 4-KPI e 5 pills espandibili per argomento (`NOTE-005`) |
| **Importatore ParaMeteo & Integrità Traccia** | Fase 6-bis | 🟢 Completato | `core/parameteoImporter.js`, divieto tracce sintetiche, auto-purge DB e focus restoration |
| **Dettaglio Volo & Debriefing (`FlightDetailSheet.js`)** | Fase 6-ter | 🟢 Completato | Vista `100dvh`, griglia 6 KPI, debriefing aerodinamico `.gm-debrief-callout` ed eliminazione con Undo 5s |
| **Replay 3D WebGL & Motore V2 (`FlightReplayView.js`)** | Fase 7/7-quinquies | 🟢 Completato | Camere spring-damper in quota + stabilizzazione termica, fisica pendolare vela, livrea bicolore, spline + Ghost Track |
| **Trimming Non-Distruttivo & `TrackSetupSheet`** | Fase 7-ter | 🟢 Completato | `core/flightTrimming.js`, calibrazione barometrica bi-punto e modello 3D competition 54 cassoni |
| **Mini-Mappa Traccia 2D & Fasi Sincronizzate** | Fase 7-quater | 🟢 Completato | Polilinea variometrica FAI 60 FPS, zoom su fase/termica e cursore bidirezionale mappa-grafico |
| **Audit Ergonomico HMI & Laws of UX** | Audit | 🟢 Completato | Verifica CDP 29 viewport, touch target $\ge 48\text{px}$, contrasto sunlight mode e anti-gergo |
| **Service Worker Offline-First (`sw.js`)** | Fase 8 | 🟢 Completato | Cache-First per app shell statica e pass-through Network-Only per Open-Meteo e tile mappa |
| **Vista Impostazioni & Unità (`SettingsView.js`)** | Fase 8-bis | 🟢 Completato | Persistenza tema, 4 layer mappa, unità centralizzate (`core/units.js`) e opzioni vela/pilota |
| **Full Codebase Audit & Governance Cognitiva** | Governance | 🟢 Completato | Risolte 28 criticità P0–P3, stripping `localStorage`, distillazione `MEMORY`/`WORKLOG` e test |

---

Legenda Stati: `🟢 Completato` | `🟡 In Lavorazione` | `🔴 Prioritario` | `⚪ Pianificato`
