# Diario di Lavoro: Riformulazione Modello Continuità Pilota e Bonifica "Da rinnovare"

- **Data**: 2026-10-10
- **Modulo**: `core/logbook.js`, `ui/views/HomeDashboardView.js`, test suite
- **Autore**: Antigravity

---

## Contesto & Diagnosi

Nella vista Home (`HomeDashboardView.js`), la sezione "Attività Pilota" mostrava un badge ambra con testo **"DA RINNOVARE"** per gli utenti con libretto vuoto (0 ore di volo) o senza voli registrati negli ultimi 30 giorni.

### Causa Radice
La funzione `calculatePilotPeriodMetrics` adottava una logica binaria derivata acriticamente dalla traduzione letterale del termine aeronautico anglosassone *pilot currency* (recency di volo). Il termine "Da rinnovare" generava grave confusione semantica per i piloti italiani, evocando la scadenza burocratica dell'attestato VDS, della visita medica di idoneità o della polizza assicurativa, e risultava paradossale su profili con 0 ore di volo registrate.

---

## Interventi Eseguiti

1. **Definizione Costanti e Modello di Continuità Operativa a 4 Stati (`core/logbook.js`)**:
   - `PILOT_CURRENCY_STATUS`:
     - `no_flights`: nessun volo nel libretto -> etichetta `'Nessun volo'`, badge grigio neutro (`gm-badge-nd`).
     - `active`: ultimo volo entro 35 giorni -> etichetta `'In attività'`, badge verde (`gm-badge-flyable`).
     - `reentry`: ultimo volo tra 36 e 90 giorni -> etichetta `'Ripresa graduale'`, badge ambra (`gm-badge-caution`).
     - `lapsed`: ultimo volo oltre 90 giorni -> etichetta `'Fermo prolungato'`, badge arancione (`gm-badge-alert`).
   - Calcolo del valore oggettivo `daysSinceLastFlight` e generazione del messaggio di *explainability* in `currencyDescription`.

2. **Integrazione UI e Explainability (`ui/views/HomeDashboardView.js`)**:
   - Mappatura dinamica delle classi CSS del badge in base a `currencyStatus`.
   - Inserimento dell'attributo `title` con spiegazione contestualizzata e consiglio pratico di sicurezza al tap/hover.

3. **Verifica e Test Automatizzati (`tests/core/logbook.test.mjs`, `tests/ui/homeDashboardView.test.mjs`)**:
   - Aggiornati i test del core logbook per validare tutti i 4 stati e i messaggi contestuali.
   - Aggiunta suite di verifica del rendering nella Home Dashboard per tutti i 4 stati (528 test passati).
