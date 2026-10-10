# Scheda Intervento: UX Governance Dati Meteo Offline e Gestione Stato N/D

**Data**: 2026-10-10  
**Ambito**: `core/comprensorio.js`, `core/openMeteoApi.js`, `ui/views/HomeDashboardView.js`, `css/theme.css`, `tests/ui/offlineWeatherUX.test.mjs`  
**Standard**: Integrità Scientifica & Anti-Sycophancy (Zero Mock Mascherati), Laws of UX (Visibility of System Status, Error Prevention, Skeleton Screens, Doherty Threshold)

---

## 1. Contesto e Diagnosi della Criticità
In caso di assenza di connettività di rete o selezione di una data futura non ancora archiviata in cache (es. 22 Ottobre):
1. **Verdetti e Valori Meteo Fittizi**: Il Core (`evaluateComprensorio`) utilizzava parametri sintetici cablati di default (`windSpeed = 12 km/h`, `windDir = 180°`), generando per i piloti verdetti di volabilità fittizi (*CAUTELA*, *NON VOLABILE*) e valori simulati mascherati da previsione reale (*15 km/h da SW*, *Raffiche Moderate*), in violazione del principio di sicurezza del volo e della regola *Zero Placebo UI*.
2. **Cache non Indicizzata per Data**: In `HomeDashboardView`, la mappa `cachedWeatherMap` utilizzava come chiave il solo `spotId` anziché la combinazione `spotId_targetDate`, riutilizzando impropriamente le previsioni di giornate differenti.
3. **Stallo del Badge di Loading**: Se il recupero batch non restituiva risultati o falliva offline, `networkStatus` non commutava allo stato terminale `'offline'`, lasciando indefinitamente attivo il badge `🟡 AGGIORNAMENTO...`.
4. **Richiesta Open-Meteo Limitata a 2 Giorni**: In `fetchBatchComprensoriWeather`, il parametro `forecast_days` era fissato staticamente a `2`, impedendo il caricamento di date oltre il giorno successivo anche in presenza di rete.

---

## 2. Decisioni Architetturali e UX Corretta

### A. Tassonomia dei 3 Stati Informativi
- **Stato A (Cache Offline Valida per la Data)**: Se esistono dati orari precedentemente scaricati per la data target, vengono mostrati i valori numerici, ma marcati visivamente come non aggiornati con status badge `Offline / Stima`.
- **Stato B (Assenza Totale di Previsioni per la Data)**:
  - Il verdetto di volabilità viene sostituito da un badge neutro tratteggiato: `Dati N/D` (`.gm-badge-nd`).
  - La velocità del vento viene sostituita da placeholder esplicito: `-- km/h` (nessuna direzione o raffica fittizia).
  - L'efficienza orografica di planata decollo-atterraggio (`1:X.X`) viene preservata, in quanto costante geometrica indipendente dalla meteorologia.
  - La riga di explainability visualizza `Previsione non disponibile offline` con marcatore neutro `○`.
- **Stato C (Transitorio di Caricamento con Skeleton Screens)**:
  - Se non esiste alcuna cache per la data selezionata, la lista attiva `this.isLoading = true` mostrando skeleton loader strutturati per azzerare il *Cumulative Layout Shift (CLS)*.
  - La chiusura del transitorio è garantita tramite blocco `finally` con ripristino di `this.isLoading = false` e commutazione deterministica a `'live'` o `'offline'`.

### B. Core Headless: Protezione `allowSynthetic`
In `core/comprensorio.js`, `evaluateComprensorio` introduce l'opzione `allowSynthetic` (default `true` per compatibilità con i test unitari orografici isolati, impostata su `false` in `HomeDashboardView`):
- Quando `allowSynthetic: false` e `weatherData` è assente o non contiene la `targetDate` richiesta (con supporto a fixture a giorno singolo $\le 24\text{h}$), la funzione restituisce `status: 'unavailable'`, `badge: 'Dati N/D'`, `weatherSnapshot: { windSpeed: null, ... }` e `isOfflineUnavailable: true`.

### C. Dimensionamento Dinamico `forecast_days`
In `core/openMeteoApi.js`, `fetchBatchComprensoriWeather` calcola dinamicamente i giorni di previsione necessari in base alla data target ($\le 16\text{ gg}$), consentendo l'ingestione batch di finestre fino a 14-16 giorni.

---

## 3. Verifiche Empiriche Automatizzate
- Aggiunta suite dedicata `tests/ui/offlineWeatherUX.test.mjs` (4 test di governance offline).
- Esecuzione completa di `npm test`: **335 test passati con 0 fallimenti**.
