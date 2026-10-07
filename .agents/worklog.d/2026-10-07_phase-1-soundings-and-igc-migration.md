# ADR / Scheda Intervento: Fase 1 - Soundings Thermodynamics & IGC Tracklog Engine

- **Data**: 2026-10-07
- **Autore**: Alessandro Amè & Google Antigravity Agent
- **Fase**: 1 (Core Engine Migration)
- **Stato**: Consolidato

---

## 1. Contesto & Obiettivo
Prosecuzione della Fase 1 di migrazione del core headless di GlideMind secondo `MASTER_PLAN.md` e `DESIDERATA.md`. Implementazione autonoma e disaccoppiata da DOM/store di:
1. `core/soundingsMath.js`: Formule termodinamiche e aerologiche (Magnus-Tetens, LCL Cloud Base, lapse rate adiabatico, classificazione di stabilità WMO, rilevamento inversioni termiche, stima del soffitto termico / thermal top, formula barometrica ICAO).
2. `core/igcParser.js`: Parser per file di traccia conformi allo standard FAI IGC GNSS (record H e fix B), sanitizzazione coordinate geodetiche DMM, filtro spike altimetrici, trimming statico pre/post volo, associazione decolli/atterraggi da catalogo e supporto per iniezione di analizzatori cinematici.

---

## 2. Decisioni Architetturali (ADR)

1. **Termodinamica Atmosferica Pura (`core/soundingsMath.js`)**:
   - `calculateDewPoint`: implementazione basata sull'equazione di Magnus-Tetens con costanti standard WMO/Sonntag ($a = 17.27$, $b = 237.7^\circ\text{C}$), con gestione rigorosa di saturazione ($RH = 100\% \to T_d = T$) e casi limite.
   - `calculateRelativeHumidity`: inversione analitica esatta della pressione di vapore saturo per recuperare l'umidità relativa a partire da $T$ e $T_d$.
   - `calculateLCL` & `calculateCloudBase`: calcolo della base cumulo (Lifted Condensation Level) secondo la formula empirica di Esposito-Hennig ($125\text{ m}/^\circ\text{C}$ di spread $T - T_d$), restituendo quote AGL e MSL.
   - `calculateLapseRate` & `classifyAtmosphericStability`: calcolo del gradiente termico verticale ($\Delta T / \Delta z$) e dell'environmental lapse rate $\Gamma$ ($^\circ\text{C}/100\text{m}$), con classificazione aeronautica conforme (`SUPER_ADIABATIC`, `DRY_ADIABATIC`, `CONDITIONALLY_UNSTABLE`, `STABLE`, `ISOTHERMAL`, `INVERSION`).
   - `calculateBarometricAltitude` & `calculatePressureAtAltitude`: modello ipsometrico ICAO per standard atmosphere troposferico ($0-11000\text{m}$), per stimare geopotenziali di livelli di pressione Open-Meteo mancanti.
   - `detectInversions`: scansione automatizzata del profilo per individuare strati di inversione termica ($dT/dz > 0$) con calcolo di spessore, gradiente e delta termico.
   - `estimateThermalCeiling`: simulazione termodinamica della risalita di una bolla d'aria dal suolo (raffreddamento adiabatico secco $1.0^\circ\text{C}/100\text{m}$ fino a LCL, poi adiabatico saturo $0.5^\circ\text{C}/100\text{m}$ sopra LCL), determinando il punto di equilibrio con il profilo ambientale e rilevando l'eventuale blocco da inversione.
   - `enrichSoundingProfile`: pipeline unificata di arricchimento dati orari per il rendering del diagramma Skew-T / radiosondaggio.

2. **Parser IGC Headless (`core/igcParser.js`)**:
   - Disaccoppiamento da `store.js` e DOM: rimosso l'import diretto dello store UI; le preferenze su ala (`activeGlider`, `useActiveGlider`) vengono iniettate tramite parametro `options`.
   - Disaccoppiamento da `flightTelemetryAnalyzer.js`: la funzione `parseIgc` fornisce una telemetria di base calcolata nativamente (distanza cumulativa, guadagno cumulato, picchi variometrici, min/max quota, velocità istantanee), consentendo l'iniezione pluggable di analizzatori avanzati di termiche/manovre (`options.telemetryAnalyzer`).
   - Filtro anti-spike variometrico: i salti di quota anomali da errore GNSS con velocità verticale istantanea $> 25\text{ m/s}$ vengono bloccati e linearizzati entro i limiti fisici massimi del volo libero ($\pm 18\text{ m/s}$).
   - `trimFlightGroundPoints`: algoritmo di filtraggio euristico per scartare i punti di attesa sul decollo e di piegatura all'atterraggio preservando i 2 punti di rincorsa/gonfiaggio e i 2 punti di smaltimento/flare.
   - `matchTrackSpots`: matching spaziale ad alta precisione entro $500\text{m}$ con il catalogo dei decolli e atterraggi, con generazione automatica del titolo della rotta (`Decollo -> Atterraggio`).

3. **Suite di Test Automatizzati (`tests/core/`)**:
   - `tests/core/soundingsMath.test.mjs`: 31 asserzioni unitarie su formule termodinamiche, inversione RH, LCL, gradienti, calibrazione barometrica e simulazione d'ascesa termica.
   - `tests/core/igcParser.test.mjs`: 22 asserzioni unitarie su coordinate DMM, distanze ortodromiche, matching decollo/atterraggio, trimming stazionario, parsing traccia sintetica con spike e test end-to-end su traccia IGC reale registrata in volo da Alessandro Amè a Ciavanis (`2026-07-04-XNA-0DC50E28ACAD23496445DB92F084AB1C-02.igc`).

---

## 3. Impatti & File Coinvolti
- `core/soundingsMath.js`: Nuovo modulo di termodinamica atmosferica.
- `core/igcParser.js`: Nuovo modulo di parsing e cinematica IGC.
- `tests/core/soundingsMath.test.mjs`: Test unitari per il modulo termodinamico.
- `tests/core/igcParser.test.mjs`: Test unitari per il parser IGC.
- `DESIDERATA.md`: Allineamento stato `soundingsMath.js` e `igcParser.js` a `🟢 Completato`.
- `WORKLOG.md`: Consolidamento delle schede di intervento.
- `MEMORY.md`: Aggiunta vincoli appresi su clamping fisico IGC e disaccoppiamento store/telemetry.
