# Worklog: Ottimizzazione & Bonifica Visiva Schede Espanse Aerologia

## Contesto & Diagnosi
In modalità "Schede" (`ForecastView`), l'espansione di una card generava un eccessivo carico verticale e cognitivo:
1. **Quadrupla Ridondanza Informativa**: il valore dell'ora attiva appariva nell'intestazione, nella prima cella della griglia dettagli, nel tooltip SVG e nel footer.
2. **Iper-Annidamento Visivo (Over-Boxing)**: 6 scatole interne con bordi multipli (4 celle separate con bordo, box consiglio pilota con 4 bordi, box grafico interno con bordi).
3. **Ingombro Verticale Mobile**: la scheda aperta superava i 400px di altezza, spingendo la timeline e gli altri elementi fuori dal viewport.
4. **Dissonanza Grafica**: il grafico incorporato riproponeva il vecchio layout con tooltip fluttuante ostruente e footer duplicato.

## Interventi Eseguiti
1. **Compattezza e De-boxing della Griglia Dettagli (`css/theme.css`)**:
   - Trasformata `.gm-param-details-grid` in un'unica striscia di metadati continua e integrata, azzerando i bordi individuali e i background scuri delle singole celle (`.gm-param-detail-cell`).
2. **Valorizzazione del Consiglio Pilota (`css/theme.css`)**:
   - Rimosse le cornici perimetrali (`border-top`, `border-right`, `border-bottom`) da `.gm-param-advice-box`, preservando solo la barra verticale di evidenza semantica a sinistra (`border-left: 3px solid var(--gm-accent)`) con sfondo a bassa intensità cromatica.
3. **Grafico Incorporato Compatto e Senza Ostruzioni (`ui/views/ForecastView.js`)**:
   - Invocati `renderWindChart`, `renderSoundingChart` e `renderSvgTrendChart` con opzioni `{ compact: true, hideTooltip: true, hideFooter: true, hideThresholdLabels: true }`.
   - Rimossi box interno scuro, tooltip fluttuante occludente e riga riassuntiva duplicata in calce al grafico.
4. **Verifica Automatizzata**:
   - Esecuzione completa della test suite: 641/641 test passati.
