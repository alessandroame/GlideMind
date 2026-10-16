# Giornale Cronologico degli Interventi & ADR (WORKLOG)

Giornale a finestra mobile (rolling window, max **300 righe** / **ultimi 15 interventi**) degli interventi architetturali e operativi nel repository GlideMind.
> **Archivio Storico**: Il diario cronologico integrale delle Fasi 0–8 (135 interventi dal 2026-10-07 al 2026-10-13) è conservato in [`.agents/archive/WORKLOG_v1_archive.md`](file:///c:/github/GlideMind/.agents/archive/WORKLOG_v1_archive.md) e nelle singole schede granulari in `.agents/worklog.d/`.

---

## Indice Sintetico delle Fasi Consolidate (Archiviate in `WORKLOG_v1_archive.md`)

- **Fase 0–1 (Foundation & Core Engine Headless)**: Disaccoppiamento puro di `geoSpatialMath.js`, `flyability.js`, `soundingsMath.js`, `igcParser.js`, `flightTelemetry.js`, `flightManeuvers.js` e `openMeteoApi.js`.
- **Fase 2 (Design System & Shell UI)**: Store reattivo `core/store.js` con storage adapter iniettabile, `css/theme.css` dual-theme (`[data-theme="light"]`), router a 5 tab e `sheetManager.js`.
- **Fase 3–4 (Home Dashboard & Forecast Engine)**: Paradigma comprensorio-centrico (`core/comprensorio.js`), Unico Binomio dinamico, grafici serie temporali a spline monotona Fritsch-Carlson e briefing AI Gemini (`core/aiBriefing.js`).
- **Fase 5 (Spot Map 2D & Cartografia Aeronautica)**: Adapter Leaflet headless-safe (`ui/map/mapEngineAdapter.js`), tile server keyless Esri/OpenTopo/CyclOSM, idratazione macro-regionale e doppia manica a vento vettoriale.
- **Fase 6–7 (Logbook Dual-Store, Backup & 3D Replay WebGL)**: Persistenza IndexedDB a due livelli (`flights_meta` / `flights_raw`), importatore ParaMeteo V1/V2 (`core/parameteoImporter.js`), backup/restore (`core/backupManager.js`) e motore 3D `MapLibreReplayEngine.js` + Three.js CustomLayer con origine locale ENU $P_0$.

---

## 2026-10-13 - Fase 1/4-bis: Risoluzione Tempeste HTTP 429 Open-Meteo, In-Flight Pooling e Circuit Breaker
- **Tipo**: Resilienza Rete / Rate-Limit Protection (`core/openMeteoApi.js`)
- **Dettagli**: [.agents/worklog.d/2026-10-13_open-meteo-429-storm-fix-and-pooling.md](file:///.agents/worklog.d/2026-10-13_open-meteo-429-storm-fix-and-pooling.md)
- **Sintesi**:
  - Introdotto In-Flight Promise Pooling per deduplicare richieste concorrenti verso le stesse coordinate, popolamento multi-giorno automatico della cache dai payload a 14 giorni e Circuit Breaker Cooldown globale (`60s`) al primo HTTP 429 con fallback immediato su cache stale/sintetica.

---

## 2026-10-13 - Integrità Scientifica: Divieto Assoluto di Punti Traccia Fittizi, Auto-Purge Database e Stati Vuoti Trasparenti
- **Tipo**: Integrità di Dominio / Rimozione Debito Tecnico / UI Ergonomics
- **Dettagli**: [.agents/worklog.d/2026-10-13_purge-synthetic-tracks-and-honest-empty-states.md](file:///.agents/worklog.d/2026-10-13_purge-synthetic-tracks-and-honest-empty-states.md)
- **Sintesi**:
  - Rimosso `core/flightTrackReconstruction.js` e introdotto l'auto-purge in [`core/logbookDb.js`](file:///core/logbookDb.js) per eliminare qualsiasi traccia ricostruita artificialmente (`isReconstructed: false` sempre).
  - Resi trasparenti gli stati vuoti in [`ui/views/FlightDetailSheet.js`](file:///ui/views/FlightDetailSheet.js), [`ui/map/mapEngineAdapter.js`](file:///ui/map/mapEngineAdapter.js) (solo marker D e A senza polyline fittizie) e [`ui/views/FlightReplayView.js`](file:///ui/views/FlightReplayView.js).

---

## 2026-10-13 - Logbook UI: Indicatore di Traccia GPS Allegata sulle Card, Filtri Rapidi e Sincronizzazione Dettaglio
- **Tipo**: Feature / Logbook UI / Headless Core
- **Dettagli**: [.agents/worklog.d/2026-10-13_flight-track-attached-indicator-and-filters.md](file:///.agents/worklog.d/2026-10-13_flight-track-attached-indicator-and-filters.md)
- **Sintesi**:
  - Implementata `hasAttachedTrack(flight)` in [`core/logbook.js`](file:///core/logbook.js), aggiunto il badge `.gm-track-badge-present` sulle card di [`ui/views/LogbookView.js`](file:///ui/views/LogbookView.js) e i chip di filtro rapido `Con traccia` (`with-track`) / `Senza traccia` (`no-track`).

---

## 2026-10-15 - Fase 3/4/6/8-bis: Home Above-the-Fold Meteo-Centrica, Simmetria Calendario 14gg e Fattore Opzionale Allenamento Pilota
- **Tipo**: Refactoring UX Above-the-Fold / Dominio Volabilità / Headless Core
- **Dettagli**: [.agents/worklog.d/2026-10-15_home_audit_and_pilot_currency_factor.md](file:///.agents/worklog.d/2026-10-15_home_audit_and_pilot_currency_factor.md)
- **Sintesi**:
  - Rimossa la card `Attività Pilota` da [`ui/views/HomeDashboardView.js`](file:///ui/views/HomeDashboardView.js), integrata la pillola vela a costo verticale zero e unificato il caricamento `.IGC/.JSON` + form manuale in [`ui/views/ImportFlightSheet.js`](file:///ui/views/ImportFlightSheet.js).
  - Implementato il fattore opt-in `usePilotCurrencyFactor` (`calculatePilotSafetyFactor` in [`core/logbook.js`](file:///core/logbook.js): `1.0x`, `0.85x`, `0.75x`) che scala le sole soglie di pilotaggio attivo in [`core/flyability.js`](file:///core/flyability.js) lasciando invariati $V_{\text{trim}}$ e cono di planata.

---

## 2026-10-15 - Fase 4/5-bis: Marker Atterraggio Pulito, Pannelli Warning Floating Zero-CLS e Balloon Planata a 2 Righe
- **Tipo**: Cartografia UI / Outdoor HMI / Zero Cumulative Layout Shift
- **Dettagli**: [.agents/worklog.d/2026-10-15_home_audit_and_pilot_currency_factor.md](file:///.agents/worklog.d/2026-10-15_home_audit_and_pilot_currency_factor.md)
- **Sintesi**:
  - Riconfigurato `.gm-mini-pin-landing` in [`ui/map/mapEngineAdapter.js`](file:///ui/map/mapEngineAdapter.js) come hub circolare `22x22px` (`⏚` senza quota testuale) ed evoluto il badge di planata nel callout `.gm-glide-balloon` a 2 righe (`Δ quota` + `↔ distanza`).
  - Convertiti tutti i banner di warning (`.gm-horizon-notice`, `.gm-storage-warning-banner`, `.gm-logbook-undo-banner`, `.gm-import-summary-banner`) in pannelli `position: fixed` ancorati in basso con pulsante `.gm-warning-close-btn` (`48x48px`).

---

## 2026-10-15 - Fase 3 & 6: Card Comprensorio a 2 Righe con Timeline Diurna e Card Flight Log Compatta (~70px, 4-KPI)
- **Tipo**: Refactoring UX / Outdoor HMI / Flight Logbook
- **Dettagli**: [.agents/worklog.d/2026-10-15_compact-flight-card-4kpi.md](file:///.agents/worklog.d/2026-10-15_compact-flight-card-4kpi.md)
- **Sintesi**:
  - Riprogettata la card comprensorio in [`ui/views/HomeDashboardView.js`](file:///ui/views/HomeDashboardView.js) su 2 righe con timeline diurna (`buildDiurnalTimeline` + `resolveDaylightHours`), deep-linking orario a 1-tap e barra simbiotica `#home-symbiotic-toolbar`.
  - Compattata `.gm-flight-card` in [`ui/views/LogbookView.js`](file:///ui/views/LogbookView.js) con griglia 4-KPI (`Tempo`, `Quota MSL`, `Guadagno`, `Termiche`) e spostamento dell'azione elimina nella topbar di [`ui/views/FlightDetailSheet.js`](file:///ui/views/FlightDetailSheet.js).

---

## 2026-10-16 - Fase 4: Selezione Rapida Previsioni Decollo/Atterraggio, Combo Inline e Timeline Contestuale (`[NOTE-002]`)
- **Tipo**: Ergonomia UX / Previsioni Meteo / 1-Tap Sub-Spot Navigation
- **Dettagli**: [.agents/worklog.d/2026-10-16_forecast-quick-subspot-switcher-and-combo.md](file:///.agents/worklog.d/2026-10-16_forecast-quick-subspot-switcher-and-combo.md)
- **Sintesi**:
  - Introdotto in [`ui/views/ForecastView.js`](file:///ui/views/ForecastView.js) il selettore `.gm-quick-subspot-switcher` (`Panoramica | Decollo | Atterraggio`), la combo condizionale `.gm-inline-subspot-select` (visibile solo se `length > 1`) e la valutazione reattiva della timeline tramite `evaluateTimelineSlot` con chiave cache disambiguata per `takeoffId`/`landingId`.

---

## 2026-10-16 - Fase 3 & 4: Date Picker Compatto Monoriga (`36px`), Calendario 7 Colonne (`Lun–Dom`) e Timeline Home Sottile (`3.5px`)
- **Tipo**: Ergonomia UX / Laws of UX Audit / Design System
- **Dettagli**: [.agents/worklog.d/2026-10-16_compact-date-picker-stepper-and-calendar.md](file:///.agents/worklog.d/2026-10-16_compact-date-picker-stepper-and-calendar.md), [.agents/worklog.d/2026-10-16_home-ui-audit-lightweight-timeline-and-sparse-axis.md](file:///.agents/worklog.d/2026-10-16_home-ui-audit-lightweight-timeline-and-sparse-axis.md)
- **Sintesi**:
  - Esteso [`core/datePresets.js`](file:///core/datePresets.js) e unificata la barra data in `.gm-date-stepper` (`[‹ Data ▾ ›]`) + `.gm-date-quick-chips` su `HomeDashboardView`, `ForecastView` e `SpotMapView`, con calendario 14 giorni a 7 colonne (`Lun–Dom`) e anello attivo ciano neutro.
  - Alleggerite le barre `.gm-home-timeline-bar` a `3.5px` senza numeri orari né selezione visibile, con gerarchia di opacità Von Restorff (`flyable: 0.85`, `unflyable: 0.28`) e singolo bottone `.gm-spot-accordion-trigger` con chevron verticale.

---

## 2026-10-16 - Fase 8 & Governance: Full Codebase Audit & Risoluzione di 28 Criticità + Compattazione Memoria Cognitiva
- **Tipo**: Audit Architetturale Completo / Bugfix P0–P3 / PWA Offline-First / Governance Cognitiva
- **Dettagli**: [.agents/worklog.d/2026-10-16_full-codebase-audit-remediation.md](file:///.agents/worklog.d/2026-10-16_full-codebase-audit-remediation.md), [.agents/worklog.d/2026-10-16_memory-distillation-and-governance.md](file:///.agents/worklog.d/2026-10-16_memory-distillation-and-governance.md)
- **Sintesi**:
  - **Core, Persistenza & UI (P0–P3)**: riordinato il bootstrap in [`ui/app.js`](file:///ui/app.js) dando precedenza a IndexedDB; esclusi gli array GPS densi da `localStorage` in [`core/store.js`](file:///core/store.js); cablato `logbookManager.saveFlight()` per i voli manuali; implementato [`core/units.js`](file:///core/units.js); completato il cleanup dei listener DOM e di `sheetManager` sui cambi rotta; deduplicati i selettori in [`css/theme.css`](file:///css/theme.css) e registrato il Service Worker [`sw.js`](file:///sw.js) (801/801 test superati).
  - **Compattazione `MEMORY.md` e `WORKLOG.md`**: archiviati gli storici integrali in [`.agents/archive/MEMORY_v1_archive.md`](file:///.agents/archive/MEMORY_v1_archive.md) e [`.agents/archive/WORKLOG_v1_archive.md`](file:///.agents/archive/WORKLOG_v1_archive.md); distillato [MEMORY.md](file:///MEMORY.md) a `124 righe` (`-97%`) e [WORKLOG.md](file:///WORKLOG.md) a `< 120 righe` (`-95%`), con presidio automatico in [`tests/ui/shiftLeftGovernance.test.mjs`](file:///tests/ui/shiftLeftGovernance.test.mjs).
