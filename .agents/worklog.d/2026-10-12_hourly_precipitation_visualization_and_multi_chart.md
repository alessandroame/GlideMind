# Integrazione Visualizzazione Oraria delle Precipitazioni e Grafico Multi-Trend

- **Data**: 2026-10-12
- **Ambito**: `ForecastView.js`, `theme.css`, `tests/ui/forecastView.test.mjs`
- **Tipo Intervento**: Feature / Visual Architecture & Ergonomics

---

## Contesto & Motivazione
Sebbene il motore computazionale (`core/flyability.js`) e l'ingestione dati (`core/openMeteoApi.js`) gestissero già le precipitazioni come fattore aeronautico bloccante (Severità 3 / NO FLY per pioggia $> 0.5\text{ mm/h}$ con rischio stallo paracadutale per bagnatura dell'ala), nell'interfaccia utente mancava una rappresentazione grafica oraria:
1. Nella vista "Solo Grafici" (`renderMultiTrendCharts`), mancava un pannello dedicato per visualizzare l'intensità di pioggia oraria e la presenza di rovesci lungo la giornata.
2. Nella scheda "Copertura Nuvolosa & Insolazione", la pioggia era confinata a una riga secondaria e il grafico SVG tracciava solo la percentuale di nuvolosità.
3. Nel generatore `renderSvgTrendChart()`, mancava il supporto nativo per serie a barre verticali (`type: 'bar'`), rendendo impossibile plottare istogrammi di pioggia.

---

## Modifiche Architetturali & Tecniche

1. **Supporto Serie a Barre in `renderSvgTrendChart()`**:
   - Esteso il renderer SVG per gestire `s.type === 'bar'`, disegnando elementi `<rect>` verticali con larghezza calibrata sulla risoluzione oraria (`hRange`), `rx="1"` e opacità controllata.
   - Formattazione decimale a una cifra (`toFixed(1)`) sull'asse Y per scale $\le 5$ e nei tooltip per unità `mm/h` ed `EDR`, evitando arrotondamenti impropri (es. piogge da $0.3\text{ mm/h}$ arrotondate a 0).
2. **Estrazione Parametri Orari in `computeParamMetrics()`**:
   - Estratti distintamente `precip` (intensità in mm/h da `precipitation` o `rain`) e `precipProb` (probabilità in % da `precipitation_probability`).
3. **Pannello Dedicato `multi-chart-precipitation` in "Solo Grafici"**:
   - Aggiunta la settima card metrica nello stack side-by-side (`multi-chart-precipitation`), posizionata strategicamente tra Copertura e Brezza Valle.
   - Istogramma a barre celesti (`var(--gm-accent-sky)`) con soglie aeronautiche di sicurezza: linea gialla tratteggiata a $0.1\text{ mm/h}$ (Pioviggine) e linea rossa tratteggiata a $0.5\text{ mm/h}$ (NO FLY).
   - Badge orario dinamico di stato: `NO FLY: Pioggia`, `Pioviggine`, `X% prob.` o `Assenti`.
4. **Arricchimento Scheda "Copertura Nuvolosa & Insolazione"**:
   - Valutazione semantica con priorità su rovesci: Severità 3 per pioggia $> 0.5\text{ mm/h}$, Severità 2 per pioviggine ($\ge 0.1\text{ mm/h}$) o rischio elevato ($\ge 60\%$).
   - Badge orario esplicito nel sottotitolo: `· Pioggia (X.X mm/h)` o `· Pioviggine (X.X mm/h)`.
   - Grafico a doppia serie nel dettaglio: polilinea continua per la copertura nuvolosa (%) e polilinea celeste tratteggiata per la probabilità di precipitazione (%).
5. **Token di Design System in `css/theme.css`**:
   - Dichiarati i token `--gm-accent-sky` e `--gm-rain-bar` sia in `:root` (#0ea5e9 / #38bdf8) sia in `[data-theme="light"]` (#0284c7 / #0ea5e9).
6. **Test di Regressione e Governance**:
   - Aggiunta suite dedicata `Precipitation Visualization & Hourly Trend Contracts` in `tests/ui/forecastView.test.mjs`, validando la presenza della card, le soglie, la doppia serie e il rendering SVG dei rettangoli a barre (686 test passati al 100%).
