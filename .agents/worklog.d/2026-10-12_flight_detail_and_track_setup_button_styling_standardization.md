# Worklog Fragment: Standardizzazione Stilistica dei Pulsanti Dettaglio Volo e Setup Traccia

- **Data**: 2026-10-12
- **Contesto**: Risoluzione dell'incongruenza visiva dei pulsanti di azione inferiore nella schermata di dettaglio volo (`FlightDetailSheet.js`) e setup traccia (`TrackSetupSheet.js`). I pulsanti apparivano con i bordi grigi 3D in rilievo di default del browser anziché adottare il design system coerente dell'applicazione (angoli arrotondati, 1px di bordo sottile, gradienti/ombre moderne).

## Diagnosi & Root Cause Analysis (RCA)
1. In `css/theme.css`, le proprietà fondamentali di reset (`appearance: none; -webkit-appearance: none; border-radius: var(--gm-radius-md); font-family: inherit; cursor: pointer; border: 1px solid transparent;`) erano dichiarate esclusivamente sul selettore base `.gm-btn`.
2. Nei componenti `FlightDetailSheet.js` e `TrackSetupSheet.js`, i pulsanti dichiaravano unicamente classi modificatore come `class="gm-btn-secondary gm-bottom-action-btn"` e `class="gm-btn-primary gm-bottom-replay-btn"`, privi della classe `.gm-btn`.
3. In mancanza del reset, i motori di rendering applicavano il foglio di stile predefinito del browser (`border: 2px outset buttonborder; border-radius: 0; appearance: auto`), producendo pulsanti quadrati con effetto rilievo 3D non coerente con l'estetica dell'app.

## Interventi Eseguiti
1. **Autonomia dei Modificatori CSS in `css/theme.css`**:
   - Esteso il blocco `.gm-btn` a `.gm-btn, .gm-btn-primary, .gm-btn-secondary, .gm-btn-ghost, .gm-bottom-replay-btn, .gm-bottom-action-btn` per garantire reset e bordi arrotondati a prescindere dalla presenza della classe base.
   - Perfezionata la barra di ancoraggio inferiore `.gm-flight-detail-bottom-bar` con sfocatura `backdrop-filter: blur(12px)`, bordo superiore `1px solid var(--gm-border)` e ombreggiatura morbida.
   - Aggiunto feedback di pressione tattile `:active { transform: scale(0.98); }`.
2. **Allineamento Semantico Markup in `ui/views/FlightDetailSheet.js`**:
   - Aggiornati `#btn-open-track-setup`, `#btn-save-flight-notes`, `#btn-replay-from-detail`, `#btn-setup-from-detail`, `#btn-download-from-detail` anteponendo la classe base `gm-btn`.
3. **Allineamento Semantico Markup in `ui/views/TrackSetupSheet.js`**:
   - Aggiornati `#btn-setup-auto-detect-trim`, `#btn-setup-reset-trim`, `#btn-setup-apply-trim`, `#btn-setup-reset-elevation`, `#btn-setup-apply-elevation` con la classe base `gm-btn`.
4. **Verifica e Regression Rollback**:
   - Ripristinata la coerenza delle opzioni cartografiche in `core/store.js` garantendo il passaggio al 100% dell'intera suite di test automatizzati (681 test passati su 682, 0 fallimenti, 1 saltato).
