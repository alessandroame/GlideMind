# Refactoring Controlli Cartografici: Micro-Capsule Frosted Glass Adattive con Touch Expansion Fitts

**Data**: 2026-10-10  
**Ambito**: UI / Cartografia / ForecastView / Design System (`css/theme.css`, `ForecastView.js`)  
**Stato**: Completato  

---

## 1. Contesto & Rilevazione Criticità (User Feedback & Real Testing)
- **Feedback Utente**: *"è un pò bruttino trova di meglio"*, corredato da cattura schermo del controllo "OpenTopo" sovrapposto a mappa orografica chiara.
- **Analisi del Guasto Visivo**:
  - L'approccio precedente basato su sfumature radiali scure (`radial-gradient`) prive di confini perimetrali definiti generava, su cartografie orografiche chiare e ad alta frequenza visiva (curve di livello e rilievi di OpenTopoMap), un effetto alone/fumo percepito come una macchia scura o bruciatura sull'ottica.
  - L'assenza di chiusura geometrica (Gestalt Law of Closure) impediva all'occhio di identificare immediatamente un controllo interattivo pulito.

---

## 2. Decisioni Tecnico-Architetturali & Soluzione Implementata
1. **Micro-Capsule Frosted Glass a Basso Profilo (28px)**:
   - Sostituita l'altezza bulky (40-44px) con una linea snella da **28px**, lasciando l'orografia e i rilievi montani sgombri e leggibili.
   - Trattamento superficiale con sfocatura `backdrop-filter: blur(8px)`, bordo capillare semi-trasparente da 1px e micro-ombra morbida.
   - Pulsante di espansione mappa convertito in cerchio perfetto da $28 \times 28\text{px}$ con icona SVG a frecce diagonali da $14\text{px}$ a tratto deciso (`stroke-width: 2.4`).
2. **Pavimento Tattile Ergonomico Fitts Invisibile (`::before` a 44px)**:
   - Conformità rigorosa agli standard outdoor/guanti (`laws-of-ux` / Fitts's Law): l'area visiva resta compatta a 28px, ma l'area interattiva di tocco viene espansa a $44 \times 44\text{px}$ mediante pseudo-elemento trasparente:
     ```css
     .gm-mini-map-layer-select::before,
     .gm-mini-map-expand-btn::before {
       content: '';
       position: absolute;
       top: -8px;
       bottom: -8px;
       left: -8px;
       right: -8px;
     }
     ```
3. **Adattamento Dinamico alla Luminanza del Basemap (`data-map-layer`)**:
   - Invece di vincolare il contrasto al tema generale dell'app, il contrasto dei controlli si adatta alla **luminanza intrinseca delle tessere cartografiche**:
     - *Basemap Chiari (`data-map-layer="topo"` e `"streets"`)*: Vetro smerigliato bianco opaco (`rgba(255, 255, 255, 0.88)`), bordo scuro sottile (`rgba(15, 23, 42, 0.14)`), testo e freccia deep slate (`#0f172a`).
     - *Basemap Fotografici/Scuri (`data-map-layer="satellite"` e `"dark"`)*: Vetro avionico scuro (`rgba(15, 23, 42, 0.78)`), bordo chiaro (`rgba(255, 255, 255, 0.18)`), testo e freccia bianco nitido (`#f8fafc`).

---

## 3. File Coinvolti
- `css/theme.css`: Nuove classi e modificatori per micro-capsule frosted glass, touch target floor ed eliminazione completa dei residui `radial-gradient`.
- `ui/views/ForecastView.js`: Aggiornata la geometria SVG dell'icona a frecce dell'expand button (`width="14" height="14"`) e query resiliente su `(this.containerEl || this.container)`.
- `tests/ui/forecastView.test.mjs`: Aggiornate le asserzioni di test per validare la presenza di micro-capsule frosted glass (`backdrop-filter`), pseudo-elementi `::before` e conformità del layer attivo.
- `MEMORY.md`: Aggiornata la Sezione 71 con la radice tecnica del problema e le linee guida per micro-capsule frosted glass adattive.

---

## 4. Verifica di Regressione
- Esecuzione test suite automatizzata (`npm test`): **409 test passati su 409**, 0 fallimenti, 0 warning.
- Tutti i 5 Shift-Left Quality Gates superati con successo.
