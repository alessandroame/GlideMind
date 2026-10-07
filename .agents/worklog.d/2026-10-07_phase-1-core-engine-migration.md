# ADR / Scheda Intervento: Fase 1 - Core Engine Migration (geoSpatialMath & flyability)

- **Data**: 2026-10-07
- **Autore**: Alessandro Amè & Google Antigravity Agent
- **Fase**: 1 (Core Engine Migration)
- **Stato**: Consolidato

---

## 1. Contesto & Obiettivo
Avvio della Fase 1 di GlideMind conformemente a `MASTER_PLAN.md` e `DESIDERATA.md`. Estrazione dei moduli geodetici, geometrici e di calcolo della volabilità aeronautica da `C:\github\ParaMeteo\js\` verso la directory `core/`, garantendo zero dipendenze dal DOM, totale purezza algoritmica e 100% di unit test automatizzati passanti nel test runner nativo di Node.js (`node:test`).

---

## 2. Decisioni Architetturali (ADR)

1. **Estrazione di `core/geoSpatialMath.js`**:
   - Fornisce funzioni pure per la conversione di coordinate IGC (DMM <-> Decimal Degrees con precisione a 7 decimali).
   - Calcolo geodetico WGS84: distanza ortodromica (Haversine), rilevamento azimutale iniziale (bearing forward), decomposizione vettoriale del vento (headwind/crosswind/scostamento asse decollo).
   - Geometria di traiettoria: Chaikin polyline corner-cutting smoothing, distanza punto-segmento, distanza cumulativa rotta.
   - Proiezione cartografica: EPSG:3857 Web Mercator conforme diretta e inversa, fattore di scala metrica con secante della latitudine.
   - Topocentric Metric Space (ENU / Three.js Y-Up): trasformazione single-shot dei punti rispetto al pivot del decollo, compatibile con CustomLayer di MapLibre senza dipendere dall'ambiente browser.
   - Altimetria DEM: offset rigido di quota al decollo (Delta H), interpolazione altimetrica a gradiente lineare bicanale (decollo/atterraggio) con clamping anti-extrapolazione in termica.

2. **Estrazione di `core/flyability.js`**:
   - Isolamento completo dal DOM e disaccoppiamento da `i18n.js` (che manipolava elementi HTML del browser): implementato dizionario autonomo interno per stringhe e motivazioni di sicurezza con supporto pluggable per funzione traduttrice (`setFlyabilityTranslator`).
   - Disaccoppiamento dallo store reattivo UI: accetta specifiche ala esplicite o ricorre al profilo aliante standard predefinito (`vTrim: 37 km/h`, `AR: 5.1`).
   - Scomposizione fisica atmosferica: calcolo dello shear vettoriale tra livelli di pressione atmosferica (`calculateVectorShear`), stima della turbolenza sintetica EDR (`calculateTurbulenceEDR`), modello Deardorff per ascendenza termica e quota del mixing layer (`calculateThermalLift`).
   - Algoritmo waterfall a cascata: priorità aeronautica rigida per tie-breaking (Esposizione/Sottovento 50 > Vento/Raffiche 40 > Turbolenza 30 > Pioggia 20 > CAPE 10).
   - Guardie di sicurezza salva-vita: rilevamento sottovento severo (rotore sul decollo), limite raffiche proporzionale a $v_{\text{trim}}$, instabilità convettiva CAPE e bagnamento ala da pioggia.
   - Timeline scoring: filtraggio rigoroso delle ore di luce tra alba e tramonto e aggregatore settimanale 7 giorni con identificazione della finestra operativa migliore.

3. **Suite di Unit Test Nativi (`tests/core/`)**:
   - `tests/core/geoSpatialMath.test.mjs`: 17 test unitari su coordinate reali alpine (Monte Grappa, Col Rodella, Canazei), distanze ortodromiche note, matrici e gradiente DEM.
   - `tests/core/flyability.test.mjs`: 14 test unitari su fisica della turbolenza, termiche Deardorff, reattività a $v_{\text{trim}}$, protezione sottovento e tie-breaking a cascata.
   - Zero Faux-Testing: tutti i test validano il comportamento su valori empirici, formule indipendenti e dati meteorologici realistici.

---

## 3. Impatti & File Coinvolti
- `core/geoSpatialMath.js`: Nuovo modulo geodetico e matematico puro.
- `core/flyability.js`: Nuovo modulo headless per la valutazione della volabilità.
- `tests/core/geoSpatialMath.test.mjs`: Suite di test nativi per la geodesia.
- `tests/core/flyability.test.mjs`: Suite di test nativi per la volabilità.
- `DESIDERATA.md`: Aggiornamento dello stato dei moduli a `🟢 Completato`.
- `MEMORY.md`: Aggiunta lezioni apprese su IEEE 754 negative zero e disaccoppiamento i18n headless.
