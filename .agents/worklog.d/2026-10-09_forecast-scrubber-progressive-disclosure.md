# Worklog: Rimozione Numeri e Frecce Isolati dallo Scrubber e Bonifica Anti-Naked Data

**Data**: 2026-10-09  
**Autore**: Antigravity  
**Ambito**: UI / Ergonomia Mobile / Laws of UX / Progressive Disclosure / Governance  

---

## 1. Contesto & Diagnosi
- **Segnalazione**: L'utente ha chiesto:
  1. *"cosa indicano i numeri in basso nello scrubber"*
  2. *"perchè allora mostrare un livello di dettaglio così basso in una vista d'insieme come lo scrubber?"*
  3. *"e la freccia sotto cosa indica e perchè la lasciamo? toglila .. poi facciamo un piano per non fare succedere mai più questi problemi e correggere immediatamente difetti simili altrove"*
- **Criticità Rilevata**:
  1. *Violazione di NN/g Euristica #6 (Recognition over Recall)*: Il numero nudo senza unità e la freccia rotante senza rosa dei venti in colonna da 24-28px mancavano di affordance e contesto spaziale.
  2. *Violazione di Shneiderman (Overview First, Details on Demand)*: Lo scrubber orario è un selettore temporale di panoramica rapida a colpo d'occhio, non un cruscotto dati multi-scalare.
  3. *Ambiguità Semantica Vento ("Da" vs "Verso")*: La rotazione di `↑` di 180° per vento da Sud puntava verso il basso, inducendo dubbi tra provenienza e destinazione del flusso.
  4. *Ridondanza*: La barra semaforica sintetizza già la volabilità direzionale, mentre la bussola 360° e la scheda di sintesi attiva sovrastanti forniscono tutti i valori con unità esplicite (`9 km/h da 180° in asse`).

---

## 2. Modifiche Apportate
1. **`ui/views/ForecastView.js`**:
   - Rimosso `<span class="compact-wind">${speed}</span>` e `<span class="compact-arrow" ...>↑</span>` dal template dello scrubber (`renderStickyScrubber`).
   - Mantenuta l'accessibilità semantica completa via screen reader nell'attributo `aria-label="Ore ${h}:00, ${evalH.badge}, Vento ${speed} km/h"`.
   - Bonificate le etichette nel grafico dei radiosondaggi: `LCL:` sostituito con `Base:`, `Base LCL` con `Base Nubi (LCL)` e `Ceiling` con `Quota Max`.
2. **`css/theme.css`**:
   - Rimosse le classi `.compact-wind` e `.compact-arrow`.
   - Ridotta l'altezza minima delle colonne da `min-height: 68px` a `min-height: 50px` con padding ergonomico `padding: 6px 2px 5px`, liberando spazio per la vista dei contenuti e la barra semaforica a 32px.
3. **`ui/views/HomeDashboardView.js`**:
   - Importata la funzione `getCardinalDirection` da `../../core/flyability.js`.
   - Trasformata la stringa di direzione nelle card dei comprensori da `da 180°` a `da S (180°)`, accoppiando il punto cardinale immediato ai gradi numerici.
4. **`tests/ui/uiIntegrityAudit.test.mjs`**:
   - Creata una nuova suite automatizzata di audit statico per verificare l'assenza di numeri nudi, frecce rotanti senza bussola e acronimi isolati in tutte le viste UI.
5. **`MEMORY.md`**:
   - Aggiunta la lezione 36: *Progressive Disclosure nei Controlli di Panoramica e Scrubber Temporali (Anti-Naked Data)*.

---

## 3. Verifica e Risultati
- **Automated Tests**: 285/285 test superati con successo in Node.js test runner (`npm test`).
- **Verifica Visiva DevTools**: Convalidato il layout mobile a 375px; lo scrubber orario è ora una barra temporale pura (Ora + Barra semaforica), ad altissima glanceability (< 1s), priva di rumore o ambiguità.
