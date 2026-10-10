# Worklog: Risoluzione Artefatto Sticky Hover e Focus Durante lo Swipe dello Scrubber

- **Data**: 2026-10-10
- **Ambito**: `ui/views/ForecastView.js`, `css/theme.css`, `tests/ui/`
- **Autore**: Antigravity Pair Programming

## 1. Contesto & Diagnosi
Durante l'uso dello scrubber orario su dispositivi touch (smartphone/tablet), eseguendo uno swipe continuo (es. tocco a ore 12:00 e trascinamento a ore 17:00), l'ora iniziale (12) manteneva visivamente un riquadro bluastro evidenziato (`#2e3549`).

### Causa Radice
1. **Sticky Hover su Schermi Touch**: Su browser mobile (WebKit/Blink), il tocco attiva la pseudo-classe `:hover`. Poiché la regola `.gm-timeline-col-compact:hover { background-color: var(--gm-bg-hover); }` non era confinata a dispositivi dotati di cursore/mouse, l'elemento toccato inizialmente manteneva permanentemente lo stato `:hover` (colore `#2e3549`) anche dopo lo spostamento del dito su un'altra colonna.
2. **Stale Focus**: L'elemento toccato inizialmente con `tabindex="0"` riceveva il focus DOM, mantenendolo attivo contemporaneamente alla colonna selezionata.

## 2. Soluzione Ingegneristica
1. **Confinamento Hover via Media Query**:
   - Inserite le regole `:hover` di `.gm-timeline-col-compact` (sia dark che light mode) all'interno di `@media (hover: hover) and (pointer: fine)` in `css/theme.css`.
   - Su touchscreen (`hover: none`), la pseudo-classe `:hover` non viene mai applicata, eliminando alla radice l'effetto di persistenza del colore di hover.
2. **Soppressione Tap Highlight e Focus Outline**:
   - Aggiunto `-webkit-tap-highlight-color: transparent;` e `outline: none;` per `.gm-timeline-col-compact`.
   - Riservato `outline: 2px solid var(--gm-accent)` alla sola pseudo-classe `:focus-visible` per la navigazione da tastiera.
3. **Roving Tabindex & Blur Deterministico**:
   - Adottato il pattern Roving Tabindex: solo la colonna attiva riceve `tabindex="0"`, mentre le altre 12 colonne ricevono `tabindex="-1"`.
   - Aggiunta chiamata esplicita `document.activeElement.blur()` in `handlePointerDown` e `handlePointerUp` se il focus si trova all'interno della timeline strip.
4. **Guardia Anti-Trailing Click**:
   - Rilevato lo spostamento orizzontale durante il trascinamento (`this.hasDraggedPointer = true` se $\Delta x > 4\text{px}$) con soppressione del click sintetico in `handleClick`.

## 3. Risultato & Verifica
- Esecuzione `npm test`: 340 test superati con successo in 47 suite (0 errori, 0 regressioni).
- Test specifico aggiunto in `tests/ui/forecastView.test.mjs` per verificare che un click sintetico successivo al drag non provochi salti di selezione.
