# Allineamento Cromatico Codici di Gravità e Volabilità tra Dark e Light Mode

- **Data**: 2026-10-12
- **Ambito**: CSS Theme, Cartografia, Indicatori Semantici, Design System (`css/theme.css`, `ui/map/mapEngineAdapter.js`)
- **Autore**: Alessandro Amé (Pair programming con Antigravity)

---

## Contesto & Diagnosi

L'utente ha segnalato che nella modalità chiara dell'applicazione i colori semantici rosso, verde e giallo risultavano eccessivamente scuri, spenti e fangosi rispetto all'energia e alla chiarezza visiva percepita nella modalità scura (in particolare sulla scrubber bar della Timeline Volabilità, sui badge comprensorio e su tutti gli indicatori di severità).
È stato richiesto di utilizzare le stesse identiche colorazioni della modalità scura per tutti gli elementi deputati a esprimere il livello di gravità/volabilità.

### Causa Radice
Nelle precedenti iterazioni del tema chiaro (`[data-theme="light"]`), le variabili semantiche di volabilità e gravità erano state ricalibrate verso il basso con tonalità dense e scure:
- Verde: `#15803d` / `#166534` (anziché `#22c55e`)
- Giallo/Ambra: `#b45309` / `#92400e` (anziché `#eab308`)
- Rosso: `#b91c1c` / `#991b1b` (anziché `#ef4444`)
- Severo: `#450a0a` / `#991b1b` (anziché `#09090b` / `#f87171`)
- Allerta: `#c2410c` (anziché `#f97316`)

Tale sovrascrittura si propagava su:
1. Barre verticali e sfondi di slot della timeline oraria (`.compact-bar-fill`, `.compact-bar`, `var(--gm-status-*)`).
2. Badge delle schede parametri meteorologici (`.gm-param-status-badge.*`).
3. Badge delle vele (`.gm-glider-pill-badge.en-*`).
4. Indicatori di allineamento e marker cartografici (`STATUS_COLORS` in `ui/map/mapEngineAdapter.js`).
5. Banner di avviso e sicurezza volo (`.gm-flight-safety-warning-banner`).
6. Bottoni di decollo rapido e pillole spot scrubber (`.gm-map-top-spot-btn`, `.gm-map-scrubber-spot-pill`).

---

## Interventi Eseguiti

1. **Allineamento Variabili CSS `:root` e `[data-theme="light"]`**:
   - Impostate in `[data-theme="light"]` le identiche colorazioni e trasparenze della modalità scura:
     - `--gm-status-flyable: #22c55e;` e `--gm-status-flyable-bg: rgba(34, 197, 94, 0.15);`
     - `--gm-status-caution: #eab308;` e `--gm-status-caution-bg: rgba(234, 179, 8, 0.15);`
     - `--gm-status-unflyable: #ef4444;` e `--gm-status-unflyable-bg: rgba(239, 68, 68, 0.15);`
     - `--gm-status-severe: #09090b;` `--gm-status-severe-text: #f87171;` `--gm-status-severe-border: #ef4444;`
     - `--gm-status-alert: #f97316;` e `--gm-status-alert-bg: rgba(249, 115, 22, 0.15);`
2. **Aggiornamento Badge Scheda Parametri (`.gm-param-status-badge`)**:
   - Rimosse le tonalità scure `#15803d`, `#92400e`, `#991b1b`, `#7f1d1d` a favore dell'uso diretto di `var(--gm-status-*)` con sfondi traslucidi ad alto contrasto.
3. **Aggiornamento Pillole Vele (`.gm-glider-pill-badge.en-*`)**:
   - Uniformati i colori EN-A (`#4ade80`), EN-B (`#60a5fa`), EN-C (`#fbbf24`), EN-D (`#f87171`) al tema scuro.
4. **Aggiornamento Oggetto `STATUS_COLORS` (`ui/map/mapEngineAdapter.js`)**:
   - Allineata la proprietà `color` a `fill` per `flyable` (`#22c55e`), `caution` (`#eab308`), `unflyable` (`#ef4444`).
5. **Banner e Pulsanti Speciali**:
   - `.gm-flight-safety-warning-banner` su fondo chiaro adotta bordo e testo `#ef4444` con sfondo semitrasparente `rgba(239, 68, 68, 0.15)`.
   - `.gm-map-top-spot-btn` utilizza `color: var(--gm-status-flyable);`.
   - `.gm-spot-header .gm-badge-*` su tema chiaro allinea il bordo a `#22c55e`, `#f59e0b`, `#ef4444`.
6. **Governance Test e Regression Guard**:
   - Estesa la suite `tests/ui/shiftLeftGovernance.test.mjs` (Gate 4) con asserzioni esplicite sull'uniformità di `--gm-status-flyable`, `--gm-status-caution`, `--gm-status-unflyable`.
   - Verificato il passaggio completo dell'intera test suite (`681/681` test superati).

---

## Impatti e Risultati

- **Immediatezza Visiva Outdoor**: Le barre della timeline (13 ore) e tutti i badge semantici mostrano ora la stessa luminosità e brillantezza sia di notte che sotto la luce del sole.
- **Zero Incoerenza**: Nessuna discrepanza cromatica tra scrubber della mappa, scrubber delle previsioni, card comprensorio e popup cartografici.
