# Worklog: Smart Date Selector & Cross-View Temporal Synchronization

**Data**: 2026-10-09  
**Autore**: Antigravity Assistant & Senior Architect  
**Ambito**: Core Engine / UI Layer / Date Selector / Laws of UX / Cross-View SSOT

---

## 1. Contesto & Obiettivi
Evoluzione del selettore temporale da controllo locale statico a 3 schede (`ForecastView`) a sistema cognitivo distribuito in tutta l'applicazione:
1. **Modello Mentale del Pilota**: Allineamento della navigazione temporale ai reali pattern di volo libero (pianificazione del weekend Sabato/Domenica a inizio settimana, e monitoraggio a breve termine Oggi/Domani).
2. **Adattamento Dinamico Senza Duplicati**: Eliminazione di pulsanti ridondanti (il venerdì "Domani" e "Sabato" coincidono; durante il weekend i preset espongono le opzioni correnti e la proiezione al prossimo weekend).
3. **Selettore Libero con Orizzonte Sinottico**: Accesso a date arbitrarie fino a +14 giorni tramite `sheetManager` con input nativo e griglia touch, con avviso per previsioni oltre 7 giorni.
4. **Sincronizzazione Cross-View SSOT**: La proprietà `store.activeDate` governa sia la graduatoria dei comprensori in `HomeDashboardView` sia i dettagli orari in `ForecastView`.
5. **Scorciatoie per Voli Passati**: Inserimento facilitato nel modulo Logbook con preset `Oggi`, `Ieri`, `Domenica`.

---

## 2. Decisioni Architetturali (ADR)
- **ADR-01: Modulo Puro Headless `core/datePresets.js`**:
  Tutte le logiche di calendario (differenze giorni, aggiunta date, formattazione ISO senza shift UTC, classificazione orizzonte numerico) risiedono in un modulo isolato senza dipendenze DOM, testato al 100% in ambiente headless.
- **ADR-02: Gestione Chip Custom con Ripristino Rapido**:
  Se il pilota seleziona una data specifica fuori dai preset standard, il componente inietta dinamicamente una scheda evidenziata mantenendo visibili i preset principali per un ritorno istantaneo a "Oggi" o "Sabato".
- **ADR-03: Ergonomia Touch Conforme a Fitts (48x48px)**:
  Il pulsante calendario `📅` e le schede data rispettano la soglia minima di tocco di 48px, prevenendo tocchi accidentali con guanti o in mobilità outdoor.

---

## 3. Impatto sui File e Verifica
- `core/datePresets.js`: funzioni `getSmartDatePresets`, `getAvailableCalendarDates`, `getPastDatePresets`, `formatDateIso`, `classifyForecastHorizon`.
- `tests/core/datePresets.test.mjs`: 12 test unitari per coprire tutti i giorni della settimana (Lunedì-Giovedì, Venerdì, Sabato, Domenica), date custom e orizzonti sinottici.
- `ui/views/ForecastView.js`: integrazione di `SmartDateBar`, `openDatePickerSheet`, gestione eventi `open-date-picker-sheet` e `pick-calendar-date`.
- `ui/views/HomeDashboardView.js`: integrazione di `SmartDateBar` nella sezione Volabilità e scorciatoie per date storiche nel modulo log volo.
- `css/theme.css`: classi `.gm-date-tab-calendar`, `.gm-horizon-notice`, `.gm-date-picker-sheet`, `.gm-date-grid`, `.gm-past-presets`.
- `tests/ui/forecastView.test.mjs` e `tests/ui/homeDashboardView.test.mjs`: suite estesa a 235 test con copertura completa.
- `DESIDERATA.md`: aggiornamento voce "Smart Date Selector & Picker Globale" a 🟢 Completato.

**Esito Test**: 235 test su 235 passati con successo (0 fallimenti).
