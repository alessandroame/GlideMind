# Diario Operativo: Finestre di Volo Giornaliere (Flight Windows) e Imposizione Decollo

- **Data**: 2026-10-13
- **Ambito**: Previsioni Meteo / Aerologia (`ForecastView.js`, `core/flightWindows.js`, `css/theme.css`)
- **Stato**: Consolidato e Verificato (738 test al 100% verdi)

---

## Contesto & Motivazione
In modalità Overview di un comprensorio, il pilota necessita di comprendere l'evoluzione temporale della giornata senza dover decodificare manualmente ogni singola ora dello scrubber. Inoltre, quando un pilota sceglie esplicitamente un decollo dal picker, l'applicazione deve rispettare la sua scelta (imposizione manuale) senza override silenti, evidenziando se altre opzioni del comprensorio risultano più favorevoli.

---

## Modifiche Architetturali

1. **Modulo Headless Core: `core/flightWindows.js`**:
   - Algoritmo puro di segmentazione diurna (dall'alba al tramonto via `core/daylight.js`) in 3-4 finestre operative naturali (Mattina, Ore Centrali, Pomeriggio, Sera/Restituzione).
   - Valutazione per ciascuna finestra dello stato semaforico, della combinazione decollo-atterraggio e dei fattori di rischio (Novice Pilot Spec).
   - Supporto del parametro `forcedTakeoffId`: se impostato, valuta rigidamente il decollo scelto; se degradato, fornisce un suggerimento alternativo consultivo (`alternativeTakeoff`).
   - 100% testabile in pure Node.js runtime (suite `tests/core/flightWindows.test.mjs`).

2. **Integrazione UI in `ForecastView.js`**:
   - Aggiunta della sezione `#forecast-flight-windows-container` con titolo "Evoluzione Giornaliera" e badge esplicito in caso di decollo imposto (`Imposto: [Nome Decollo]`).
   - Card interattive a touch target $\ge 48\text{px}$ con classe `.active` sincronizzata sull'ora attiva e azione 1-tap `data-action="select-window"` che sposta istantaneamente lo scrubber all'orario d'inizio della finestra.
   - Aggiornamento in-place a `<2ms` della classe `.active` sulle card durante lo scrub orario (`updateHourlyInPlace`).

3. **Design Tokens & Regole di Stile (`css/theme.css`)**:
   - Classi `.gm-flight-windows-section`, `.gm-flight-window-card`, `.gm-flight-window-badge`, `.gm-flight-window-hazard-chip`.
   - Adattamento per Sunlight Mode (`[data-theme="light"]`) con contrasti WCAG 2.1 AA $\ge 4.5:1$ e zero emoji decorative.

4. **Test & Shift-Left Governance**:
   - 738 test totali al 100% verdi (127 suite).
   - Tutti i 5 Gate Shift-Left superati (zero DOM nel core, touch target $\ge 48\text{px}$, assenza token vietati).
