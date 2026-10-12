# ADR / Worklog: Armonizzazione Grafico Precipitazioni su Curva Spline Parameteo (0-100%) ed Eliminazione Micro-Nastro Heatmap

**Data**: 2026-10-12  
**Autore**: Antigravity  
**Ambito**: UI / Ergonomia Outdoor / ForecastView / Visualizzazione Parametri Meteo / Parameteo Standard

---

## 1. Contesto e Problema Riscontrato
In seguito alla verifica visiva della card "Precipitazioni" (`multi-chart-precipitation`) in modalità "Solo Grafici":
1. **Paradosso del Canvas Deserto (Zero-Accumulation Chart Waste)**: Per l'80-90% delle giornate volabili o borderline, l'accumulo al suolo (`precip`) è 0.0 mm/h per tutte le ore. L'area del grafico cartesiano (3.0, 2.0, 1.0, 0.0 mm/h) risultava un deserto vuoto privo di barre, con due linee di soglia schiacciate a terra (0.1 e 0.5 mm/h), dando l'impressione di un grafico guasto o privo di dati.
2. **Micro-Testo a 6.8px nel Nastro Heatmap**: L'evoluzione della probabilità di pioggia (0% al mattino, 11% a mezzogiorno, 25% al pomeriggio) era compressa in una striscia di appena 13px sotto la baseline con font a 6.8px, completamente illeggibile su smartphone all'aperto con riflessi solari.
3. **Collisione Visiva Distruttiva dello Scrubber a Y=0**: A 0.0 mm/h, il marcatore arancione dell'ora attiva cadeva a terra sovrapponendosi esattamente alla soglia gialla di 0.1 mm/h, alla linea di terra e al testo percentuale.
4. **Incoerenza con il Parameteo Standard**: Rompeva la continuità visiva rispetto agli altri 6 grafici Parameteo (Vento, Base Cumulo, CAPE, Turbolenza, Copertura, Brezza Valle), unici a usare curve continue Bézier a tutta altezza.

---

## 2. Decisione Architetturale e Design (Proposta 1)
In accordo con la selezione esplicita dell'utente:
1. **Asse Primario su Probabilità di Precipitazione (0 - 100%)**:
   - Asse Y continuo $0\% - 100\%$ con curva cubica Monotone Bézier ciano cielo (`var(--gm-accent-sky)`) e riempimento sfumato semitrasparente (`rgba(14, 165, 233, 0.18)`), stroke 2.4px.
   - Soglie aeronautiche orizzontali tratteggiate: 30% (cautela sviluppo) e 60% (critico / rovesci probabili NO FLY).
2. **Accumulo Condizionale su Barre SVG (`hasPrecip`)**:
   - Se almeno un'ora presenta pioggia $> 0.0\text{ mm/h}$, vengono tracciate le barre verticali di accumulo quantitativo (`type: 'bar'`, scala autonoma, opacità 0.55) sotto la curva.
   - Con 0.0 mm/h ovunque, nessuna barra vuota viene renderizzata, mantenendo il canvas pulito.
3. **Eliminazione Radicale della Heatmap Ribbon**:
   - Rimosso il nastro micro-testuale con font a 6.8px. L'altezza del grafico è recuperata interamente.
   - Lo scrubber orario posiziona il cursore direttamente sulla quota della curva di probabilità (es. 11% all'ora 13), azzerando le collisioni sulla linea di terra.
4. **Display a Sinistra (Single Source of Truth)**:
   - Valore primario: percentuale di probabilità dell'ora attiva (es. `11` con unità `% prob.`).
   - Sub-badge: accumulo orario e stato semaforico esplicito (es. `0.0 mm/h · Asciutto`, `Pioviggine (0.3 mm/h)` o `NO FLY: Pioggia (1.2 mm/h)`).

---

## 3. Impatti e Verifica
- **File Modificati**:
  - `ui/views/ForecastView.js`: aggiornato `multi-chart-precipitation` con la curva spline Parameteo (0-100%), rimossa `heatmapRow`, e resa dinamica la selezione di `primarySeries` in `renderSvgTrendChart`.
  - `tests/ui/forecastView.test.mjs`: contratti di test aggiornati per validare la curva di probabilità, le soglie 30%/60%, le barre condizionali e l'assenza del nastro micro-heatmap.
  - `MEMORY.md`: registrata la Lezione 146.
- **Esito Test Suite**: 711 test eseguiti (124 suite), 710 passanti, 0 falliti, 1 skipped (100% verde).
