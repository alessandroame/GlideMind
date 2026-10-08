# Worklog: Home Visual Audit, RCA & Layout Safeguards

**Data**: 2026-10-08  
**Ambito**: UI / UX / Layout Mobile / Responsive Engine / Test Automation

---

## 1. Audit dei Difetti Rilevati su Mobile (`media_0.png`)
1. **Larghezza Fissa 270px su Mobile**: Le card risultavano larghe 270px invece di 358px (100% del container), lasciando una colonna vuota di 88px a destra e costringendo il testo in un corridoio strettissimo.
2. **Troncamento con Ellissi (`...`)**: Su `.gm-spot-explain`, la proprietà `white-space: nowrap; text-overflow: ellipsis;` troncava arbitrariamente la spiegazione fisica del decollo/atterraggio.
3. **Mancanza del Nome del Decollo e Zuppa di Numeri**: La riga intermedia (`↗ 750m • 12 km/h (170°) ↘ Garden Relais E 1:5.1`) ometteva il nome del decollo e ammassava numeri senza gerarchia.
4. **Dislocamento Inatteso da `.sr-only` Non Dichiarato**: L'intestazione accessibile `h2.sr-only` occupava 34px di altezza reale nel flusso visuale, spingendo la barra attività sotto la barra di navigazione fissa (`#bottom-nav-bar` a y = 780px).

---

## 2. Root Cause Analysis (RCA)
- **RCA-1: Dichiarazioni CSS Duplicate & Mismatch di Specificità**:
  In `css/theme.css`, una vecchia regola carousel a riga 695 conteneva `.gm-spot-card { width: 270px; }` insieme a una copia di `.gm-spot-card`. In sezione 14 c'era una seconda definizione di `.gm-spot-card` che non dichiarava la larghezza `width: 100%`, ereditando così i 270px.
- **RCA-2: Test Unitari Solo su Stringhe HTML**:
  I test unitari verificavano la presenza delle stringhe HTML (`assert.ok(html.includes(...))`), che passavano con successo anche quando gli elementi erano compressi a 270px o sovrapposti.
- **RCA-3: Utility `.sr-only` Assente dal CSS**:
  La classe semantica per screen reader non era mappata a `position: absolute; clip: rect(0,0,0,0)`, generando uno spazio fantasma vuoto.

---

## 3. Risoluzione Implementata
- **CSS Consolidato (`css/theme.css`)**:
  - Rimossa la definizione duplicata a riga 701; limitata la larghezza 270px esclusivamente a `.gm-carousel .gm-spot-card, .gm-carousel-card`.
  - Definita `.gm-spot-card` con `width: 100%; padding: 8px 12px; gap: 5px; user-select: none;`.
  - Aggiunta la classe standard WCAG `.sr-only` (`position: absolute; width: 1px; height: 1px; clip: rect(0,0,0,0);`).
  - Ottimizzata la barra di attività `.gm-currency-strip` (`min-height: 42px; padding: 6px 12px;`).
- **Gerarchia a 2 Righe Aeronautiche (`ui/views/HomeDashboardView.js`)**:
  - Riga 1 Decollo: `↗ [Nome Decollo] (Alt) ... [Velocità] da [Direzione]`
  - Riga 2 Atterraggio: `↘ [Nome Atterraggio] (Alt) ... Efficienza 1:[Rapporto]`
  - Riga Spiegazione: spiegazione fisica pulita senza troncamento ad ellissi.
- **Geometria Mobile Verificata su Viewport iPhone 12/13/14 (390 x 844)**:
  - Basso Card 4 (Rocca Calascio): y = 689px.
  - Barra Attività: y = 701px - 749px.
  - Spazio libero di sicurezza: **31px** prima della bottom navigation bar (y = 780px).
  - Tutta la dashboard (Header + Search + 4 Comprensori + Barra Attività) è visibile al 100% al primo sguardo senza toccare lo schermo.

---

## 4. Salvaguardie Automatizzate per Prevenire Ricadute
- **`tests/ui/shellIntegrity.test.mjs`**:
  - Asserzione che `.gm-spot-card` sia definita esattamente UNA volta come blocco autonomo.
  - Asserzione che `.gm-spot-card` dichiari esplicitamente `width: 100%`.
  - Asserzione che `.sr-only` sia definita e abbia `position: absolute`.
- **`tests/ui/homeDashboardView.test.mjs`**:
  - Asserzione rigorosa del contratto **Unico Binomio**: esattamente 1 decollo (↗) e 1 atterraggio (↘) per card.
  - Asserzione dei nomi espliciti di decollo e atterraggio.
  - Asserzione dell'efficienza formattata `1:X.X`.
- **Suite Totale**: 199/199 test superati (26 suite su 26).
