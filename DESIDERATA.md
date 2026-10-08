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
| **Design System & Shell Architetturale** | Fase 2 | 🟢 Completato | Shell HTML minima (108 righe), CSS custom properties, Fitts 44px, router 5-tab, store reattivo SSOT, sheetManager |
| **Vista Home Dashboard (`HomeDashboardView.js`)** | Fase 3 | 🟡 In Lavorazione | Selettore date, carosello località preferite, card sintesi volabilità comprensorio (miglior decollo + atterraggio) |
| **Vista Previsioni Meteo (`ForecastView.js`)** | Fase 4 | ⚪ Pianificato | Panoramica comprensorio (decolli e atterraggi), timeline oraria a cascata, indicatore vento 360°, radiosondaggi, briefing AI |
| **Vista Mappa Comprensori (`SpotMapView.js`)** | Fase 5 | ⚪ Pianificato | Cartografia comprensori, coni decollo orientati al vento, planata verso atterraggi, filtro raggio "Dove volare oggi" |
| **Modulo Logbook di Volo (`LogbookView.js`)** | Fase 6 | ⚪ Pianificato | Inserimento IGC, IndexedDB `logbookDb.js`, KPI di carriera, matrice Peter Pan |
| **Visualizzatore 3D Traiettoria (`FlightReplayView.js`)**| Fase 7 | ⚪ Pianificato | Replay WebGL 3D su terreno DEM Terrarium, telemetry strip 2D a 60 FPS |
| **PWA, Internazionalizzazione & Offline Hardening** | Fase 8 | ⚪ Pianificato | Service Worker passthrough, Web App Manifest, supporto i18n a 4 lingue, WCAG AA |

Legenda Stati:
- 🟢 Completato: implementato, testato e consolidato.
- 🟡 In Lavorazione: in corso di sviluppo attivo o pianificato per il task corrente.
- ⚪ Pianificato: previsto nelle fasi successive della roadmap.
