# Worklog: Risoluzione UX Laws, Accessibilità e Touch Ergonomics nella Home Dashboard

**Data**: 2026-10-10  
**Autore**: GlideMind UI & Architecture  
**Ambito**: `ui/views/HomeDashboardView.js`, `css/theme.css`, `tests/ui/homeDashboardView.test.mjs`

---

## 1. Contesto & Audit UX Laws
Sulla vista Home Dashboard (`HomeDashboardView.js`) è stato condotto un audit secondo le Laws of UX e le euristiche NN/G (con esclusione esplicita della sezione attività di volo pilota/currency, preservata come da direttiva utente).
Criticità riscontrate:
1. **Postel's Law (Robustezza)**: La ricerca testuale dei comprensori falliva in presenza di accenti o diacritici (es. "cavallaria" vs "Monte Cavallària" o variazioni di spaziature).
2. **Fitts's Law & Touch Target Floor ($\ge 44\text{px}$)**: Il campo `#home-spot-search` e i bottoni di azione compatti avevano altezze inferiori a 44px, aumentando il rischio di miss-click con guanti outdoor. Mancava un pulsante dedicato e accessibile per azzerare la ricerca con un singolo tocco.
3. **Jakob's Law & Mental Model di Navigazione**: Le card dei comprensori (`.gm-spot-card`) erano renderizzate come elementi semantici `<article>` ma senza semantica interattiva (`role="button"`, `tabindex="0"`), senza affordance visiva di navigazione (chevron) e senza ascolto tastiera (`Enter`/`Space`).
4. **NN/G Euristica #9 & Cheap Takeover**: In caso di ricerca a vuoto ("Nessuna località trovata"), non era disponibile un'azione istantanea per ripristinare il catalogo completo, costringendo il pilota a cancellare manualmente carattere per carattere.
5. **WCAG POUR & Outdoor High-Contrast**: Assenza di notifiche assertive o cortesi (`aria-live="polite"`) sull'aggiornamento del contatore dei comprensori; assenza di `aria-controls`; contrasto cromatico insufficiente in modalità luce solare (`data-theme="light"`) per pill di provincia e righe statistiche di volo.

---

## 2. Risoluzione Architetturale & Interventi

1. **Postel's Law (Normalizzazione Input Ricerca)**:
   - Creata la funzione `normalizeSearchText(text)` che decompone i diacritici Unicode (`NFD`) e rimuove i segni combinati (`[\u0300-\u036f]`), applicata sia alla query sia a nome, provincia e decollo/atterraggio del comprensorio.
2. **Fitts's Law & Touch Targets Outdoor**:
   - `css/theme.css`: `.gm-search-input` impostato con `min-height: 44px;` e padding ergonomico.
   - Aggiunto il pulsante `#home-search-clear-btn` (`.gm-search-clear`) con target touch $44\times 44\text{px}$, posizionato a destra all'interno del wrapper di ricerca, visibile solo con input popolato.
   - Soppressione tramite CSS dei controlli nativi WebKit (`::-webkit-search-cancel-button`, `::-webkit-search-decoration`) per evitare la duplicazione dell'icona "X" nei browser Chromium/WebKit.
   - Delegazione dell'evento `'input'` sul persistent `containerEl` (`this.containerEl.addEventListener('input', this.boundInputHandler)`): garantisce che la ricerca istantanea rimanga sempre attiva anche a valle di re-render asincroni del DOM indotti dal caricamento del catalogo o del meteo.
   - Esteso il filtro di ricerca a decolli e atterraggi secondari del comprensorio oltre al nome, provincia e regione.
   - Portati `.gm-btn-compact-primary` e `.gm-btn-compact-accent` a `min-height: 44px;`.
3. **Jakob's Law, Keyboard Operable & Affordance**:
   - Inseriti `role="button"` e `tabindex="0"` su ogni `.gm-spot-card`, corredata di chevron SVG `.gm-spot-chevron` per chiarire la natura interattiva e di navigazione verso `ForecastView`.
   - Implementato `handleKeyDown` nel controller per gestire `Enter` e `Space` sulle card focalizzate, nonché `Escape` sull'input di ricerca per azzeramento immediato.
   - Aggiunto stile `:focus-visible` con outline ad alto contrasto (`outline: 2px solid var(--gm-accent); outline-offset: 2px;`) su card, tab rapidi delle date e pulsante calendario.
4. **Cheap Takeover & Recupero Errori (NN/G #9)**:
   - Nel markup di lista vuota (`renderSpotList`), inserito un pulsante esplicito a 1-tap `data-action="clear-search"` ("Azzera ricerca") che ripristina la visualizzazione dell'intero catalogo e restituisce il focus al campo di testo.
   - Microcopy corretta e sobria: rimosso ogni riferimento superfluo a stelle o icone grafiche non presenti.
5. **WCAG POUR & Contrasto Outdoor Sunlight**:
   - `#home-spots-count` dotato di `aria-live="polite"` per annunci dinamici del totale filtrato.
   - `#home-spot-search` dotato di `aria-controls="home-spots-list"`.
   - In `css/theme.css`: introdotti selettori `[data-theme="light"] .gm-spot-flight-row` e `[data-theme="light"] .gm-spot-prov` con token di elevazione e bordatura ad alto contrasto per leggibilità sotto luce solare diretta.

---

## 3. Verifica & Test
- Esecuzione `npm test`: 331 test passati su 46 suite, 0 fallimenti.
- Test visivo e funzionale convalidato su browser live (Chrome headless / DevTools MCP) con screenshot di verifica:
  - Presenza di un singolo pulsante "X" accessibile da $44\times 44\text{px}$.
  - Risposta in tempo reale alla digitazione con filtraggio istantaneo della lista (es. "monte" -> 60 comprensori, "ciavanis" -> decollo Chialamberto).
  - Ripristino corretto della lista completa su click dell'icona "X" o del pulsante "Azzera ricerca".
- 6 nuovi test in `tests/ui/homeDashboardView.test.mjs` che validano:
  - Attributi di accessibilità e attivazione da tastiera (`Enter`/`Space`) sulle card.
  - Comportamento ed ergonomia del pulsante "Azzera ricerca" e del tasto `Escape`.
  - Tolleranza ortografica e diacritica della ricerca (Postel's Law) estesa a decolli e atterraggi.
  - Delegazione dell'evento input su `containerEl` a prova di re-render.
  - Soppressione `::-webkit-search-cancel-button` e target touch $\ge 44\text{px}$ in `css/theme.css`.

