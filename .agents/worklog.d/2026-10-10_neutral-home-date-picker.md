# Worklog: Neutralizzazione del Calendario e Selettore Data nella Home Dashboard

**Data**: 2026-10-10  
**Autore**: GlideMind UI & Flight Architecture  
**Ambito**: `ui/views/HomeDashboardView.js`, `tests/ui/homeDashboardView.test.mjs`

---

## 1. Contesto & Diagnosi
Nel selettore temporale della Home Dashboard (sia nei quick tabs "Oggi, Domani, Sabato..." sia nel foglio bottom sheet del calendario a 14 giorni), venivano visualizzati indicatori di volabilità (dot e badge semantici a 4 colori: Volabile, Cautela, Non Volabile, Severo).
Poiché nella Home non è selezionato alcuno spot specifico (è una dashboard comparativa di decine di comprensori), il controller ripiegava silenziosamente sul primo preferito o su `DEFAULT_COMPRENSORI[0]` (Monte Cornizzolo). Questo generava un grave bias cognitivo e di sicurezza per il pilota: una giornata marcata come "Non Volabile" per via del vento su Cornizzolo (esposto a Sud) poteva trarre in inganno il pilota, nonostante altri comprensori esposti diversamente potessero essere perfettamente volabili.

---

## 2. Risoluzione Architetturale
1. **Neutralizzazione del Date Picker nella Home**:
   - In `HomeDashboardView.js` (`renderDateBar`): rimossa la chiamata a `getMultiDayFlyability`. `getSmartDatePresets` viene ora invocato senza `flyabilityMap`, eliminando i dot di volabilità arbitrari dai tab rapidi.
   - In `HomeDashboardView.js` (`openDatePickerSheet`): invocato `getAvailableCalendarDates(today, 14, null)`. La griglia del calendario mostra date pulite (giorno della settimana, numero, mese, indicatore di orizzonte sinottico per > 7gg) senza classi `fly-*`, senza badge semantici per singolo sito e senza legenda fuorviante.
   - Titolo del foglio aggiornato in *"Seleziona Data Previsioni"*.
2. **Preservazione della Volabilità Multi-Giorno in `ForecastView`**:
   - `ForecastView` mantiene i badge a 4 colori e la legenda, dove la volabilità è univocamente e rigorosamente riferita al decollo e atterraggio del comprensorio visualizzato.

---

## 3. Verifica
- Esecuzione `npm test`: 325 test passati su 46 suite, 0 fallimenti.
- Test unitario `tests/ui/homeDashboardView.test.mjs` aggiornato per verificare la neutralità del calendario nella Home.
