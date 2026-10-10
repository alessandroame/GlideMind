# ADR & Worklog: Unified Comprensorio and Sub-Spot Control Architecture

- **Data**: 2026-10-10
- **Scope**: `ui/views/ForecastView.js`, `css/theme.css`, `tests/ui/forecastView.test.mjs`
- **Autore**: Antigravity

## Contesto & Motivazione
Nella vista Previsioni (`ForecastView`), la selezione del luogo di volo era precedentemente frammentata su due livelli verticali sovrapposti:
1. Livello 1: Barra del Comprensorio (`.gm-comprensorio-bar`) che apriva il picker sheet globale (~48px).
2. Livello 2: Dropdown custom del sub-spot (`.gm-subspot-dropdown-wrapper`) per alternare tra Panoramica, decolli e atterraggi (~44px).

Questa separazione occupava oltre 92px verticali di viewport prima ancora di visualizzare i dati meteo, violava la legge di Hick frammentando la selezione del punto di volo in due interazioni disgiunte, e complicava l'uso a una mano all'aperto.

## Decisioni Architetturali & Implementazione

1. **Barra Unificata Comprensorio & Spot (`.gm-unified-spot-bar`)**:
   - Sostituite le due barre stacked con un unico componente orizzontale compatto ad altezza minima $\ge 48\text{px}$ (Fitts's Law).
   - Mostra contestualmente:
     - Icona avionica del punto attivo (o del binomio panoramico).
     - Nome del Comprensorio e provincia con live weather badge.
     - Badge inline dello spot o decollo attivo (`.gm-unified-subspot-badge`) con indicazione di cambio immediato.
   - Conservato il `<select id="forecast-subspot-select" class="gm-subspot-select sr-only">` per retro-compatibilità con screen reader, strumenti di accessibilità e contratti di automazione.

2. **Sheet Gerarchico a 2 Livelli con Accesso Rapido 1-Tap (`openPickerSheet`)**:
   - In cima allo sheet di selezione, prima della ricerca e della lista globale, è inserita la sezione dedicata `.gm-picker-current-spot-section`:
     - Elenca la Panoramica e tutti i punti di volo del sito attivo, suddivisi in **3 sezioni semantiche con intestazioni e icone dedicate**:
       1. **Panoramica** (`.gm-subspot-group-overview`) con icona binomio e spunta di selezione attiva.
       2. **Decolli** (`.gm-subspot-group-takeoffs`) con conteggio dinamico, quota ed esposizione azimutale.
       3. **Atterraggi** (`.gm-subspot-group-landings`) con conteggio dinamico, quota e indicatore di ufficialità.
     - Permette il cambio di decollo o ritorno alla panoramica in **1 solo tap a 0 scroll**.
   - Al tocco di un'opzione di sub-spot (`select-subspot`), lo sheet si chiude automaticamente (`closeSheet()`), lo store si aggiorna e la vista si re-idrata reattivamente sotto la soglia di Doherty (<50ms).

3. **Stili CSS ad Alto Contrasto & Responsive (`css/theme.css`)**:
   - Definiti token per `.gm-unified-spot-bar`, `.gm-unified-subspot-badge` e `.gm-picker-current-spot-section`.
   - Supporto completo per il tema scuro avionico e il tema chiaro sunlight (`[data-theme="light"]`).

4. **Suite di Test Automatizzati (`tests/ui/forecastView.test.mjs`)**:
   - Aggiunta la suite `Unified Comprensorio and Sub-Spot Control Architecture` a copertura di:
     - Rendering della barra unificata e presenza degli attributi di accessibilità.
     - Generazione della sezione sub-spot rapida nello sheet di selezione.
     - Interazione di click con cambio sub-spot e sincronizzazione store/state.

5. **Rimozione delle Righe di Chip Ridondanti (`.gm-spot-subselection-container`)**:
   - Rimosse le due righe di chip orizzontali duplicate (`DECOLLO: (N)` e `ATTERRAGGIO: (N)`) posizionate tra la barra del comprensorio e le date tabs in `ForecastView.js`.
   - Bonificati gli stili obsoleti in `css/theme.css` (`.gm-spot-subselection-container`, `.gm-spot-subselector-row`, `.gm-spot-subselector-chips`, `.gm-spot-pill`).
   - L'accesso e la commutazione dei decolli/atterraggî multipli sono ora completamente e unicamente governati dallo sheet a 1-tap (`.gm-picker-current-spot-section`), azzerando il sovraccarico visivo nell'header e recuperando ulteriori ~75px verticali.
   - Aggiornata la suite di test in `tests/ui/forecastView.test.mjs` verificando l'assenza di `.gm-spot-subselection-container` nell'header e la corretta commutazione dei punti di volo tramite `select-subspot`.

## Verifica & Shift-Left Pre-Flight
- `npm test`: 557/557 test superati (89 suite su 89).
- Zero regressioni sui test pre-esistenti.
- Riduzione complessiva di oltre 115px nell'header della vista Previsioni (eliminazione dropdown + rimozione chip sub-selezione), migliorando drasticamente la superficie utile per i dati meteorologici e l'ergonomia su viewport mobile ristretti (360px - 390px).
