# Fix CSS SVG Chevron Tiling Defect on Map Select & UI Quality Audit Capability

**Data**: 2026-10-10  
**Autore**: Alessandro Amé / Antigravity Agent  
**Ambito**: CSS Design System, Ergonomia UI, Qualità Grafica, Governance Shift-Left

---

## 1. Contesto & Difetto Riscontrato
Dallo screenshot fornito dall'utente sul selettore layer della mini-mappa ("CyclOSM"), il pulsante a capsula presentava una texture ripetitiva a matrice di decine di freccette verso il basso (`v v v v v v`) che coprivano la scritta, rendendo il controllo visivamente corrotto e non professionale.

L'utente ha contestualmente richiesto:
1. La risoluzione dell'anomalia estetica.
2. Informazioni su agenti o skill specializzate disponibili nel sistema per valutare oggettivamente la qualità della UI.

---

## 2. Diagnosi & Root Cause Analysis
- **La Trappola della Shorthand CSS `background:`**:
  Nei modificatori del layer cartografico (`.gm-mini-map-box[data-map-layer="topo"] .gm-mini-map-layer-select`, `.gm-mini-map-box[data-map-layer="streets"] ...`, e `[data-theme="light"]`), la proprietà `background: linear-gradient(...)` veniva dichiarata come shorthand.
  In CSS, la shorthand `background:` azzera e reimposta implicitamente tutte le proprietà di background:
  - `background-repeat: repeat`
  - `background-position: 0 0`
  - `background-size: auto`
  Quando successivamente veniva applicata la regola `background-image: url("...svg")`, il chevron SVG da 9px ereditava `repeat`, provocando il tiling orizzontale e verticale lungo l'intero bottone da 28px.

---

## 3. Intervento Risolutivo
1. **Accorpamento Multi-Layer Deterministico (`background-image`)**:
   Rimossa la shorthand `background:` nei modificatori e raggruppati sia l'icona SVG (Layer 1) sia il gradiente vetro smerigliato (Layer 2) nella medesima direttiva `background-image`:
   ```css
   background-image: 
     url("data:image/svg+xml,..."),
     linear-gradient(135deg, rgba(255, 255, 255, 0.76) 0%, rgba(240, 244, 248, 0.44) 100%);
   background-repeat: no-repeat, no-repeat !important;
   background-position: right 6px center, 0 0 !important;
   background-size: 9px 9px, 100% 100% !important;
   ```
2. **Blindatura Anti-Tiling**:
   Aggiunta la guardia `background-repeat: no-repeat, no-repeat !important;` per prevenire qualsiasi futura regressione causata da proprietà cascate.
3. **Governance Shift-Left**:
   Aggiunto test automatico in `tests/ui/shiftLeftGovernance.test.mjs` (Gate 4) che convalida staticamente l'assenza di tiling e la presenza della guardia `no-repeat`.
4. **Verifica Globale**:
   Tutti i 428 test in 61 suite completati con esito positivo (`pass 428, fail 0`).

---

## 4. Agenti e Strumenti di Valutazione Qualità UI Disponibili
In risposta alla domanda dell'utente, l'ambiente include 4 moduli specializzati di audit UI:
- `laws-of-ux-audit`: Audit completo di usabilità ed ergonomia visiva basato sulle 30 Laws of UX, 10 euristiche Nielsen Norman Group e benchmark Baymard. Produce report prioritizzato P0-P3.
- `novice-pilot-auditor`: Revisione ergonomica dal punto di vista di un pilota principiante di parapendio (leggibilità ad alto riverbero solare, contrasto, riduzione del carico cognitivo in volo).
- `outdoor-hmi-touch`: Verifica della conformità HMI per touch screen outdoor (pavimento Fitts $\ge 44/48\text{px}$, gesti cooperativi `pan-y`, scroll-snap).
- `a11y-debugging`: Audit su accessibilità, ARIA, conformità contrasto WCAG 2.1 AA/AAA e navigazione da tastiera.
