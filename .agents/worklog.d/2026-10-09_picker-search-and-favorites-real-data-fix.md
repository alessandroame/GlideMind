# Worklog: Correzione Ricerca e Preferiti con Dati Reali nel Picker Comprensori

- **Data**: 2026-10-09
- **Contesto**: Segnalazione utente con screenshot in cui la ricerca nel picker comprensori (`ForecastView`) restituiva 87 risultati incongruenti digitando "cornizzo" e i preferiti non mostravano i dati reali del catalogo.

---

### Diagnosi Tecnica & Root Cause Analysis

1. **Causa Radice del Freeze della Ricerca**:
   - In `ForecastView.openPickerSheet()`, il listener `input` era registrato una sola volta sull'elemento `#picker-search-input`.
   - Alla prima battuta (la lettera `'c'`), il callback eseguiva `sheetBodyEl.innerHTML = renderSheetBody(e.target.value)`, distruggendo il DOM dell'intero drawer inclusa la casella di input.
   - Il nuovo input generato (`newInput`) non aveva alcun listener associato. I caratteri successivi (`o`, `r`, `n`, `i`, `z`, `z`, `o`) venivano scritti nel DOM senza attivare alcun filtraggio, lasciando a video la ricerca congelata alla lettera `'c'` (esattamente 87 siti in Italia contengono la `'c'` nel nome, provincia o regione).
2. **Causa Radice dei Preferiti Vuoti**:
   - `core/store.js` conteneva l'ID seed legacy `'monte-cornizzolo-lc'` anziché l'identificativo normalizzato del catalogo master (`'monte-cornizzolo-suello-lc-lc'`).
   - Il controllo `pinnedIds.has(s.id)` non trovava corrispondenze, azzerando la sezione Preferiti.

---

### Modifiche Implementate

1. **Separazione Architetturale Header/Sezioni nel Picker**:
   - L'input di ricerca risiede ora in una testata statica che **non viene mai distrutta** durante la digitazione.
   - Solo il contenitore sottostante `#picker-sections-container` viene aggiornato in modo reattivo a ogni evento di input.
   - Aggiunta delegazione degli eventi e ricerca multi-campo estesa a: nome spot, provincia, regione, comune/località, decolli e atterraggi associati.
2. **Allineamento dei Preferiti ai Dati Reali**:
   - Aggiornato `DEFAULT_INITIAL_STATE.pinnedSpotIds` in [core/store.js](file:///core/store.js) con i 4 principali comprensori del catalogo reale:
     - `monte-cornizzolo-suello-lc-lc` (Monte Cornizzolo, LC)
     - `monte-grappa-borso-del-grappa-tv-tv` (Monte Grappa, TV)
     - `calascio-rocca-calascio-calascio-aq-aq` (Calascio / Rocca Calascio, AQ)
     - `meduno-monte-valinis-toppo-pn-pn` (Meduno / Monte Valinis, PN)
   - Implementata la funzione `isSpotPinned(spot, pinnedIds)` con migrazione trasparente per vecchi ID seed memorizzati nel LocalStorage dei browser.
   - Toggling stella (`toggle-pin-spot`) reattivo in-place che preserva la query di ricerca attiva.

---

### Verifica e Risultati

- **Suite di Test**: 279 test superati su 279 (`npm test`).
- **Verifica Browser Headless**:
  - Digitando "cornizzo", i risultati passano deterministicamente da 87 a **1 solo comprensorio**: *Monte Cornizzolo (LC)*.
  - Con ricerca vuota, la sezione espone `⭐ Preferiti (4)` con i 4 siti reali e relative stelle attive, seguiti da `🗺️ Altri Comprensori (131)`.
