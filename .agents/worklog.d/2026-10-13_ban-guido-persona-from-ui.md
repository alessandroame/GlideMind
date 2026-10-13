# Intervento: Rimozione del Nome Guido dai Testi dell'Interfaccia Utente

- **Data**: 2026-10-13
- **Ambito**: UI Copy, ForecastView, FlightDetailSheet, Governance Shift-Left
- **Tipo**: Refactoring Lessicale & Conformità Anti-Sycophancy

## Contesto & Motivazione
L'applicazione utilizzava impropriamente il nome "Guido" all'interno di elementi visibili dell'interfaccia utente:
1. `ForecastView`: card `Briefing di Volo (Guido)`, intestazione screen-reader `Briefing Sicurezza Guido`, sintesi telegrafica con prefisso `Guido: "Oggi a..."`.
2. `FlightDetailSheet`: tag didattico `Istruttore Guido` affiancato alla sezione "Debriefing Didattico di Sicurezza".

L'uso di una persona/mascotte fittizia crea attribuzioni improprie rispetto alla figura reale dell'istruttore Guido Teppa e diverge dai criteri di sobrietà e rigore ingegneristico. La direttiva prescrive l'eliminazione totale di "Guido" dalla UI a meno che non si tratti di una citazione bibliografica esplicita del suo manuale di volo.

## Modifiche Apportate
1. **ForecastView (`ui/views/ForecastView.js`)**:
   - Rinominate le intestazioni visibili da `Briefing di Volo (Guido)` a `Briefing di Volo`.
   - Bonificata l'intestazione accessibile screen-reader da `Briefing Sicurezza Guido` a `Briefing di Sicurezza`.
   - Rimossa la persona parlante fittizia (`Guido: "..."`) nella stringa di sintesi del briefing generato, lasciando la formulazione diretta e pulita.
   - Formalizzata la funzione headless `generateFlightBriefing`, mantenendo `generateGuidoBriefing` come alias retrocompatibile per le suite di test.
2. **FlightDetailSheet (`ui/views/FlightDetailSheet.js`)**:
   - Aggiornato il tag didattico della card debriefing da `Istruttore Guido` a `Istruttore`.
3. **Automated Governance Shift-Left (`tests/ui/uiIntegrityAudit.test.mjs`)**:
   - Aggiunto test di integrità che verifica in modo permanente l'assenza di `Briefing di Volo (Guido)`, `Briefing Sicurezza Guido`, `Guido: "` e `Istruttore Guido` dai sorgenti UI.
4. **Allineamento Suite di Test**:
   - Aggiornate le asserzioni in `tests/ui/forecastView.test.mjs` e `tests/ui/flightDetailSheet.test.mjs` per validare l'assenza del nome Guido nella UI.
