# Intervento: Riprogettazione Tripartita della UX del Libretto di Volo (Logbook, Dashboard Statistiche e Import Dedicato)

**Data**: 2026-10-10  
**Autore**: Antigravity  
**Ambito**: UI / Ergonomia Mobile / Logbook / Laws of UX  

---

## 1. Contesto e Motivazione
A valle dell'audit UX sul Libretto di Volo (Logbook) sollecitato dal pilota, sono emerse due macro-criticità ergonomiche:
1. **Sovraccarico Tematico della Schermata**: la presenza di una dropzone massiccia permanente ($200\text{px}$) in cima al viewport, combinata con 4 riquadri statistici di carriera e l'elenco dei voli, sottraeva oltre il 50% del viewport utile a ogni sessione per un'azione compiuta raramente (upload tracce).
2. **Sovraccarico Informativo e Ridondanza delle Card Volo**: card pesanti (~$320\text{px}$ di altezza), durata duplicata (nel sottotitolo e nella griglia), 6 riquadri metrici fitti e 4 pulsanti di testo impilati (`Dettagli & Debriefing`, `Visualizza Replay 3D`, `Scarica IGC`, `Elimina`) generavano forte confusione visiva (364 bottoni per 91 voli).

---

## 2. Decisioni Architetturali (ADR)

### A. Ripartizione Tripartita delle Intenzioni (Jobs To Be Done)
- **Logbook Feed Puro (`Voli`)**: consultazione rapida, ricerca testuale istantanea e filtri a chip a scorrimento orizzontale (`Tutti`, `EN-A`, `EN-B`, `Quest'anno`).
- **Dashboard Pilota (`Statistiche & Valuta`)**: focalizzata su Pilot Currency (continuità di volo e sicurezza EN-A), totali di carriera (ore, voli, termiche, manovre), record personali e distribuzione geografica.
- **Ingestione On-Demand (`ImportFlightSheet.js`)**: modal drawer dedicato aperto via `+ Importa` in testata o come empty-state quando il libretto ha 0 voli.

### B. Riprogettazione Card Volo Snella (~110px) e Card-as-Target
- Primissimo elemento: `#NumeroVolo` con badge monospace tabulare.
- Titolo decollo/atterraggio e pillola classe vela.
- Sottotitolo compatto con sola data, orario di decollo e modello vela (eliminata la duplicazione del minutaggio).
- Triage metrico a 3 valori chiave su riga singola: Tempo, Quota Max, Guadagno Max.
- Sparkline altimetrica integrata da $22\text{px}$.
- L'intera card diventa un touch target unico ($\ge 48\text{px}$) che apre la `FlightDetailSheet` (in cui sono già presenti 3D Replay, download IGC, debriefing e note).
- Pulsante rapido `&times;` per eliminazione discreta con finestra di Undo da 5s (NN/G #3).

---

## 3. File Creati e Modificati
- `ui/views/ImportFlightSheet.js`: Nuovo modulo per la gestione guidata dell'upload IGC e backup ParaMeteo.
- `ui/views/LogbookStatsView.js`: Nuovo modulo per il rendering del cruscotto statistiche, record personali e valuta pilota.
- `ui/views/LogbookView.js`: Refactoring con sub-tab segmented control, filtri, ricerca reattiva e card snelle.
- `css/theme.css`: Stilizzazione responsive per segmented control, search, filtri chip, lean cards e drawer di import.
- `tests/ui/importFlightSheet.test.mjs`: Test suite unitari e di integrazione per l'import drawer.
- `tests/ui/logbookStatsView.test.mjs`: Test suite per la dashboard statistiche e continuità.
- `tests/ui/logbookView.test.mjs`: Suite aggiornata ed estesa (8 test passati).
- `MEMORY.md`: Aggiunta Lezione #103.

---

## 4. Evidenze di Collaudo
- Test specifici Logbook: 13/13 test superati (`logbookView`, `importFlightSheet`, `logbookStatsView`).
- Suite globale di regressione: 535 test in 86 suite superati con successo (0 errori).
- Conformità limite righe: tutti i file al di sotto delle 1.000 righe (`LogbookView.js` 872 righe).
