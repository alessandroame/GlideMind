# Refactor Vocabolario Semantico Volabilità: Transizione da "Aperto/Chiuso" a "Volabile/Non Volabile"

**Data**: 2026-10-10  
**Autore**: GlideMind Agent  
**Ambito**: HMI Aeronautica, Coerenza Semantica & Core Headless  

---

## 1. Contesto & Motivazione

Nelle card della Home Dashboard, lo stato di volabilità del comprensorio veniva etichettato con i badge `Aperto` (verde), `Cautela` (giallo) e `Chiuso` (rosso). Questa terminologia evocava un modello concettuale improprio legato a impianti fisici, strade o stazioni sciistiche (interdizioni fisiche o revoche amministrative), inducendo il pilota a dubitare dell'accessibilità materiale del decollo anziché comprendere che l'indice esprimeva la volabilità meteorologica dell'aerologia locale (es. raffiche forti o vento sostenuto).

Inoltre, era presente un'asimmetria semantica tra le card (`Aperto` / `Chiuso`) e la legenda del date picker di `ForecastView` e `HomeDashboardView` (che già impiegava `Volabile`).

---

## 2. Decisioni & Interventi Architetturali

1. **Allineamento Semantico del Core Headless**:
   - In [`core/comprensorio.js`](file:///c:/github/GlideMind/core/comprensorio.js), aggiornato l'algoritmo `evaluateComprensorio`:
     - Stato `flyable` $\to$ Badge `Volabile` (anziché `Aperto`).
     - Stato `unflyable` $\to$ Badge `Non Volabile` (anziché `Chiuso`).
   - In [`core/flyability.js`](file:///c:/github/GlideMind/core/flyability.js), allineato `calculateDailyFlyabilitySummary`:
     - Stato `unflyable` $\to$ `statusLabel: 'Non Volabile'`.
   - In [`core/datePresets.js`](file:///c:/github/GlideMind/core/datePresets.js), aggiornato `normalizeDateFlyability`:
     - Default label per stato `unflyable` $\to$ `'Non Volabile'`.

2. **Aggiornamento Legende UI**:
   - In [`ui/views/ForecastView.js`](file:///c:/github/GlideMind/ui/views/ForecastView.js) e [`ui/views/HomeDashboardView.js`](file:///c:/github/GlideMind/ui/views/HomeDashboardView.js), aggiornata la legenda del foglio calendario a 4 colori:
     `● Volabile` | `▲ Cautela` | `✕ Non Volabile` | `⚡ Severo`.

3. **Allineamento Suite di Test**:
   - Aggiornati i test unitari in [`tests/core/comprensorio.test.mjs`](file:///c:/github/GlideMind/tests/core/comprensorio.test.mjs), [`tests/core/flyability.test.mjs`](file:///c:/github/GlideMind/tests/core/flyability.test.mjs), [`tests/core/datePresets.test.mjs`](file:///c:/github/GlideMind/tests/core/datePresets.test.mjs), [`tests/ui/homeDashboardView.test.mjs`](file:///c:/github/GlideMind/tests/ui/homeDashboardView.test.mjs) e [`tests/ui/forecastView.test.mjs`](file:///c:/github/GlideMind/tests/ui/forecastView.test.mjs).
   - Suite completa: 325 test verificati con successo (0 fallimenti).
