# Fix Persistenza Layer Cartografico al Reload ed Effetto Vetro (Glassmorphism) Controlli Mappa

**Data**: 2026-10-10  
**Ambito**: Core Store / UI Shell / Design System (`core/store.js`, `ui/app.js`, `css/theme.css`, `tests/core/store.test.mjs`)  
**Stato**: Completato  

---

## 1. Contesto & Difetti Rilevati
1. **Perdita Stato Layer al Refresh**: Ricaricando la pagina (F5), il layer cartografico selezionato tornava costantemente su `'dark'`, sovrascrivendo l'ultima scelta dell'utente (`OpenTopo`, `Satellite`, o `CyclOSM`).
2. **Aspetto Visivo Piatto e Opaco**: I controlli mappa apparivano con sfondi scuri o bianchi opachi/solidi, senza la naturale trasparenza e rifrazione del vetro richiesta per le interfacce cartografiche moderne ("effetto vetro").

---

## 2. Root Cause Analysis
1. **Disconnessione Storage Adapter**:
   - `core/store.js` esportava il singleton `store = createStore()`, il quale, in assenza di adapter esplicito, istanziava di default un `createInMemoryStorageAdapter()` in memoria volatile (necessario per consentire i test Node.js headless senza crash).
   - Nella shell dell'applicazione (`ui/app.js`), l'adapter `createLocalStorageAdapter(window.localStorage)` non veniva mai montato sullo store. Di conseguenza, le chiamate a `store.setState({ ui: { ...ui, mapLayer } })` salvavano lo stato esclusivamente nella memoria RAM della singola scheda del browser, venendo cancellate istantaneamente a ogni refresh.
2. **Opacità Piatta dei Controlli**:
   - Sia i selettori della mini-mappa che i pulsanti `.gm-map-pill-btn` in `SpotMapView` impiegavano sfondi quasi opachi (`var(--gm-bg-card)` o `rgba(15,23,42,0.78)`), annullando l'effetto ottico del `backdrop-filter`.

---

## 3. Interventi Tecnico-Architetturali
1. **Montaggio Dinamico Storage Adapter nella Shell (`core/store.js` + `ui/app.js`)**:
   - Aggiunto il metodo `setStorageAdapter(adapter)` all'interfaccia dello store in `core/store.js`, consentendo il passaggio pulito di adapter senza violare l'isolamento headless del core.
   - In `ui/app.js`, all'avvio del modulo e in `bootstrapApp()`, montato esplicitamente `createLocalStorageAdapter(window.localStorage)` e invocato `store.loadPersistedState()`.
   - In questo modo, qualsiasi mutazione del layer viene scritta direttamente nel `localStorage` del browser (`glidemind_store_ui`) e ripristinata fedelmente al ricaricamento.
2. **Effetto Vetro Cristallino (Specular Glassmorphism)**:
   - Aggiornati i controlli mini-mappa (`.gm-mini-map-layer-select`, `.gm-mini-map-expand-btn`) e i pulsanti della barra mappa (`.gm-map-pill-btn`, `.gm-map-top-spot-btn`):
     - `backdrop-filter: blur(12px) saturate(180%)` per far risaltare caldamente i colori dell'orografia e della vegetazione attraverso il vetro.
     - Sfondo a gradiente angolare a due toni semitrasparenti (`linear-gradient(135deg, rgba(255,255,255,0.16) 0%, rgba(15,23,42,0.62) 100%)`).
     - Bisellatura e riflesso speculare superiore: `box-shadow: inset 0 1px 1px 0 rgba(255, 255, 255, 0.35), 0 2px 8px rgba(0, 0, 0, 0.35)`.
     - Bordo lucido perimetrale sottile: `border: 1px solid rgba(255, 255, 255, 0.28)`.
     - Varianti ad alto contrasto coordinate per basemap chiari (OpenTopo/CyclOSM) e scuri (Satellite/Scuro).

---

## 4. Verifica e Collaudo
- Test unitario dedicato in `tests/core/store.test.mjs` che valida il montaggio dinamico con `setStorageAdapter` e la persistenza tra riavvii.
- Esecuzione dell'intera suite di test (`npm test`): **417/417 test passati su 60 suite**, zero regressioni, shift-left quality gates superati.
