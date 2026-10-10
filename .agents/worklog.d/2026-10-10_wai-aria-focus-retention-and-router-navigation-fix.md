# Risoluzione Errore di Routing (`navigateTo`) e Blocco WAI-ARIA su Focus Retention in Sheet Modali

- **Data**: 2026-10-10
- **Autore**: DeepMind Agentic Pair Programmer
- **Stato**: Completato (325 test unitari e di integrazione superati)

---

## 1. Contesto e Diagnosi delle Anomalie

Nel corso della navigazione interattiva dall'interfaccia Home Dashboard (`/#home`):
1. **Errore di Accessibilità Browser**:
   ```text
   Blocked aria-hidden on an element because its descendant retained focus. The focus must not be hidden from assistive technology users. Avoid using aria-hidden on a focused element or its ancestor. Consider using the inert attribute instead...
   Element with focus: <button.gm-glider-option-card >
   Ancestor with aria-hidden: <div.#sheet-container> <div id="sheet-container" role="dialog" aria-modal="true" aria-hidden="true" class>…</div>
   ```
   - **Diagnosi**: In [ui/sheetManager.js](file:///ui/sheetManager.js), durante l'invocazione di `closeSheet()`, l'attributo `aria-hidden="true"` veniva impostato su `#sheet-container` mentre `document.activeElement` era ancora un elemento figlio (es. `<button class="gm-glider-option-card">`). Il motore Chromium 122+ rifiuta e blocca l'applicazione di `aria-hidden="true"` su contenitori che mantengono discendenti a fuoco attivo.
2. **Eccezione Bloccante di Instradamento**:
   ```text
   HomeDashboardView.js:1378 Uncaught TypeError: this.router.navigateTo is not a function
       at HomeDashboardViewController.handleClick (HomeDashboardView.js:1378:21)
   ```
   - **Diagnosi**: Il router singleton in [ui/router.js](file:///ui/router.js) esportava unicamente `navigate(route, params)`. In [ui/views/HomeDashboardView.js](file:///ui/views/HomeDashboardView.js) e [ui/views/ForecastView.js](file:///ui/views/ForecastView.js), il click sulle card dei comprensori (`action === 'view-forecast'`) invocava `this.router.navigateTo('forecast')`. Nei test unitari, un mock permissive implementava `navigateTo`, nascondendo la divergenza rispetto all'API reale del router.

---

## 2. Interventi Ingegneristici Eseguiti

### A. Bonifica WAI-ARIA e Gestione `inert` in `ui/sheetManager.js` & `index.html`
- **Evacuazione Preventiva del Focus**: Prima di applicare `aria-hidden="true"` al contenitore `#sheet-container` in `closeSheet()`, se `containerEl.contains(document.activeElement)`:
  - Il focus viene ripristinato sull'elemento attivatore originario (`previousActiveElement`) se valido e collocato al di fuori del contenitore.
  - Se ancora presente all'interno di `#sheet-container`, viene invocato `document.activeElement.blur()`, azzerando qualsiasi discendente a fuoco prima dell'alterazione degli attributi ARIA.
- **Adozione dello Standard `inert`**:
  - In `index.html`, `#sheet-container` è inizializzato con `inert`.
  - In `ui/sheetManager.js`, `inert` viene applicato (`containerEl.setAttribute('inert', ''); containerEl.inert = true;`) quando lo sheet è chiuso, e rimosso (`removeAttribute('inert')`) all'apertura, garantendo la totale esclusione dall'albero di accessibilità e dalla sequenza di tabulazione da tastiera.

### B. Risoluzione Interfaccia Router in `ui/router.js` e View Controllers
- **Alias Nativo su Router**: In [ui/router.js](file:///ui/router.js), `createRouter()` restituisce ora `navigateTo: navigate` insieme all'interfaccia standard `navigate`.
- **Proxy di Navigazione Sicuro**: In [ui/views/HomeDashboardView.js](file:///ui/views/HomeDashboardView.js) e [ui/views/ForecastView.js](file:///ui/views/ForecastView.js), è stato introdotto il metodo helper `navigateTo(route, params)` che invoca con fallback `this.router.navigate || this.router.navigateTo`, rendendo i controller immuni da qualsiasi discrepanza tra contratti mockati e implementazione reale.

### C. Nuove Suite di Test e Garanzie di Regressione
- Creata la suite [tests/ui/sheetManager.test.mjs](file:///tests/ui/sheetManager.test.mjs) per verificare:
  - Inizializzazione con `aria-hidden="true"` e `inert`.
  - Transizione ad `aria-hidden="false"` e rimozione di `inert` all'apertura.
  - Sfocatura garantita (`blur()`) del discendente interno prima della chiusura.
  - Ripristino corretto del focus sull'elemento attivatore esterno.
- Estesa [tests/ui/router.test.mjs](file:///tests/ui/router.test.mjs) verificando l'alias `router.navigateTo === router.navigate`.
- Estesa [tests/ui/homeDashboardView.test.mjs](file:///tests/ui/homeDashboardView.test.mjs) con test specifico per la navigazione tramite router con API standard `navigate`.

---

## 3. Risultati della Verifica

- **Test Suite**: 325 test passati su 325 (46 suite, 0 fallimenti).
- **Verifica Accessibilità**: Eliminato ogni warning e blocco di `aria-hidden` in ambiente browser.
- **Navigazione Comprensori**: Il click su qualsiasi località nella Home Dashboard aggiorna regolarmente `selectedSpot` nello store e commuta la visualizzazione sulla rotta `#forecast`.
