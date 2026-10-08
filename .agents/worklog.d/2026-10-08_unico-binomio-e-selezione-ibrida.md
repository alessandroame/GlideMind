# Worklog: Regola dell'Unico Binomio e Selezione Ibrida Decollo/Atterraggio

## Contesto & Obiettivo
In risposta al feedback utente sul colpo d'occhio outdoor e sulla riduzione del sovraccarico cognitivo (*Miller's Law* e *Hick's Law*), abbiamo introdotto due principi cardine per la modellazione e la visualizzazione dei siti di volo:
1. **Regola dell'Unico Binomio (1 Decollo + 1 Atterraggio per Comprensorio)**: ogni comprensorio, sia nelle card sintetiche che nell'oggetto di valutazione finale, sintetizza esclusivamente una sola coppia coerente (1 decollo e 1 atterraggio).
2. **Strategia "Ibrido con Override Meteo" per la Selezione del Preferito**: definisce in modo deterministico e sicuro quale decollo e atterraggio mostrare come preferito.

## Architettura & Algoritmo di Selezione
Nel modello `core/comprensorio.js`:
- Ciascun decollo e atterraggio è dotato del flag `isPrimary: boolean`. Nel catalogo di default e nei dati censiti, i punti di riferimento storici o ufficiali hanno `isPrimary: true`.
- **Selezione Decollo**:
  - Di base viene selezionato il decollo principale (`primaryTakeoff`, con `isPrimary: true`).
  - Se il decollo principale ha severità aero $> 0$ (es. vento in coda, traverso critico o fuori limite), il motore scansiona i decolli alternativi del comprensorio.
  - Se un'alternativa presenta una severità strettamente inferiore (es. rampa opposta in asse col vento), il sistema commuta sul decollo alternativo, impostando `isTakeoffOverridden: true`, `isTakeoffPrimary: false` e generando un motivo trasparente (*Explainability 2026*).
  - Se anche le alternative sono non volabili (severità pari o peggiore), il sistema rimane sul decollo principale indicando lo stato `Chiuso`.
- **Selezione Atterraggio**:
  - Di base viene calcolato il rientro verso l'atterraggio ufficiale (`isOfficial` / `isPrimary`).
  - Se l'efficienza richiesta verso l'atterraggio principale eccede il limite di sicurezza dell'ala del pilota e un atterraggio alternativo censito garantisce un cono di planata sicuro, il sistema commuta sull'atterraggio alternativo sicuro.

## Contratti & Test
- Aggiornato `core/comprensorio.js` esponendo `takeoff`, `landing`, `isTakeoffPrimary`, `isLandingPrimary`, `isTakeoffOverridden`, `isLandingOverridden`, `takeoffOverrideReason`.
- Aggiornato `comprensorio-evaluator/SKILL.md` con la Sezione 2 "Regola dell'Unico Binomio".
- Aggiornato `MEMORY.md` con la Regola Vincolante 15.
- Aggiunti 6 nuovi test unitari in `tests/core/comprensorio.test.mjs` che coprono il baseline primario, l'override con vento in asse su rampa opposta e la persistenza sul primario in caso di meteo avverso generalizzato.
- Suite test: **197/197 test passanti** (0 fallimenti).
