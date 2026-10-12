# Worklog Fragment: Rappresentazione Duale Precipitazioni (Accumulo mm/h + Curva Probabilità %) nei Grafici Multi-Trend

- **Data**: 2026-10-12
- **Ambito**: `ForecastView.js`, `tests/ui/forecastView.test.mjs`, `MEMORY.md` (Lezione 135)
- **Autore**: Antigravity

## Contesto & Diagnosi
L'utente ha riscontrato l'assenza di valori e barre nel grafico delle precipitazioni orarie per Chialamberto durante il weekend, a fronte di previsioni di pioggia diffuse dai media meteorologici generalisti (es. 3B Meteo, IlMeteo).
L'ispezione della risposta API Open-Meteo per Chialamberto (`lat: 45.37887, lon: 7.35679`) ha evidenziato:
1. Il modello `best_match` (blend ICON/ECMWF) restituiva un accumulo orario a terra quantitativo `precipitation = 0.0 mm/h`, ma una probabilità di precipitazione (`precipitation_probability`) fino al 39% con copertura nuvolosa al 95-100%, mentre modelli globali (es. GFS seamless) prevedevano fino a 1.7 mm.
2. In `ForecastView.js`, il grafico `multi-chart-precipitation` plottava unicamente le barre dell'accumulo millimetrico (`p.precip`). Con accumulo a 0, le barre avevano altezza 0 pixel, rendendo il grafico visivamente piatto e vuoto.
3. Il badge nel pannello laterale valutava solo `precip > 0`, impostando la classe `status-flyable` (verde) e l'etichetta "Assenti", inducendo in errore il pilota sulla reale sicurezza del volo.

## Interventi Implementati
1. **Supporto Serie Multi-Scala & Asse Secondario in `renderSvgTrendChart()`**:
   - Abilitato il supporto a serie con `minY` e `maxY` personalizzati (`s.minY`, `s.maxY`), preservando la scala principale per le serie non specificate.
   - Aggiunto parametro `secondaryAxis: { unit: '%', minY: 0, maxY: 100 }` con calcolo dinamico del canvas (`xMax = 322` per lasciare spazio alla scala destra) e render dei marcatori percentuali `100%` e `0%`.
2. **Configurazione Duale in `multi-chart-precipitation`**:
   - **Serie 1 (Barre)**: Accumulo orario (`p.precip` in mm/h) a barre azzurre con opacità 0.85 su asse sinistro 0-3 mm/h.
   - **Serie 2 (Polilinea Tratteggiata & Area)**: Probabilità di precipitazione (`p.precipProb` in %) con stroke azzurro, `stroke-dasharray="3,3"`, riempimento semitrasparente e scala 0-100%.
   - **Badge Consapevole della Probabilità**: Se `precip === 0`, il badge valuta `precipProb`:
     - $\ge 50\%$: `status-alert` (`XX% prob. rovesci`)
     - $\ge 25\%$: `status-caution` (`XX% prob. pioggia`)
     - $> 0\%$: `status-flyable` (`XX% prob.`)
     - $0\%$: `status-flyable` (`Assenti`)
3. **Test di Regressione e Governance**:
   - Aggiunto test in `tests/ui/forecastView.test.mjs` per validare la presenza delle due serie, del marcatore d'asse 100% e della classe `status-caution` con accumulo 0.0 mm/h e probabilità 39%.
   - Tutti i 698 test della suite passano al 100% verde (`npm test`).
