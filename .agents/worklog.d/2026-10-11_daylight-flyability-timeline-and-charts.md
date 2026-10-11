# Worklog: Finestra Diurna di Volabilità (Alba-Tramonto) per Timeline Orarie e Grafici Parametrici

- **Data**: 2026-10-11
- **Autore**: Antigravity Assistant & Alessandro Amé
- **Ambito**: Aerologia / Regolamentazione VFR / Architettura Headless / UI Scrubber & Parameteo Charts

---

## 1. Contesto & Requisiti
- **Richiesta Utente**:
  1. La timeline della volabilità (`Timeline Volabilità`, scrubber orario) deve mostrare sempre solo le ore del giorno volabili in termini di alba e tramonto effettivi (`[sunriseHour, sunsetHour]`), invece di un intervallo fisso 08:00 - 20:00.
  2. La stessa regola vincolante vale per i grafici temporali (vento, raffiche, LCL/base nube) e per l'analisi di volabilità di un sito o comprensorio (`computeParamMetrics`, briefing AI).
- **Razionale Aeronautico**: Le regole del volo a vista VFR (Visual Flight Rules) e la normativa di volo libero vietano tassativamente il volo notturno in parapendio. Mostrare ore notturne o di buio (es. ore 17:00-20:00 con tramonto invernale alle 16:40) come "volabili" vìola i principi di sicurezza e disorienta i piloti. Parallelamente, tagliare le ore mattutine in estate (es. alba 05:30) esclude le finestre più stabili e dolci per il volo scuola ed EN-A.

---

## 2. Diagnosi & Decisioni Architetturali

1. **Modulo Headless Canonico Solar Ephemeris (`core/daylight.js`)**:
   - Implementate le formule astronomiche standard NOAA per la declinazione solare, l'equazione del tempo e l'angolo orario solare con angolo zenitale ufficiale di $90.833^\circ$ (per rifrazione atmosferica).
   - Introdotta la gerarchia SSOT `resolveDaylightHours(weatherData, targetDate, fallbackLocation)`:
     1. Array `weatherData.daily` con timestamp reali di alba e tramonto.
     2. Descrittore pre-calcolato `weatherData.daylight`.
     3. Metadati `weatherData.meta`.
     4. Calcolo astronomico NOAA basato sulle coordinate geografiche (estratte tramite `extractSpotCoordinates`) e data di destinazione (con supporto ora legale CEST / UTC+2).
     5. Fallback nominale con guardie.

2. **Bounding Dinamico in `core/flyability.js`**:
   - Aggiornato `calculateTimelineScores` per calcolare gli score esclusivamente tra `daylight.sunriseHour` e `daylight.sunsetHour`.

3. **Bounding dei Grafici e Briefing in `ForecastView.js`**:
   - Limitati i punti orari di `computeParamMetrics`, `renderSvgTrendChart`, `renderWindChart` e `renderSoundingChart` rigorosamente all'intervallo `[daylight.sunriseHour, daylight.sunsetHour]`.
   - Bounded il briefing `generateGuidoBriefing` e il metodo `_resolveInitialHour` alla finestra solare.
   - Bounded la timeline principale e la timeline dell'overlay analisi volo (`renderTimelineGrid`, `setHour`, `updateHourFromPointer`, stepper buttons, delegazione click).

4. **Bounding della Mappa Comprensori in `SpotMapView.js`**:
   - Aggiornati `renderTimelineGrid`, `updateHourFromPointer`, `mount` (risoluzione ora iniziale e sincronizzazione store), `setActiveHour` e `updateScrubberBars` per utilizzare `daylight.hours`.
   - Rimossa la proprietà statica `this.hoursRange` in favore di `daylight.hours`.
   - Caching deterministico del meteo sintetico iniziale in `this.cachedWeatherMap`.

5. **Flessibilità CSS Grid e Compatibilità Retroattiva (`css/theme.css`)**:
   - `.gm-timeline-grid-13` adotta `grid-template-columns: repeat(var(--gm-timeline-slots, 13), 1fr);`, supportando configurazioni da 8 a 16 slot senza rompere la delegazione eventi nei test e nella UI.

---

## 3. Verifiche & Risultati
- Unit test dedicati:
  - `tests/core/daylight.test.mjs`: 7/7 test passati.
  - `tests/core/flyability.test.mjs`: 21/21 test passati.
  - `tests/ui/forecastView.test.mjs`: 61/61 test passati.
  - `tests/ui/spotMapView.test.mjs`: 24/24 test passati.
- Test suite completa di regressione:
  - `npm test`: **652 test superati su 82 suite con 0 fallimenti (100% green)**.

---

## 4. Riferimenti
- Lezione Appresa registrata in `MEMORY.md`: **#118**.
