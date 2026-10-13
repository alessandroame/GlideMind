# ADR: Profilo Altimetrico Naturale a Spline Hermite con Ancore Termiche e Focus Restoration da Replay 3D

**Data**: 2026-10-13  
**Stato**: Accettato e Implementato  
**Contesto**: `core/flightTrackReconstruction.js`, `core/logbookDb.js`, `ui/router.js`, `ui/views/FlightReplayView.js`, `ui/views/LogbookView.js`, `ui/views/FlightDetailSheet.js`, `css/theme.css`

---

## 1. Contesto e Diagnosi Critica
In seguito al collaudo del Volo #50 (Ciavanis -> PeterPan), sono emerse due criticità evidenziate dall'utente:
1. **Profilo Altimetrico "Finto"**:
   - La prima versione della ricostruzione traccia disegnava una rampa continua che saliva fino al 60% della durata complessiva del volo (minuto 21), senza agganciarsi alla reale sequenza dei metadati: la Termica 1 ha portato il pilota a 2001m in 3 minuti, culminando a 2037m alle 13:00:33 (minuto 3.5), per poi proseguire con 18 minuti di veleggiamento in dinamica e altre due termiche tra 1830m e 1884m prima della planata finale verso PeterPan.
   - Il variometro presentava gradini di discretizzazione dovuti al calcolo numerico su quote arrotondate a interi.
2. **Perdita di Posizione ed Ergonomia di Navigazione**:
   - Alla chiusura del Replay 3D o della scheda di dettaglio, il ritorno al Flight Log atterrava a scroll 0 in cima alla lista. Il pilota doveva cercare e scorrere manualmente fino alla card del volo #50 per continuare l'analisi.

---

## 2. Decisioni Architetturali e Modifiche Implementate

### 2.1 Ricostruzione a Spline Hermite Cubica Ancorata alle Termiche (`core/flightTrackReconstruction.js`)
- **Ancoraggio Geodetico Reale**: Inserite ancore temporali reali:
  - Decollo: $t = 46616\text{s}$, $h = 1777\text{m}$.
  - Termica 1: $t \in [46627, 46814]\text{s}$, $h \in [1779, 2001]\text{m}$, con spirali orarie ($CW$) a raggio $56.8\text{m}$.
  - Vertice Massima Quota: $t = 46833\text{s}$, $h = 2037\text{m}$, con tangente orizzontale imposta ($\dot{h} = 0$).
  - Termiche 2 e 3 e Punto di Massimo Variometro ($1884\text{m}$ alle 13:14:09).
  - Planata finale verso l'atterraggio PeterPan ($h = 912\text{m}$).
- **Spline Hermite a Derivata Continua**: Le pendenze intermedie $m_k$ vengono calcolate con media armonica tra intervalli adiacenti, annullando la derivata nei punti di massimo/minimo locale per prevenire overshoot o oscillazioni spurie.
- **Micro-Rilievo Atmosferico Deterministico**: Iniettate onde stazionarie multi-frequenza smorzate ai confini per donare naturalezza fisica senza alterare quote min/max.
- **Smussamento Simmetrico Variometro**: Filtro a media mobile a 3 punti centrata che neutralizza i gradini di campionamento.

### 2.2 Migrazione Trasparente Database (`core/logbookDb.js`)
- Introdotto `reconstructionVersion = 2`.
- In `LogbookManager.prototype.getFlightDetail`: se un volo caricato in precedenza ha `raw.isReconstructed === true` ma con versione inferiore a 2, viene automaticamente rigenerato e salvato in IndexedDB, garantendo l'aggiornamento istantaneo nei browser senza dover re-importare il file di backup.

### 2.3 Router Hash Parameters & View Dispatching (`ui/router.js`)
- Creata la funzione esportata `parseHashParams(hash)` che estrae parametri query dalla stringa hash (`#route?key=value`).
- In `init()` e nell'evento `hashchange`, il router estrae i parametri e li passa a `navigate(route, params)`.
- Se `validRoute === currentRoute`, il router inoltra i parametri a `currentMountedView.handleRouteParams(params)` senza ricaricare la vista.

### 2.4 Focus Restoration nel Logbook (`ui/views/LogbookView.js` & `css/theme.css`)
- In `LogbookViewController`:
  - Aggiunto `focusFlight(flightId)`: se il volo è nascosto da filtri o ricerca, li ripristina a 'all', effettua lo smooth scroll centrato (`scrollIntoView({ behavior: 'smooth', block: 'center' })`), imposta il focus per accessibilità da tastiera e applica la classe `.gm-flight-card-focused`.
  - In `css/theme.css`: definita l'animazione `@keyframes gm-card-focus-pulse` per 2.5 secondi con evidenziazione del bordo azzurro aeronautico `#38bdf8` e soft glow, supportando sia il tema dark che sunlight.
- In `FlightReplayView.js`: `handleExitReplay` naviga a `#logbook?focusFlightId=${encodeURIComponent(flightId)}`.
- In `FlightDetailSheet.js`: `closeFlightDetailView` centratura e pulsazione della card alla chiusura.

---

## 3. Verifica e Standard
- **Test Unitari Ricostruzione**: 4/4 test passati in `tests/core/flightTrackReconstruction.test.mjs`.
- **Test Unitari Router**: 9/9 test passati in `tests/ui/router.test.mjs`.
- **Test Unitari Logbook**: 10/10 test passati in `tests/ui/logbookView.test.mjs`.
- **Test Unitari Replay 3D**: 11/11 test passati in `tests/ui/flightReplayView.test.mjs`.
- **Test Unitari Dettaglio Volo**: 46/46 test passati.
- **Suite Globale**: 769/769 test passati su 131 suite (`npm test`), 0 falliti.
- **Pre-Delivery Shift-Left Gates**: Tutti i 5 Gate superati al 100%.
