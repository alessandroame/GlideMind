# Aggiornamento Etichetta Tab Logbook: Statistiche & Valuta -> Statistiche

**Data**: 2026-10-12  
**Ambito**: `ui/views/LogbookView.js`, `tests/ui/logbookView.test.mjs`  
**Tipo**: UI Copy Refinement / De-cluttering  

---

### 1. Contesto & Diagnosi
Nel selettore segmentato (segmented control pill) della vista Logbook (`LogbookView.js`), la seconda opzione era denominata `Statistiche & Valuta`.
Per migliorare la sintesi visiva e ridurre la lunghezza del testo nel controllo a pillola su schermi mobili, l'etichetta è stata semplificata in `Statistiche`.

---

### 2. Interventi Applicati
1. **[`ui/views/LogbookView.js`](file:///d:/Github/GlideMind/ui/views/LogbookView.js)**:
   - Sostituita l'etichetta del pulsante del tab secondario da `Statistiche &amp; Valuta` a `Statistiche`.
2. **[`tests/ui/logbookView.test.mjs`](file:///d:/Github/GlideMind/tests/ui/logbookView.test.mjs)**:
   - Aggiornata l'asserzione di presenza nel DOM per verificare l'etichetta `Statistiche`.

---

### 3. Esito della Verifica
- Suite completa di test eseguita (`npm test`): 648 test superati con successo (0 fallimenti).
