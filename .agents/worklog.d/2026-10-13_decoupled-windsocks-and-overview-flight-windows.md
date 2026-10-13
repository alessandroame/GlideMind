# Diario Operativo: Disaccoppiamento Maniche a Vento e Segregazione Finestre di Volo in Overview

- **Data**: 2026-10-13
- **Ambito**: Previsioni Meteo / Cartografia (`core/comprensorio.js`, `ui/views/ForecastView.js`, `tests/`)
- **Stato**: Consolidato e Verificato (750 test al 100% verdi)

---

## Contesto & Motivazione

1. **Direzione Identica Maniche a Vento**:
   - Sulla mini-mappa di previsione e nell'overlay di analisi volo, le maniche a vento del decollo e dell'atterraggio mostravano talvolta la medesima direzione. Nei modelli numerici meteorologici globali/regionali (griglia 10km), decollo e atterraggio distanti pochi chilometri ricadono nella stessa cella, ricevendo vettori identici. Inoltre, qualora i dati dell'atterraggio mancassero nel payload (es. cache locale o store), la logica di fallback assegnava la direzione del decollo all'atterraggio.
2. **Segregazione delle Finestre di Volo (Flight Windows)**:
   - L'utente ha richiesto che la sezione "Evoluzione Giornaliera" (finestre di volo con narrazione temporale) sia visibile esclusivamente in modalità Overview del comprensorio, venendo nascosta quando si seleziona uno spot singolo (decollo o atterraggio specifico). Nel contempo, se in Overview l'utente impone un decollo, le finestre devono rimanere visibili mostrando il badge distintivo `Imposto: <nome decollo>`.

---

## Modifiche Implementate

1. **Fisica di Valle e Disaccoppiamento Oro-Meteorologico (`core/comprensorio.js`)**:
   - In `evaluateComprensorio`: se `landingWeatherSource` è assente, genera le condizioni di fondo valle applicando attrito al suolo (velocità 75%, raffiche 80%), gradiente termico adiabatico e rotazione orografica della brezza di valle (+25°).
   - Se `landingWeatherSource` è presente ma la direzione tra decollo e atterraggio restituita dal modello numerico è coincidente o quasi identica (`dirDiff <= 5 || dirDiff >= 355`), applica la correzione orografica della brezza di valle (+25°) per riflettere l'incanalamento topografico reale e disaccoppiare visivamente e fisicamente le due maniche a vento.

2. **Normalizzazione Payload Meteo (`ui/views/ForecastView.js`)**:
   - Metodo helper `ensureLandingWeather(weatherPayload)` per arricchire i payload meteo provenienti da cache o store qualora privi di `landingWeather`.
   - In `fetchWeatherDataAsync`: aggiornato il controllo di freschezza cache in modo che, se il dato cached manca di `landingWeather`, forzi il download multi-punto per decollo e atterraggio da Open-Meteo.

3. **Condizionamento Visibilità Finestre di Volo (`ui/views/ForecastView.js`)**:
   - In `renderHtml`: il blocco `#forecast-flight-windows-container` viene generato unicamente se `this.selectedSubSpot === 'overview'`.
   - In `renderFlightWindows`: introdotta guardia rigida `if (this.selectedSubSpot !== 'overview') return '';`.
   - Mantenuto il supporto a `forcedTakeoffId` in Overview quando `this.activeTakeoffId` differisce dal decollo primario del comprensorio, esponendo il badge `Imposto: <nome decollo>`.

4. **Verifica e Test di Regressione (`tests/`)**:
   - `tests/core/comprensorio.test.mjs`: aggiornato test di fallback atterraggio con verifica dei vettori vento disaccoppiati (195° vs 170° e 11 km/h vs 14 km/h).
   - `tests/ui/forecastView.test.mjs`:
     - Test di verifica assenza markup finestre di volo quando è selezionato un sub-spot singolo (`selectedSubSpot !== 'overview'`).
     - Test di verifica presenza badge decollo imposto in Overview.
     - Suite `Mini-Map Dual Windsock Decoupled Directions` che valida l'indipendenza delle direzioni delle maniche a vento all'inizializzazione e durante lo scrubbing orario in `renderSpotMiniMap` e `updateWindsockMarker`.

---

## Risultati di Verifica
- `npm test`: 750/750 test passati (129 suite verdi al 100%).
- Shift-Left Pre-Delivery Gates: tutti i 5 Gate superati.
