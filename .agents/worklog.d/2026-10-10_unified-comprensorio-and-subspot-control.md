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
     - Elenca immediatamente la Panoramica Binomio e tutti i decolli e atterraggi del comprensorio attualmente selezionato.
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

## Verifica & Shift-Left Pre-Flight
- `npm test`: 551/551 test superati (88 suite su 88).
- Zero regressioni sui test pre-esistenti.
- Riduzione netta di 44px nell'header della vista Previsioni, migliorando l'ergonomia su viewport mobile ristretti (360px - 390px).
