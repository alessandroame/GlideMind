# ADR / Worklog: Heatmap Oraria Stile Windy per Probabilità Precipitazioni ed Eliminazione Interferenza di Gestalt

**Data**: 2026-10-12  
**Autore**: Antigravity  
**Ambito**: UI / Ergonomia Outdoor / ForecastView / Visualizzazione Parametri Meteo

---

## 1. Contesto e Problema Riscontrato
Nel grafico a linee e barre orarie della card "Precipitazioni" (`multi-chart-precipitation`) in modalità "Solo Grafici" di `ForecastView.js`:
1. **Interferenza di Gestalt e Sovraccarico Visivo**: La curva della probabilità di precipitazione (0-100%) era tracciata come linea spezzata azzurra con `stroke-dasharray="3,3"`, riferita a un asse Y secondario destro. Sul medesimo canvas SVG coesistevano due linee orizzontali di soglia aeronautica con lo stesso stile tratteggiato (`strokeDasharray: "4,3"`): 0.1 mm/h (giallo, pioviggine) e 0.5 mm/h (rosso, NO FLY pioggia). L'intersezione tra la curva della probabilità e le due linee di soglia orizzontali generava ambiguità visiva, poiché l'occhio del pilota confondeva la probabilità espressa in percentuale con le soglie quantitative di accumulo in mm/h.
2. **Assenza Barre con Accumulo 0.0 mm/h**: Nei modelli meteo ad alta risoluzione (es. ICON-EU in Open-Meteo per le valli alpine a 5-6 giorni di distanza), capita frequentemente che l'accumulo orario previsto sia 0.0 mm/h (barre di altezza zero), pur in presenza di una probabilità di rovesci sparsi o temporaleschi non trascurabile (es. 39% a Chialamberto il sabato). Con barre azzerate e una linea tratteggiata ambigua, l'utente percepiva il grafico come privo di dati o malfunzionante.

---

## 2. Decisione Architetturale e Design
In accordo con la scelta dell'utente e i principi di design e leggibilità outdoor (stile Windy / meteogrammi aerologici avanzati):
1. **Disaccoppiamento dei Domini (Accumulo vs Probabilità)**:
   - L'area di tracciato principale (asse Y sinistro) viene riservata **esclusivamente** all'accumulo orario quantitativo di pioggia in millimetri orari (`mm/h`) tramite barre SVG (`type: 'bar'`) e alle relative soglie di sicurezza aeronautica (0.1 mm/h cautela, 0.5 mm/h non volabile).
   - Rimosso l'asse Y secondario destro e la curva tratteggiata di probabilità dal grafico primario, eliminando ogni possibile confusione con le linee orizzontali di soglia.
2. **Striscia Oraria Heatmap Stile Windy (`heatmapRow`)**:
   - Implementato il supporto per `heatmapRow` in `renderSvgTrendChart`: una striscia oraria a celle colorate collocata immediatamente sotto la baseline del grafico (`yMax + 5`), prima delle etichette orarie.
   - Ogni cella oraria riporta la percentuale esatta (es. `39%`, `90%`, `0%`) con saturazione cromatica progressiva ad alto contrasto:
     - $\ge 60\%$: Rosso emergenza (`var(--gm-status-unflyable, #ef4444)`), testo bianco bold.
     - $35\dots 59\%$: Ambra cautela (`var(--gm-status-caution, #f59e0b)`), testo bianco bold.
     - $20\dots 34\%$: Ciano intenso (`var(--gm-accent-sky, #0ea5e9)`), testo bianco bold.
     - $1\dots 19\%$: Ciano tenue semitrasparente (`rgba(14, 165, 233, 0.28)`), testo ciano.
     - $0\%$: Grigio neutro attenuato (`rgba(148, 163, 184, 0.12)`), testo grigio.
   - La cella dell'ora attiva selezionata riceve un bordo accentuato (`stroke="var(--gm-accent)" stroke-width="1.6"`).
   - La linea verticale del cursore orario si estende verso il basso attraversando l'intera cella della heatmap per un perfetto allineamento temporale con barre ed etichette orarie.
3. **Typography & Layout Safeguards nel Side Panel**:
   - Ottimizzato `.gm-trend-side-panel` in `css/theme.css` con larghezza minima a 98px e padding 10px 6px 8px 8px.
   - Impostato `.gm-trend-side-label` con `font-size: 0.62rem`, `letter-spacing: 0.02em` e `text-overflow: ellipsis` per prevenire il clipping dell'etichetta estesa "PRECIPITAZIONI" contro la linea di separazione verticale.

---

## 3. Impatti e Verifica
- **File Modificati**:
  - `ui/views/ForecastView.js`: aggiunta gestione `heatmapRow` in `renderSvgTrendChart`; riconfigurato `multi-chart-precipitation` in `renderMultiTrendCharts`.
  - `css/theme.css`: tolleranze tipografiche di `.gm-trend-side-panel` e `.gm-trend-side-label`.
  - `tests/ui/forecastView.test.mjs`: contratti di test aggiornati ed estesi con test dedicato per `renderSvgTrendChart` con `heatmapRow`.
- **Esito Test Suite**: 705 test eseguiti (123 suite), 704 passanti, 0 falliti, 1 skipped (100% verde).
