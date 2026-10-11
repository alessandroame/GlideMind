# Bonifica Completa & Applicazione Rigorosa delle Laws of UX e Standard Ergonomici Outdoor

**Data**: 2026-10-11  
**Autore**: GlideMind Agent  
**Ambito**: Laws of UX, Outdoor HMI, Touch Target Floor (Fitts's Law >= 48px), Gestalt De-boxing, Feedback Tri-Modale, Engineering Sobriety  

---

## 1. Contesto & Segnalazione Utente

L'utente ha riscontrato che i principi delle Laws of UX e gli standard ergonomici outdoor non risultavano pienamente rispettati nell'applicazione:
> *"mi sembra che non siano applicate le leggi ux con cui ti ho istruito"*

Un audit euristico approfondito ha confermato diverse discrepanze tra il codice implementato e le regole prescritte dal plugin `laws-of-ux` e dal repository `GlideMind`:
1. **Target di tocco inferiori alla soglia minima (Fitts's Law 2026)**:
   - Numerosi controlli interattivi compatti (`.gm-mini-map-layer-select`, `.gm-mini-map-expand-btn`, `.gm-btn-compact-primary`, `.gm-btn-compact-accent`, `.gm-subspot-item`, `.gm-search-input`, `.gm-search-clear`, `.gm-replay-speed-btn`, `.gm-filter-chip`, `.gm-view-toggle-btn`) avevano altezze comprese tra 28px e 44px, al di sotto del pavimento tattile vincolante di $\ge 48\times 48\text{px}$ per uso outdoor con guanti.
2. **Spaziatura insufficiente tra bersagli adiacenti (Touch Target Spacing)**:
   - Gruppi di pulsanti e toggle a segmenti (`.gm-view-toggle`, `.gm-replay-speed-group`, `.gm-map-scrubber-stepper-row`, `.gm-map-popup-actions`, `.gm-flight-badge-group`) presentavano gap di 2px o 4px, aumentando il rischio di tocchi accidentali sotto sollecitazioni esterne o vibrazioni.
3. **Mancanza di Feedback Tri-Modale di Sicurezza**:
   - I badge di volabilità sulle card comprensorio della Home visualizzavano solo un'icona in un riquadro compatto senza etichetta testuale esplicita (`Volabile`, `Cautela`, `Non Volabile`, `Severo`), violando la regola secondo cui lo stato di sicurezza non deve mai dipendere unicamente da colore o glifo isolato.
4. **Emoji decorative e violazioni di sobrietà ingegneristica**:
   - Presenza di emoji non funzionali (`☀️`, `🌙`, `⚙️`, `🔍`, `⭐`, `🕒`, `🗺️`) nei selettori tema, intestazioni accordion e titoli di sezione.
   - Presenza del termine vietato `Cockpit` nei controlli camera della vista Replay 3D (`FlightReplayView.js`).

---

## 2. Azioni di Bonifica Implementate

### A. Pavimento Tattile a 48px & Spaziatura $\ge 8\text{px}$ (`css/theme.css`)
- **Controlli compatti e micro-capsule**:
  - Ingranditi gli pseudo-elementi `::before` a `min-width: var(--gm-touch-min, 48px); min-height: var(--gm-touch-min, 48px);` centrati per `.gm-mini-map-layer-select` e `.gm-mini-map-expand-btn`, preservando la compattezza visiva e garantendo un target touch $\ge 48\times 48\text{px}$.
  - Portati a `min-height: var(--gm-touch-min, 48px)`: `.gm-btn-compact-primary`, `.gm-btn-compact-accent`, `.gm-subspot-item`, `.gm-search-input`, `.gm-search-clear`, `.gm-forecast-sticky-bar`, `.gm-filter-chip`, `.gm-period-btn`, `.gm-preset-btn`, `.gm-view-toggle-btn`, `.gm-map-select`, `.gm-map-stepper-btn`, `.gm-map-popup-btn`, `.gm-replay-speed-btn`.
- **Prevenzione collisioni al tocco**:
  - Spaziatura `gap: 8px` applicata a `.gm-view-toggle`, `.gm-map-scrubber-stepper-row`, `.gm-map-popup-actions`, `.gm-flight-badge-group`, `.gm-preset-btn`, `.gm-type-btn`.

### B. Feedback Tri-Modale di Sicurezza (`ui/views/HomeDashboardView.js` & `css/theme.css`)
- Aggiornato l'indicatore di volabilità sulle card comprensorio della Home per combinare sempre:
  1. **Colore semantico ad alto contrasto** (Verde / Giallo / Rosso / Nero).
  2. **Icona vettoriale funzionale** (`✓` per Volabile, `▲` per Cautela, `✕` per Non Volabile, `⚡` per Severo).
  3. **Etichetta testuale esplicita** (`Volabile`, `Cautela`, `Non Volabile`, `Severo`) tramite `.gm-badge-pill`.

### C. Sobrietà Ingegneristica & Zero Icon Clutter
- Rimossi tutti i glifi emoji decorativi:
  - Sostituiti `☀️`, `🌙`, `⚙️` con SVG vettoriali inline e attributi `aria-label` nel selettore del tema.
  - Rimossi `🔍`, `⭐`, `🕒`, `🗺️` dai titoli delle sezioni nel picker comprensori in `ForecastView.js`.
- Rinominata la modalità di visualizzazione telecamera da `Cockpit` a `Pilota` in `FlightReplayView.js`, in aderenza alla tabella di bonifica terminologica.

### E. De-boxing Schede Parametriche & Armonizzazione Grafici (`ForecastView.js` & `css/theme.css`)
- **De-boxing Gerarchico (Gestalt Law of Common Region & Occam's Razor)**:
  - Eliminato il pattern a "scatole cinesi" (riquadri bordati innestati dentro una card già bordata).
  - Convertita la griglia dei dettagli analitici (`.gm-param-details-grid`) in un layout trasparente a 2 colonne senza bordi né sfondo grigio artificiale (`padding: 4px 0 8px; gap: 8px 16px`).
  - Trasformato il box di avviso pilota (`.gm-param-advice-box`) in un callout pulito ed essenziale con solo bordo sinistro semantico di 2px (`border-left: 2px solid var(--gm-accent)`), eliminando bordi perimetrali e sfondo giallo ocra.
  - Rimosso lo sfondo grigio e il bordo dal contenitore SVG del grafico di tendenza oraria (`.gm-chart-box`), introducendo un separatore orizzontale discreto (`border-top: 1px solid var(--gm-border)`).
- **Risoluzione Incongruenza Dati & Spaziatura Asse X**:
  - Rimosso il testo hardcoded `Tendenza Oraria (08:00 - 20:00)` e sostituito con l'intestazione dinamica ed essenziale `Tendenza Oraria`.
  - Sostituita la formula a passo fisso con inserimento finale asimmetrico dell'estremo (`lh += labelStep; push(eH)`) con un'interpolazione matematica uniforme distribuita (`sH + (i * hRange) / (numLabels - 1)`), eliminando l'addensamento visivo delle etichette a destra (es. 16 e 18 affiancate).


---

## 3. Esito della Verifica

- Esecuzione completa di `npm test`: **652 test superati su 652** distribuiti su 113 suite di test native (`node:test`), con 0 fallimenti e 0 regressioni.
