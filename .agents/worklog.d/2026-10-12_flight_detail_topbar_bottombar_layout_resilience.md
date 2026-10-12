# Worklog: Risoluzione Difetti di Layout Mobile nel Dettaglio Volo (Topbar Title Crumbling & Bottom Bar Action Overflow)

**Data**: 2026-10-12  
**Autore**: Antigravity  
**Ambito**: `ui/views/FlightDetailSheet.js`, `css/theme.css`, `tests/flightDetailView.test.js`, `tests/ui/flightDetailSheet.test.mjs`

---

## 1. Contesto & Diagnosi

A seguito di screenshot utente che evidenziavano gravi anomalie visive su viewport mobile e compatti:
1. **Topbar squishing & title fragmentation**:
   - Il pulsante di ritorno "Flight Log" andava a capo verticalmente spezzandosi in "Flight" / "Log", e l'icona SVG freccia veniva schiacciata a 0px di larghezza.
   - Il titolo del volo ("Decollo Cornizzolo") veniva compresso in una fessura di ~30px a causa di un contenitore destro rigido (`flex-shrink: 0`) che ospitava il pulsante "Setup Traccia" esteso (~130px), il badge classe "EN-B" e il modello vela "Axis Pluto 4" (~110px). A causa di `-webkit-line-clamp: 2` senza `white-space: nowrap`, il titolo si spezzava a livello di singole sillabe ("Dec" / "C..." / "2026").
2. **Bottom Bar Button Wrapping & Clipping**:
   - Il pulsante primario "Visualizza Replay 3D" andava a capo su due righe ("Visualizza" / "Replay 3D").
   - Il pulsante di download FAI IGC ("Scarica Traccia IGC (FAI)") veniva spinto oltre il margine destro dello schermo risultando tagliato.
3. **Causa Radice Primaria**:
   - Assenza nel foglio di stile vanilla `css/theme.css` delle utility class responsive di visibilità (`hidden`, `sm:inline`, `md:inline`, `lg:inline`, `xl:inline`, `sm:hidden`, `md:hidden`), che causava la renderizzazione incondizionata di tutti i testi su qualsiasi viewport.

---

## 2. Interventi Eseguiti

1. **Implementazione Utility Class Responsive in `css/theme.css`**:
   - Aggiunti `.hidden`, `.inline`, `.block`, `.inline-flex`, `.whitespace-nowrap`.
   - Aggiunte media query per `sm:` (640px), `md:` (768px), `lg:` (1024px), `xl:` (1280px) con relative classi di visibilità.
2. **Topbar Resilience (`FlightDetailSheet.js` & `css/theme.css`)**:
   - `.gm-flight-detail-back-btn`: `white-space: nowrap; flex-shrink: 0;` con SVG `flex-shrink: 0; display: block;`.
   - `.gm-flight-detail-title-heading`: `white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;` all'interno di un contenitore flessibile `flex-1 min-w-0`.
   - `.gm-topbar-setup-btn`: pulsante compatto da 38x38px (icona ingranaggio su mobile/tablet; etichetta testuale espansa solo con `.hidden.lg:inline`).
   - Glider model name: nascosto sotto i 1280px (`.hidden.xl:inline`) per garantire spazio prioritario al titolo geografico del decollo.
3. **Bottom Bar Action Chunking (`FlightDetailSheet.js` & `css/theme.css`)**:
   - Tutti i pulsanti provvisti di `white-space: nowrap;` e touch floor $\ge 48\text{px}$.
   - Etichette testuali responsive ad ingombro decrescente:
     - Replay: `<span class="hidden sm:inline">Visualizza Replay 3D</span><span class="sm:hidden">Replay 3D</span>`
     - Setup: `<span class="hidden md:inline">Setup Traccia</span><span class="md:hidden">Setup</span>`
     - Download: `<span class="hidden md:inline">Scarica Traccia IGC (FAI)</span><span class="md:hidden">Scarica IGC</span>`
4. **Allineamento Test Suite**:
   - Rettificato `tests/flightDetailView.test.js` allineando `aria-label="Torna al Flight Log"`.
   - 674/674 test eseguiti con successo (`node --test`).
