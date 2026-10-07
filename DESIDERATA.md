# Matrice di Stato delle Funzionalità (DESIDERATA)

Questo documento traccia lo stato di avanzamento delle funzionalità e dei moduli architetturali previsti in [MASTER_PLAN.md](file:///MASTER_PLAN.md).

| Modulo / Funzionalità | Fase | Stato | Note di Avanzamento |
| :--- | :---: | :---: | :--- |
| **Workspace Foundation & Governance** | Fase 0 | 🟢 Completato | Regole, skill, server di dev locale, test runner, triade di continuità cognitiva |
| **Migrazione Core Headless: `flyability.js`** | Fase 1 | 🟢 Completato | Algoritmo waterfall a cascata, priorità aeronautica, EDR, Deardorff, protezione sottovento |
| **Migrazione Core Headless: `geoSpatialMath.js`** | Fase 1 | 🟢 Completato | Formule WGS84, Haversine, bearing, scomposizione vento, Chaikin, Web Mercator, ENU, DEM |
| **Migrazione Core Headless: `soundingsMath.js`** | Fase 1 | ⚪ Pianificato | Termodinamica atmosferica, LCL Cloud Base, lapse rate adiabatico |
| **Migrazione Core Headless: `igcParser.js`** | Fase 1 | ⚪ Pianificato | Parser per record GPS B-record conformi FAI IGC |
| **Migrazione Core Headless: `flightTelemetry.js`** | Fase 1 | ⚪ Pianificato | Decimazione LTTB e cinematica di volo (ground speed, vario, glide ratio) |
| **Migrazione Core Headless: `flightManeuvers.js`** | Fase 1 | ⚪ Pianificato | Rilevamento termiche, spirali, wingover e 360° |
| **Migrazione Core Headless: `openMeteoApi.js`** | Fase 1 | ⚪ Pianificato | Client Open-Meteo con caching e supporto mock disconnesso |
| **Design System & Shell Architetturale** | Fase 2 | ⚪ Pianificato | Shell HTML minima, CSS custom properties, Fitts 44px, router 5-tab, store reattivo |
| **Vista Home Dashboard (`HomeDashboardView.js`)** | Fase 3 | ⚪ Pianificato | Selettore date, carosello decolli salvati, card sintesi volabilità |
| **Vista Previsioni Meteo (`ForecastView.js`)** | Fase 4 | ⚪ Pianificato | Timeline oraria a cascata, indicatore vento 360°, radiosondaggi, briefing AI Guido |
| **Vista Mappa Decolli (`SpotMapView.js`)** | Fase 5 | ⚪ Pianificato | Cartografia interattiva, coni di decollo orientati al vento, filtro raggio "Dove volare oggi" |
| **Modulo Logbook di Volo (`LogbookView.js`)** | Fase 6 | ⚪ Pianificato | Inserimento IGC, IndexedDB `logbookDb.js`, KPI di carriera, matrice Peter Pan |
| **Visualizzatore 3D Traiettoria (`FlightReplayView.js`)**| Fase 7 | ⚪ Pianificato | Replay WebGL 3D su terreno DEM Terrarium, telemetry strip 2D a 60 FPS |
| **PWA, Internazionalizzazione & Offline Hardening** | Fase 8 | ⚪ Pianificato | Service Worker passthrough, Web App Manifest, supporto i18n a 4 lingue, WCAG AA |

Legenda Stati:
- 🟢 Completato: implementato, testato e consolidato.
- 🟡 In Lavorazione: in corso di sviluppo attivo o pianificato per il task corrente.
- ⚪ Pianificato: previsto nelle fasi successive della roadmap.
