# Piano Architetturale: Finestre di Volo Operative (Flight Windows) & Imposizione Decollo

Questo documento definisce le specifiche e il piano esecutivo per l'evoluzione della vista Previsioni (`ForecastView.js`) in relazione a:
1. Imposizione del decollo via selezione manuale dell'utente (`activeTakeoffId`).
2. Generazione headless di finestre temporali operative e narrazione della giornata (`core/flightWindows.js`).

---

## 1. Obiettivi e Principi Guida

1. **Rispetto dell'Intento Utente (No Silent Override)**:
   - Se l'utente seleziona manualmente un decollo dal picker o dallo switcher (`activeTakeoffId`), il sistema valuta rigidamente la giornata per quel decollo.
   - Se in determinate ore quel decollo risulta non volabile o critico, il sistema ne dichiara la severità senza forzare un cambio decollo, ma fornisce un avviso consultivo se altri decolli del comprensorio risultano invece praticabili.
2. **Modalità Automatica Predefinita in Overview**:
   - In assenza di imposizione (`activeTakeoffId == null` o `selectedSubSpot == 'overview'`), il sistema applica il principio del **Binomio Dinamico ($T_{\text{best}} + L_{\text{safe}}$)**: per ogni ora individua il miglior decollo disponibile e lo accoppia all'atterraggio sicuro.
3. **Chunking e Comprensione Immediata (Laws of UX & Novice Pilot Spec)**:
   - Superare la frammentazione oraria isolata: raggruppare le ore diurne (alba-tramonto) in 3-4 **Finestre di Volo Operative**.
   - Spiegare in italiano aeronautico chiaro cosa è consentito e cosa monitorare (vento in decollo, attività termica, brezza di valle in atterraggio).
   - Collegamento interattivo 1-tap tra le card delle finestre e lo scrubber orario inferiore.

---

## 2. Architettura dei Componenti

### Modulo Headless: `core/flightWindows.js`
- **Purezza**: zero dipendenze DOM, 100% testabile in Node.js.
- **Funzione Principale**: `calculateFlightWindows({ comprensorio, weatherData, targetDate, glider, forcedTakeoffId, forcedLandingId })`
- **Output**: Array di oggetti finestra oraria:
  ```typescript
  interface FlightWindow {
    id: string;
    timeRange: string;         // es. "09:00 - 11:30"
    startHour: number;          // 9
    endHour: number;            // 11
    status: 'flyable' | 'caution' | 'unflyable';
    takeoff: object;            // Decollo attivo
    landing: object;            // Atterraggio sicuro
    title: string;              // es. "Volo Calmo & Didattico"
    description: string;        // Spiegazione operativa
    hazards: string[];          // Eventuali criticità rilevate
    isForcedTakeoff: boolean;   // True se imposto dall'utente
    alternativeTakeoff: object | null; // Alternativa se il decollo imposto è critico
  }
  ```

### Integrazione UI: `ui/views/ForecastView.js`
- **Sezione "Evoluzione Giornaliera"**:
  - Montata nella modalità Overview sopra l'accordion dei dettagli.
  - Carosello o lista verticale compatta con card a touch target >= 48px.
  - Evento `data-action="select-window"`: al tocco sincronizza `selectedHour` a `startHour` e aggiorna in-place scrubber, card binomio, grafici e mini-mappa.
- **Badge di Testata**:
  - Distinzione tra `"Panoramica Comprensorio (Decollo Ottimale)"` e `"[Nome Decollo] (Imposto)"` con chip di sblocco rapido.

---

## 3. Piano di Lavoro in 4 Step

- [ ] **Step 1: Modulo Headless `core/flightWindows.js` e Test Node.js**
- [ ] **Step 2: Consolidamento Imposizione Decollo nel Core e Store**
- [ ] **Step 3: Rendering e Interattività 1-Tap in `ForecastView.js`**
- [ ] **Step 4: Shift-Left Governance e Test Regressione**
