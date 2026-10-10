# Pulizia e Normalizzazione SubLabel Pulsanti Date Picker

**Data**: 2026-10-10  
**Ambito**: `core/datePresets.js`, `tests/core/datePresets.test.mjs`  
**Tipo**: Refactor / UX Refinement  

---

### 1. Contesto & Diagnosi
A seguito di un audit ergonomico e di carico cognitivo sui pulsanti rapidi del date picker (`.gm-date-tabs`), è emerso che nel fine settimana (Sabato e Domenica) i bottoni presentavano una duplicazione testuale ridondante:
- **Pulsante 1**: `"Oggi"` / `"Sabato 10 Ott"` (13 caratteri nel sub-label)
- **Pulsante 2**: `"Domani"` / `"Domenica 11 Ott"` (15 caratteri nel sub-label)
- Nei giorni feriali (Lunedì-Venerdì) il sub-label era invece compatto (`"10 Ott"`, 6 caratteri).

Questa asimmetria violava la Legge di Prägnanz (ridondanza concettuale del giorno) e riduceva la leggibilità e glanceability (< 3s) in ambiente outdoor ad alta luminosità, consumando spazio orizzontale critico su viewport mobile compatti (360-390px).

---

### 2. Modifiche Applicate
1. **Normalizzazione Headless (`core/datePresets.js`)**:
   - Rimossa la concatenazione arbitraria del nome esteso del giorno (`'Sabato '` / `'Domenica '` / `'Lunedì '`) nei preset del weekend.
   - Uniformato `subLabel` all'output essenziale di `formatShortDate(d)` (es. `"10 Ott"`, `"11 Ott"`, `"17 Ott"`).
   - Rimosso il prefisso `"Prossimo"` nel terzo preset del weekend: la label passa da `"Prossimo Sab"` a `"Sabato"` (in piena coerenza con i giorni feriali e con la data di riferimento `17 Ott` sottostante).
2. **Copertura Test di Regressione (`tests/core/datePresets.test.mjs`)**:
   - Aggiunte asserzioni esplicite su `result.presets[i].subLabel` per Sabato e Domenica e aggiornata la verifica di `label === 'Sabato'`.
   - Tutti i 325 test della suite eseguono con successo (325/325 pass).

---

### 3. Esito UX
- Riduzione della lunghezza delle stringhe inferiori del 55-60%.
- Eliminazione totale della ridondanza visiva tra etichetta primaria e secondaria.
- Rimozione del prefisso verbale `"Prossimo"`: tutte le schede espongono una singola parola concisa (`Oggi`, `Domani`, `Sabato`).
- Spaziatura interna ottimizzata e miglior contrasto percepito sui touch target.
