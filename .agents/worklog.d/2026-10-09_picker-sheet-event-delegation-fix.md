# Worklog: Risoluzione Mancata Selezione Comprensorio da Picker Sheet (Event Delegation)

**Data**: 2026-10-09  
**Autore**: Antigravity  
**Ambito**: UI / Event Architecture / DOM / Mobile Ergonomics  

---

## 1. Contesto & Diagnosi
- **Segnalazione**: L'utente ha segnalato che "la selezione della località dal picher non funziona".
- **Rilievi via Chrome DevTools & Trace**:
  1. All'apertura del picker dei comprensori (`#sheet-container`), il rendering dei 135 comprensori e il filtraggio istantaneo della ricerca funzionavano regolarmente.
  2. Tuttavia, il tap o click su qualsiasi riga di comprensorio (`data-action="pick-spot"`) non produceva alcun effetto: lo sheet rimaneva aperto, lo store non veniva aggiornato e il header mostrava ancora il comprensorio precedente.
  3. **Causa Radice Architetturale**:
     - `#sheet-container` è collocato in `index.html` all'interno di `#app-root` come elemento fratello (sibling) di `#main-view`, per garantire l'isolamento dello stacking context e la corretta accessibilità modale (`role="dialog"`).
     - `ForecastViewController.mount()` (e similmente `HomeDashboardViewController.mount()`) collegavano l'event listener delegato `this.boundClickHandler` esclusivamente a `this.containerEl` (`#main-view`).
     - Gli eventi scatenati dentro `#sheet-container` risalivano il DOM (`#sheet-container` -> `#app-root` -> `document`), senza mai attraversare `#main-view`. Di conseguenza, `this.handleClick` non veniva mai intercettato per alcuna interazione all'interno dello sheet.

---

## 2. Modifiche Apportate
1. **`ui/views/ForecastView.js`**:
   - In `mount(containerEl)`: registrato `this.sheetContainerEl` (`#sheet-container`) e collegato `this.boundClickHandler` anche al contenitore degli sheet.
   - In `unmount()`: rimozione pulita del listener da `this.sheetContainerEl`.
   - In `renderPickerSections()`: esteso `data-action="pick-spot"` e `data-spot-id` all'intero elemento card `.gm-picker-item`, azzerando qualsiasi dead zone di tocco (Fitts's Law).
   - In `handleClick()`: aggiunto supporto al fallback tramite slug (`slugifyComprensorio`) per garantire resilienza su ID eterogenei.
2. **`ui/views/HomeDashboardView.js`**:
   - Applicata identica sincronizzazione di `this.sheetContainerEl` in `mount()` e `unmount()` per prevenire anomalie analoghe nei dialoghi modali aperti dalla dashboard.
3. **`tests/ui/locationsCatalogHydration.test.mjs`**:
   - Aggiunto test end-to-end simulando la selezione di un comprensorio reale da `#sheet-container`, verificando l'aggiornamento reattivo dello store (`selectedSpot`), della cronologia recenti (`recentSpotIds`) e il teardown pulito in `unmount()`.
4. **`MEMORY.md`**:
   - Documentata la lezione 37 (*Event Delegation nei Componenti Portal / Modal Sheets*).

---

## 3. Verifica Empirica e Test
- **Verifica Diretta Chrome DevTools**:
  - Toccato "Meduno / Monte Valinis": lo sheet si chiude e il header mostra istantaneamente `"Meduno / Monte Valinis (PN)"`.
  - Aperto il picker, digitato "Norma": filtrato 1 solo comprensorio. Toccato il risultato: lo sheet si chiude e la vista mostra `"Norma (LT)"` con calcolo aerologico completo (decollo Parapendio Norma 1000m, atterraggio Ninfa 35m, efficienza 1:2.9).
  - Toccata la stella di Calascio e Grappa: aggiornamento immediato dei preferiti (`pinnedSpotIds`).
- **Test Suite**: 281/281 test superati con successo in `npm test`.
