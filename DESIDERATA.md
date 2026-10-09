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
| **Vista Mappa Comprensori & Volabilità (`SpotMapView.js`)** | Fase 5 | ⚪ Pianificato | Cartografia comprensori con aureole di volabilità macro (🟢/🟡/🔴), vista micro con cono azimutale di decollo e planata sicura ($E_{\text{richiesta}} \le E_{\text{glider}}$), timeline scrubbing orario reattiva (09-18), batch meteo a catalogo statico (`locations.json`) a zero costo di rete su pan/zoom e Headless Map Adapter per test in Node.js |
| **Modulo Logbook di Volo (`LogbookView.js`)** | Fase 6 | ⚪ Pianificato | Inserimento traccia IGC con drag-and-drop, storage driver IndexedDB a due livelli anti-bloat (`flights_meta` per liste/currency e `flights_raw` per blob GPS on-demand), e KPI di carriera (ore totali, voli, quota max, durata) |
| **Backup, Auto-Sync & Restore Engine (`backupManager.js`)** | Fase 6-bis | ⚪ Pianificato | Full system snapshot (LocalStorage + IndexedDB), export/import modulare separato per il solo Logbook (JSON/IGC bundle), sync dirty tracking e reminder periodico backup (>14gg o >=3 voli) con predisposizione cloud sync |
| **Visualizzatore 3D Traiettoria (`FlightReplayView.js`)**| Fase 7 | ⚪ Pianificato | Architettura Adapter a doppio motore (`IReplay3dEngine`): primario MapLibre GL 3D + Three.js DEM Terrarium (GLB binario) con fallback solido a CesiumJS (coordinate cartesiane WGS84 native); telemetria 2D su Canvas 60 FPS disaccoppiata |
| **PWA, Internazionalizzazione & Offline Hardening** | Fase 8 | ⚪ Pianificato | Service Worker pass-through per tile esterne (anti-quota exceeded), Web App Manifest, supporto i18n a 4 lingue disaccoppiato dal core, audit WCAG AA e contrasto solare outdoor |

Legenda Stati:
- 🟢 Completato: implementato, testato e consolidato.
- 🟡 In Lavorazione: in corso di sviluppo attivo o pianificato per il task corrente.
- ⚪ Pianificato: previsto nelle fasi successive della roadmap.
