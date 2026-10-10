# Scheda di Intervento: Istogramma SVG di Attività Mensile nel Cruscotto Statistiche Logbook

- **Data**: 2026-10-10
- **Modulo**: `core/logbook.js`, `ui/views/LogbookStatsView.js`, `ui/views/LogbookView.js`, `css/theme.css`
- **Tipologia**: Nuova funzionalità e potenziamento UX (Dashboard Statistiche di Volo)
- **Stato**: Completato e verificato (Suite 87/87, 546/546 test superati)

---

## 1. Contesto e Motivazione
La vista statistiche del libretto di volo (`LogbookStatsView.js`) presentava una fotografia statica dei totali di carriera (ore, voli, termiche, manovre) e delle distribuzioni categoriali per decolli e vele. Mancava tuttavia una dimensione temporale aggregata per consentire al pilota di cogliere a colpo d'occhio:
1. La stagionalità termica (mesi di picco primaverile/estivo rispetto a stasi autunno/inverno).
2. La continuità o interruzione prolungata dell'allenamento lungo l'anno.
3. Il volume di ore o voli mese per mese negli ultimi 12 mesi solari.

## 2. Decisioni Architetturali ed Ergonomiche

1. **Istogramma Verticale SVG a Zero Dipendenze**:
   - Rifiuto categorico di librerie grafiche esterne pesanti (Chart.js, D3).
   - Generazione matematica pura via markup SVG inline (`viewBox="0 0 360 148"`), con tempo di render $<1\text{ms}$ e zero allocazione GPU.
   - Conformità totale con i token semantici del design system aeronautico (`var(--gm-accent)`, `var(--gm-border)`, `var(--gm-text-muted)`), preservando l'alto contrasto sia in dark cockpit sia in sunlight light mode (`[data-theme="light"]`).

2. **Dominio Headless Core (`core/logbook.js`)**:
   - Implementazione della funzione pura `calculateMonthlyFlightActivity(flights, { monthsCount: 12, referenceDate })`.
   - Normalizzazione cronologica a 12 mesi a ritroso con etichette localizzate in italiano (`Gen`, `Feb`, ..., `Dic`).
   - Calcolo automatico di scala dinamica adattiva per asse Y (`maxMonthlyHours`, `maxMonthlyFlights`, `ceiling`, `midVal`).
   - Tolleranza formati data: stringhe ISO, 'YYYY-MM-DD', istanze Date.

3. **Interazione Reattiva con Toggle Ore / Voli**:
   - Toggle compatto ad alta ergonomia (`Ore` vs `Voli`) con target tattili $\ge 32\text{px} \times 44\text{px}$.
   - Aggiornamento istantaneo dell'istogramma, del sottotitolo di sintesi e degli assi metrici.
   - Evidenziazione cromatica del mese solare corrente con indicatore a punto e bordo primario d'accento.

## 3. Impatto sui Test e Shift-Left
- Aggiunti 4 test unitari per `calculateMonthlyFlightActivity` in `tests/core/logbook.test.mjs`.
- Aggiunti 3 test di rendering e toggle per `LogbookStatsView` in `tests/ui/logbookStatsView.test.mjs`.
- Aggiunto test di interazione per `LogbookView` in `tests/ui/logbookView.test.mjs`.
- Regressione zero: 546 test su 87 suite al 100% verdi.
