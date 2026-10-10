# Scheda Intervento: Risoluzione Scroll Jump nell'Espansione Accordion Previsioni

- **Data**: 2026-10-10
- **Modulo**: `ui/views/ForecastView.js`, `tests/ui/forecastView.test.mjs`
- **Tipo**: Bug Fix & Ergonomia UX
- **Stato**: Completato

---

### 1. Contesto & Problema Riscontrato
- Cliccando su una card parametrica dell'accordion nelle previsioni (es. "Vento in Decollo", "Raffiche & Delta Vento", "Base Cumulo"), la pagina eseguiva uno scatto involontario riportando la vista all'inizio (`scrollTop: 0`).
- Il pilota perdeva il punto di lettura e doveva scorrere nuovamente verso il basso per esaminare il grafico e i dettagli appena svelati.

---

### 2. Causa Radice
1. In `ForecastView.js`, l'azione `toggle-param-card` invocava `this.render()`.
2. `this.render()` distruggeva l'intero albero HTML di `this.containerEl` (`this.containerEl.innerHTML = this.renderHtml()`), rimpiazzando l'elemento `#forecast-scroll-container` con un nuovo nodo DOM con `scrollTop = 0`.
3. Contestualmente, `this.render()` distruggeva e ricreava il motore cartografico Leaflet della mini-mappa (`this.miniMapEngine.destroy()`), introducendo layout thrashing non necessario per una semplice interazione su accordion locale.

---

### 3. Soluzione Applicata
1. **Aggiornamento In-Place dei Parametri (`#forecast-params-container`)**:
   - In `handleClick` per `toggle-param-card`, se `#forecast-params-container` è presente nel DOM e la vista non è in modalità "Solo Grafici", il controller aggiorna direttamente `paramsContainer.innerHTML = this.renderParameterCards(...)`.
   - Questo preserva l'elemento antenato `#forecast-scroll-container`, mantenendo il suo `scrollTop` intatto a costo di rendering minimo (<2ms).
2. **Preservazione & Ripristino dello Scorrimento in `render()`**:
   - Nel metodo `render({ resetScroll = false } = {})`, il controller rileva il valore corrente `prevScrollTop` prima di rigenerare il markup.
   - Dopo aver eseguito `setupScrollListener()`, se `resetScroll` è `true`, reimposta esplicitamente `scrollTop = 0`; altrimenti, se `prevScrollTop > 0`, ripristina la posizione di scorrimento sul nuovo elemento.
3. **Reset Controllato su Cambio Spot**:
   - Nello sheet di selezione comprensorio (`pick-spot`, `pick-spot-apply`), `render({ resetScroll: true })` azzera lo scorrimento affinché il nuovo comprensorio venga visualizzato dalla cima.
4. **Test di Regressione e Governance**:
   - Aggiunti 2 test unitari dedicati in `tests/ui/forecastView.test.mjs` che verificano l'aggiornamento in-place, l'assenza di chiamate superflue a `render()`, la persistenza di `scrollTop: 350` e il ripristino/reset controllato in `render()`.
   - Esecuzione del test runner: 499 test su 73 suite al 100% verdi.
