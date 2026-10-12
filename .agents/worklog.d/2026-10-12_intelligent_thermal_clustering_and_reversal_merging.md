# ADR / Worklog: Riconoscimento Intelligente delle Termiche con Clustering Spaziale, Tolleranza Inversioni di Virata ("Entro ed Esco") ed Estensione Salita

**Data**: 2026-10-12  
**Autore**: Antigravity  
**Ambito**: Core / Telemetria di Volo / `flightManeuvers.js` / Logbook / UI Dettaglio Volo

---

## 1. Contesto e Problema Riscontrato
Dall'analisi del volo reale #93 ("Decollo Ciavanis -> PeterPan school / Baratonga", 2026-10-11, traccia `fl_igc_1791720574230_52wdks0_30264`, quota max 2006m) e dalla segnalazione visiva dell'utente:
1. **Frammentazione Artificiale per Inversione di Senso di Virata**:
   - In salita da 1765m a 2005m (+240m di guadagno netto su 3m 39s), il pilota ha iniziato a termicare virando a sinistra (CCW), poi a 13:08:09 (1882m) ha invertito la rotazione a destra (CW) per centrare meglio il nucleo termico.
   - Il rilevatore `detectThermals` scartava categoricamente il merge dei blocchi a causa del vincolo rigido `cand.turnDir === curBlock.turnDir`, spezzando la salita in due micro-termiche artificiali separate (T1 da +101m e T2 da +31m con 0s di gap e 0m di discesa).
2. **Cancellazione delle Virate Alternate in Salita (Soaring / Manovre a S)**:
   - Tra 1913m e 2005m (+92m guadagnati a +1.7..+4.3 m/s), il pilota non ha descritto cerchi continui a $360^\circ$ ma virate alternate contro il costone/nucleo (800° di rotazione complessiva a $\ge 2.5^\circ$/s con rotazione netta -3°).
   - L'accumulatore classico di cerchi a direzione fissa si resettava continuamente ad ogni inversione di rotta, scartando del tutto gli ultimi 92m di salita.
3. **Mancato Riconoscimento Uscita e Rientro nel Nucleo ("Entro ed Esco")**:
   - I piloti reali spesso allargano la spirale, escono momentaneamente dalla termica per 15-40s perdendo pochi metri, esplorano nei paraggi (entro 150-250m) e rientrano nel lift.
   - La logica di merge precedente imponeva una soglia strettissima (`gapSec <= 12`, `altDrop <= 8`) priva di calcolo di prossimità geografica/spaziale.
4. **Disallineamento della Cache Telemetrica nei Voli Esistenti**:
   - I voli già salvati nel database IndexedDB mantenevano la vecchia telemetria serializzata con `engineVersion` antecedente, non riflettendo le migliorie algoritmiche all'apertura della scheda di dettaglio.

---

## 2. Decisione Architetturale e Design

1. **Step 2B: Rilevamento Fasi di Manovra Attiva in Lift (`type: 'soaring_turn'`)**:
   - Oltre ai cerchi chiusi a direzione singola ($360^\circ$), viene analizzata la presenza di manovre attive in portanza: finestre in cui il pilota manovra attivamente ($|\omega| \ge 2.5^\circ/\text{s}$), mantiene variometro positivo ($v_z \ge -0.2\text{ m/s}$), accumula almeno $220^\circ$ di rotazione combinata e realizza un guadagno $\ge 8\text{m}$ con rateo $\ge 0.15\text{ m/s}$.
2. **Step 3: Forward Climb Extension (Estensione Naturale al Culmine di Salita)**:
   - I candidati vengono estesi in avanti fino al raggiungimento del picco effettivo di quota prima della transizione a planata o discendenza, catturando gli ultimi metri di risalita nel nucleo.
3. **Step 4: Clustering Spaziale Invariante rispetto al Senso di Virata**:
   - Il merge non esige più `cand.turnDir === curBlock.turnDir`.
   - Calcolo del centroide geografico del nucleo (`computeSliceCenter`) e della distanza orizzontale in metri:
     - Merge immediato: gap $\le 15\text{s}$, perdita quota $\le 15\text{m}$, distanza centro $\le 300\text{m}$.
     - Ricerca media: gap $\le 45\text{s}$, perdita quota $\le 22\text{m}$, distanza centro $\le 250\text{m}$.
     - Uscita/rientro ampio: gap $\le 60\text{s}$, perdita quota $\le 25\text{m}$, distanza centro $\le 140\text{m}$.
   - Se la termica unificata include virate sia orarie che antiorarie, la direzione viene classificata in base al rapporto degli angoli: dominante 'CW', dominante 'CCW', oppure 'CW/CCW' (Misto) se equilibrata.
4. **UI: Formattazione Turn Direction Mista**:
   - In `FlightDetailSheet.js`, la direzione `turnDir === 'CW/CCW'` viene visualizzata chiaramente all'utente come `"Misto"`.
5. **Auto-Upgrade Telemetria nei Voli Esistenti (Engine Versioning)**:
   - Incrementato `CURRENT_TELEMETRY_ENGINE_VERSION` da 8 a 9 in `core/flightTelemetry.js`.
   - In `core/logbookDb.js` (`getFlightDetail`), se un volo memorizzato possiede `telemetry.engineVersion < 9`, viene ri-analizzato istantaneamente al volo e salvato in background nell'adapter senza bloccare l'interfaccia utente.

---

## 3. Risultati e Verifica

- **Volo Reale #93 (Decollo Ciavanis, 2026-10-11)**:
  - *Prima*: 6 termiche frammentate. T1 (13:07:18 - 13:08:09, +101m CCW), T2 (13:08:09 - 13:08:35, +31m CW), e perdita completa della salita 1913m -> 2005m.
  - *Dopo*: 3 termiche rilevate. La termica principale T#1 copre interamente l'arco **13:05:50 -> 13:09:29 (3m 39s), quota 1765m -> 2005m (+240m di guadagno netto, 13.2 giri, senso Misto CW/CCW, media +1.1 m/s, picco +4.3 m/s)**. Coincide esattamente con il rettangolo rosso dell'utente.
- **Test Automatizzati**:
  - Aggiunti 2 test unitari dedicati in `tests/core/flightManeuvers.test.mjs`:
    - `should merge thermal fragments across turn direction reversals (CW to CCW)`
    - `should recognize and merge thermal when pilot exits and re-enters the core ("entro ed esco")`
  - Tutti i 713 test eseguiti (124 suite) risultano al 100% conformi e verdi.
