# Worklog: Idratazione Asincrona del Catalogo Comprensori Reale a Runtime

- **Data**: 2026-10-09
- **Autore**: Alessandro Amè & Pair Programmer
- **Contesto**: Connessione dinamica dei controller UI (`HomeDashboardView`, `ForecastView`) al catalogo completo dei comprensori censiti (`data/locations.json`, 135 siti), superando il fallback statico iniziale di 4 spot senza bloccare il caricamento iniziale (<400ms).
- **Tipo**: Architettura UI / State Management / Reattività / Test Automation

---

## 1. Problema Riscontrato & Obiettivi

1. **Discrepanza tra Catalogo Reale e UI**:
   - `data/locations.json` conteneva 135 comprensori censiti e validati, ma le viste `HomeDashboardView` e `ForecastView` inizializzavano solo i 4 comprensori di fallback `DEFAULT_COMPRENSORI`.
   - I siti cercati dai piloti (es. siti piemontesi, veneti, appenninici) non apparivano nei selettori e nella ricerca della dashboard.
2. **Vincolo di Zero-Blocking Outdoor**:
   - Vietato bloccare il bootstrap dell'app con fetch sincrono o mostrare schermate vuote/spinner durante il caricamento (connessioni montane lente o offline).

---

## 2. Decisioni Architetturali & Implementazione

1. **State Store SSOT (`core/store.js`)**:
   - Aggiunto `locationsCatalog: null` allo stato applicativo iniziale.
2. **Idratazione Asincrona Stale-While-Revalidate (`ui/app.js`)**:
   - Creata la funzione `loadLocationsCatalog()`: esegue `fetch('/data/locations.json')`, normalizza i comprensori con `normalizeLocationsCatalog` e aggiorna lo store reattivo (`store.setState({ locationsCatalog })`).
   - Invocata in background durante `bootstrapApp()`, garantendo il rendering immediato a 0ms con `DEFAULT_COMPRENSORI` e l'aggiornamento trasparente appena il JSON è caricato.
3. **Reattività nei Controller di Vista (`HomeDashboardView.js` & `ForecastView.js`)**:
   - Implementato il metodo `setComprensoriCatalog(catalog)` per aggiornare il catalogo attivo.
   - Sottoscrizione reattiva alle mutazioni di `state.locationsCatalog`.
   - In `HomeDashboardView`: salvaguardia del focus sull'input di ricerca (`isSearchFocused`), aggiornando solo il sotto-albero DOM dei comprensori senza azzerare l'input o la digitazione dell'utente (Cheap Takeover / Ergonomia).
4. **Matching Flessibile Spot in `ForecastView`**:
   - `getCurrentSpot()` confronta sia l'ID univoco sia il nome normalizzato per garantire coerenza anche in caso di formati ID storici salvati nello store locale.

---

## 3. Validazione Automatizzata

- Creata la suite [tests/ui/locationsCatalogHydration.test.mjs](file:///tests/ui/locationsCatalogHydration.test.mjs) con 4 test dedicati:
  1. Fallback sicuro a `DEFAULT_COMPRENSORI` in ambiente headless Node.js senza `window`/`fetch`.
  2. Idratazione completa con mock browser, verifica popolamento store e ricezione reattiva nei controller (135 siti).
  3. Preservazione del focus sull'input di ricerca durante l'aggiornamento catalogo.
  4. Risoluzione spot per nome/ID.
- Suite complessiva: **274/274 test passati**.
