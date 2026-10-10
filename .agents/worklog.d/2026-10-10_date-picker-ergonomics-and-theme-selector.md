# Scheda Intervento: Ergonomia Date Picker, Contrasto WCAG e Selettore Tema Top Bar

**Data**: 2026-10-10
**Modulo**: `ui/views/HomeDashboardView.js`, `ui/views/ForecastView.js`, `css/theme.css`, `core/store.js`, `ui/app.js`
**Tipo**: Feature & UX/A11y Remediation

---

## 1. Contesto e Motivazione
A seguito dell'audit euristico sui controlli di selezione data per le viste Home e Volabilità/Previsioni, sono emerse criticità ergonomiche e di conformità:
- Su viewport mobile stretti ($\le 390\text{px}$), i pulsanti preset data causavano overflow orizzontale o spingevano il pulsante calendario fuori dallo schermo a causa della mancanza di scroll orizzontale.
- Nella griglia a 14 giorni mancava l'indicatore di `:focus-visible` (WCAG 2.4.7) e in modalità chiara il contrasto del testo sui tab attivi scendeva a 3.2:1 (inferiore a WCAG AA 4.5:1).
- In `ForecastView`, la sottoscrizione allo store non sincronizzava `this.activeDate` quando mutata dall'esterno.
- Nel bottom sheet della data, la griglia a 14 giorni era posizionata sotto il form nativo, costringendo il pilota a scorrere verticalmente.
- Necessità di fornire un selettore rapido del tema visivo (*Chiaro / Scuro / Auto*) nella top bar a destra del numero di build in Home.

---

## 2. Decisioni Architetturali ed Ergonomiche

1. **Scroll-Snap Orizzontale a Riga Singola (`.gm-date-tabs`)**:
   - Applicato `overflow-x: auto`, `scroll-snap-type: x mandatory`, `-webkit-overflow-scrolling: touch`, `touch-action: pan-x`, e `scrollbar-width: none`.
   - Impostato `scroll-snap-align: start` e `flex-shrink: 0` su ogni tab e sul pulsante calendario, garantendo target $\ge 48\text{px}$ su qualsiasi larghezza schermo (360px - 390px) senza overflow della pagina (*Zero Horizontal Scrollbar*).

2. **Accessibilità e Contrasto WCAG**:
   - Aggiunto `outline: 2px solid var(--gm-accent); outline-offset: 2px;` su `.gm-date-grid-item:focus-visible`.
   - In `[data-theme="light"]`, assegnato colore testo ad alto contrasto (`#09090b` su `--gm-accent: #d97706`) per `.active` su tab, griglia e bottoni tema, elevando il contrasto a 8.5:1.
   - Allineato il ruolo ARIA del pulsante calendario a `role="tab"` con `aria-selected` all'interno di `role="tablist"`.

3. **Inversione Gerarchica nel Bottom Sheet (Occam's Razor)**:
   - Posizionata in cima alla modale la griglia a 14 giorni come azione primaria rapida (Hero 1-tap), spostando l'input nativo in fondo come opzione secondaria.

4. **Sincronizzazione Reattiva dello Stato**:
   - `ForecastView` sincronizza `this.activeDate` nella callback dello store e invoca `fetchWeatherDataAsync(spot, newDate)`.
   - `HomeDashboardView` evita doppie invocazioni sincrone di render e fetch di rete delegando l'aggiornamento al listener dello store.
   - `store.activeDate` inizializzato con `formatDateIso(new Date())` per scongiurare derive di fuso orario UTC tra le 00:00 e le 02:00 locali.

5. **Selettore Tema nella Top Bar in Menu ad Espansione (Chiaro / Scuro / Auto)**:
   - Inserito in `HomeDashboardView.renderHtml()` a destra del numero di build (`.gm-header-meta`) racchiuso in un menu compatto ad espansione (`.gm-theme-selector` con trigger `#gm-theme-menu-trigger` e menu a comparsa `#gm-theme-menu-dropdown`).
   - Riduzione dell'ingombro orizzontale di oltre il 50%: il trigger mostra unicamente l'icona e il tema attivo (es. `☀️ Chiaro ▾`, `🌙 Scuro ▾`, `⚙️ Auto ▾`) con target touch $\ge 44\text{px}$ espanso tramite pseudo-elemento.
   - Allineamento accessibilità e controllo da tastiera: `aria-haspopup="true"`, `aria-expanded`, gestione tasto `Escape` con ripristino del focus sul trigger, chiusura automatica al click esterno sul documento e alla selezione di un'opzione.
   - Supporto all'opzione `auto` in `ui/app.js` con listener reattivo `matchMedia('(prefers-color-scheme: light)')` e persistenza nello store (`ui.theme`).

---

## 3. Impatti e Verifica
- `npm test`: 338 test superati con 0 fallimenti (inclusa suite estesa per trigger, toggle menu, tasto Escape e chiusura al click esterno).
- Verifica runtime eseguita tramite browser headless via Chrome DevTools MCP: validata apertura menu, selezione tema chiaro con commutazione `data-theme="light"`, e chiusura corretta con tasto Escape.
- UI outdoor-ready e verificata contro i criteri Fitts, Jakob, Occam e WCAG AA.

