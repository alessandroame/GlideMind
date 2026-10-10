# Rimozione Pulsante "Visualizza Previsioni" e Attivazione Diretta al Tap sullo Spot

**Data**: 2026-10-10  
**Autore**: GlideMind Agent  
**Ambito**: `ui/views/ForecastView.js`, `tests/ui/forecastView.test.mjs`

---

## 1. Contesto & Requisiti Utente
L'utente ha richiesto di rimuovere il pulsante esplicito "Visualizza Previsioni ›" (`.gm-picker-apply-btn`) presente nella scheda di selezione comprensorio per i siti con più decolli o atterraggi, abilitando la visualizzazione immediata delle previsioni al tap sullo spot o sul rispettivo chip di decollo/atterraggio:
- *"vorrei togliere visualizza previsioni e visualizzarle al tap sullo spot"*

---

## 2. Diagnosi & Decisioni Architetturali

1. **Riduzione della Frizione Operativa (Baymard & Fitts's Law)**:
   - Nello sheet di selezione comprensorio (`openPickerSheet`), i comprensori a singolo decollo consentivano già l'apertura immediata al tap sulla card (`data-action="pick-spot"`).
   - Per i comprensori con decolli multipli (es. Chialamberto, Monte Cornizzolo), la presenza del pulsante di conferma "Visualizza Previsioni ›" imponeva un secondo tocco superfluo e disallineava l'ergonomia rispetto al resto dell'elenco.
2. **Unificazione del Flusso di Selezione Touch**:
   - Rimossa la riga del pulsante `.gm-picker-apply-row` e `.gm-picker-apply-btn`.
   - Assegnato `data-action="pick-spot"` all'intero elemento card `.gm-picker-item` e alla riga titolo `.gm-picker-item-main`.
   - Unificata la gestione degli eventi in `handleClick`:
     - Il tap sulla card o sul titolo comprensorio seleziona il sito con il decollo e l'atterraggio attivi o primari, chiude lo sheet (`closeSheet()`), commette lo stato nello store e renderizza istantaneamente la vista con il fetch meteo (`fetchWeatherDataAsync`).
     - Il tap su un chip di decollo specifico (`data-action="pick-spot-takeoff"`) o di atterraggio (`data-action="pick-spot-landing"`) commette immediatamente lo spot con il sub-spot selezionato, chiude lo sheet e renderizza la schermata previsioni senza passaggi intermedi.
     - Il tap sul pulsante stella preferiti (`data-action="toggle-pin-spot"`) continua a commutare i preferiti in isolamento senza scatenare la chiusura dello sheet.
3. **Resilienza Risoluzione Spot ID**:
   - `spotId` viene risolto primariamente da `actionEl.getAttribute('data-spot-id')` con fallback trasparente su `card.getAttribute('data-spot-id')`.

---

## 3. Verifica Automatizzata
- Aggiornati i casi di test in `tests/ui/forecastView.test.mjs` (Subtest 49, 50, 52).
- Eseguita l'intera suite di regressione (72 suite, 548 test, 0 fallimenti).
