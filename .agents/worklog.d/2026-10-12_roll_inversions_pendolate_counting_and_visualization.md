# ADR: Conteggio e Visualizzazione delle Spendolate/Pendolate nelle Inversioni di Rollio

## Contesto e Motivazione
L'utente ha richiesto espressamente di conteggiare e visualizzare le pendolate ("spendolate" nel gergo colloquiale dei piloti) in corrispondenza delle inversioni di rollio eseguite durante il volo. Nelle manovre di addestramento al volo libero e SIV, l'inversione di rollio consiste in una sequenza ritmica di virate alternate (destra-sinistra) in cui ciascuna oscillazione completa da un lato all'altro corrisponde a una pendolata.

## Decisioni Architetturali

1. **Rilevamento e Conteggio nel Motore Cinematico (`core/flightManeuvers.js`)**:
   - `processOscillationChain`: ciascun elemento della catena alternata (`chain`) rappresenta una semionda / oscillazione direzionale con rateo di virata $\ge 4^\circ/\text{s}$ e ampiezza $\ge 45^\circ$.
   - Il numero di oscillazioni alternate nella catena (`chain.length`) corrisponde esattamente al numero di pendolate / spendolate eseguite dal pilota.
   - Esposto esplicitamente `pendolateCount: chain.length` sull'evento manovra generato, unitamente a `chainCount` e all'array strutturato `oscillations`.
   - Ampliata la classificazione per rilevare sia le inversioni di rollio acrobatiche ad alta energia (`hasInversioniAcro`), sia le inversioni di rollio didattiche/scuola progressive (`hasInversioniStandard`), evitando che pendolate regolari vengano escluse per soglie di velocità o variometro eccessivamente restrittive.

2. **Propagazione nella Telemetria e Replay 3D (`core/flightTelemetry.js`)**:
   - In `extractFlightEvents`, l'evento manovra di tipo `inversioni` visualizza `shortLabel: "${pCount} Pend."`, label estesa `Inversioni (${pCount} pendolate)` e dettagli con il conteggio esplicito delle pendolate.

3. **Interfaccia Utente e Profilo SVG (`ui/views/FlightDetailSheet.js`, `css/theme.css`)**:
   - **Badge Pill Dedicato**: nella card delle manovre dinamiche, per ogni inversione di rollio viene visualizzato il badge `<span class="gm-maneuver-pendolate-pill">X pendolate</span>`, con stile arancio aeronautico e font mono ad alto contrasto.
   - **Titolo Esplicito**: `formatManeuverTitle` genera `Inversioni di rollio (X pendolate)`.
   - **Estrattore Robusto (`getPendolateCount`)**: estrae il conteggio da `pendolateCount`, `chainCount` o tramite regex da descrizioni testuali ("X pendolate", "X spendolate", "X oscillazioni").
   - **Grafico Altimetrico SVG**: implementato marker visivo rettangolare arancione con etichetta `${pCount}P` (es. `4P`), che evidenzia sul profilo altimetrico l'istante e la quota in cui le pendolate sono state eseguite.
   - **Debriefing Didattico di Sicurezza**: l'istruttore virtuale (Guido) commenta espressamente l'esecuzione delle pendolate consecutive e la coordinazione peso-freno.

## Conseguenze e Verifica
- La suite di test automatizzati (`npm test`, 665 test su 116 suite) registra esito positivo al 100%.
- Aggiunti test unitari specifici in `tests/core/flightManeuvers.test.mjs` e `tests/ui/flightDetailSheet.test.mjs`.
