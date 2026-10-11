# Worklog: Refactoring Architetturale Grafici Aerologia (Parameteo Side-by-Side Standard)

## Contesto & Diagnosi
A seguito dell'analisi comparativa con il benchmark visivo di Parameteo, i grafici della modalità "Solo Grafici" in `ForecastView` presentavano un eccessivo debito visivo:
1. Impilamento verticale a 4 livelli con card annidate (`.gm-chart-box` all'interno di `.gm-trend-card`).
2. Tripla ridondanza informativa del valore attivo (header badge, tooltip scrubber e footer).
3. Tooltip e testi di soglia dipinti sopra le curve nel canvas SVG, generando occlusione dei tracciati.
4. Spezzate rigide o interpolazione non uniforme.

## Interventi Eseguiti
1. **Specifica di Dominio**:
   - Redatta la specifica [.agents/rules/ui_chart_design_spec.md](file:///c:/github/GlideMind/.agents/rules/ui_chart_design_spec.md) con layout blueprint a due colonne side-by-side e blacklist di anti-pattern visivi.
   - Collegata la specifica in `AGENTS.md`.
2. **Architettura Side-by-Side a 2 Colonne (`ui/views/ForecastView.js`)**:
   - **Colonna SX fissa (95px)**: Display metrica statico ad alto contrasto con nome parametro in maiuscolo, valore numerico ad alta scala (`1.35rem`), unità e sub-badge contestuale (es. raffica + direzione vento, AGL per LCL, classe per CAPE).
   - **Colonna DX fluida (`1fr`)**: Canvas SVG puro adagiato direttamente sul fondo della card senza box interni (`.gm-chart-box` trasparente, border-less).
3. **Bonifica del Data-Ink Ratio e Zero Occlusione**:
   - Rimosso il tooltip fluttuante `<rect>` + `<text>` sopra le curve in modalità compact (`hideTooltip: true`), lasciando solo la linea verticale discreta e il marker puntuale.
   - Rimosso il footer duplicato (`hideFooter: true`) in modalità compact.
   - Tratteggi discreti per le soglie senza etichette di testo invasive sul tracciato (`hideThresholdLabels: true`).
   - Linee curve Bézier cubiche (`buildSmoothPath`) con stroke 2.5px e campiture graduate (Azure blue per vento, slate per raffiche, purple per CAPE, cyan per LCL, amber per termiche).
4. **Resilienza Date Matching**:
   - Implementato fallback automatico `baseDate` in `computeParamMetrics`, `renderWindChart` e `renderSoundingChart` se la data attiva non ha prefissi corrispondenti nella serie oraria.
5. **Stili CSS (`css/theme.css`)**:
   - Definiti `.gm-trend-card.gm-trend-card-side-by-side`, `.gm-trend-side-panel`, `.gm-trend-side-label`, `.gm-trend-side-val`, `.gm-trend-side-unit`, `.gm-trend-sub-badge`.
6. **Governance Test Automatizzati (`tests/ui/forecastView.test.mjs`)**:
   - Aggiunta suite di test unitari a verifica della struttura side-by-side, del display di sinistra e dell'assenza di tooltip/footer duplicati.
   - 641/641 test passati con successo.
