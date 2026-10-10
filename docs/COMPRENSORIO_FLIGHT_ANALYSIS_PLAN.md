# Piano Architetturale: Analisi Volo Comprensorio & Procedure nella Vista Previsioni

## 1. Obiettivo e Visione Operativa

Riorientare la funzionalità di ingrandimento della mappa nella vista **Previsioni** (`ForecastView.js`):
- **Cosa NON deve fare**: Non deve reindirizzare alla mappa globale/regionale di tutti i comprensori (`SpotMapView.js`), disperdendo l'attenzione del pilota e azzerando il contesto delle previsioni orarie.
- **Cosa DEVE fare**: Aprire un modulo dedicato di **Analisi Volo Comprensorio** ad alta risoluzione (overlay a schermo intero `100dvh`), focalizzato esclusivamente sul binomio Decollo-Atterraggio attivo, dotato di:
  1. **Doppia Manica a Vento Vettoriale**: una sul decollo (vento alla quota di lancio) e una sull'atterraggio (vento al suolo a fondo valle).
  2. **Procedure di Volo & Circuito di Atterraggio Dinamico**: generazione geometrica automatica del circuito standard (**Attacco a C** o **Attacco a 8**) orientato rigorosamente controvento in funzione dell'ora selezionata, con evidenza di sottovento, base, finale e area di smaltimento quota.
  3. **Convenzioni Locali & Ostacoli Aeronautici**: visualizzazione dei sentieri di planata, cavi/elettrodotti, rotori di brezza, frequenze radio di club e regole di atterraggio desunte dal catalogo (`locations.json`).
  4. **Scrubber Orario Sincronizzato**: controllo temporale interattivo (08:00–20:00) per visualizzare in tempo reale l'evoluzione delle brezze, la rotazione delle maniche a vento e il riallineamento del circuito di atterraggio.

---

## 2. Architettura dei Componenti

```
+-----------------------------------------------------------------------------------+
|                            GlideMind Architecture                                 |
+-----------------------------------------------------------------------------------+
|  [Headless Core] (Pure Node.js, Zero DOM)                                         |
|  - core/geoSpatialMath.js    <-- [ESTENSIONE] calculateDestinationPoint() WGS84   |
|  - core/flightProcedures.js  <-- [NUOVO] Calcolo geometrico dinamico circuiti     |
|                                  (Attacco a C, Attacco a 8, Finale proporzionale, |
|                                  Sottovento, Base, Smaltimento quota, Guardrail)  |
|  - core/comprensorio.js      <-- Estrazione doppio snapshot meteo e propagazione  |
|                                  sanificata flightPlans in normalizeCatalog()     |
|  - core/windsock.js          <-- Cinematica e vettori manica a vento              |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|  [Cartography Adapter] (ui/map/mapEngineAdapter.js)                               |
|  - LeafletMapEngine:                                                              |
|    * renderComprensorioFlightMap(): viewport centrato sul binomio attivo          |
|    * Dual Windsock Layer: takeoffMarker + landingMarker                           |
|    * Landing Circuit Layer: polilinee a doppio tracciato (casing + core)          |
|    * Hazards & Conventions Layer: marker ostacoli e divieti                       |
|    * updateFlightProcedures(): riallineamento reattivo in-place < 50ms allo scrub |
|    * lifecycle pause/resume: congelamento mini-mappa sottostante durante overlay  |
|  - HeadlessMockMapEngine: testabilità in Node.js al 100% (zero dipendenze DOM)    |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|  [UI Shell & View] (ui/views/ForecastView.js & css/theme.css)                     |
|  - Comprensorio Flight Inspector Overlay:                                         |
|    * Viewport dinamico 100dvh fisso (z-index: 1050), body scroll lock             |
|    * Header flottante: Comprensorio, decollo, atterraggio, close button ✕ (>=48px)|
|    * Selettore layer basemap: Topo, Satellite, Scuro, CyclOSM                     |
|    * Toggle filtri: [Circuito Atterraggio] [Maniche a Vento] [Ostacoli]           |
|    * Drawer informativo / banner di sicurezza: triage manovra, allerta EN-A      |
|    * Scrubber orario dockato in basso (Thumb Zone) senza numeri nudi              |
|    * Gestione accessibilità modale: focus trap, tasto ESC e popstate back gestuale|
+-----------------------------------------------------------------------------------+
```

---

## 3. Specifiche Tecniche di Dettaglio

### 3.1. Modulo Headless: `core/geoSpatialMath.js` & `core/flightProcedures.js`

1. **Primitiva Geodetica Diretta (`core/geoSpatialMath.js`)**:
   - Implementazione di `calculateDestinationPoint(origin, distanceMeters, bearingDegrees)` per proiezione piana ad alta precisione su scale locali ($d < 5000\text{m}$, errore $< 0.01\text{m}$):
     $$\Delta y = d \cdot \cos\theta, \quad \Delta x = d \cdot \sin\theta$$
     $$\phi_2 = \phi_1 + \frac{\Delta y}{R} \cdot \frac{180}{\pi}, \quad \lambda_2 = \lambda_1 + \frac{\Delta x}{R \cdot \cos\phi_1} \cdot \frac{180}{\pi}$$
     con $R = 6371000\text{ m}$.

2. **Calcolo Orientamento e Lunghezza Dinamica del Finale**:
   - Dato il vento all'atterraggio $\theta_{\text{wind}}$ (es. $160^\circ$ SSE, $14\text{ km/h}$):
     - Prua del finale (Final Leg): $\text{heading}_{\text{final}} = \theta_{\text{wind}}$ (volo prua a monte controvento).
     - Origine del finale: offset geodetico a monte dell'atterraggio lungo la congiungente $(\theta_{\text{wind}} + 180^\circ)$.
     - **Distanza dinamica del finale** scalata sulla ground speed aerodinamica:
       $$D_{\text{final}} = H_{\text{final}} \cdot \frac{v_{\text{trim}} - v_{\text{wind}}}{v_z}$$
       con $H_{\text{final}} \approx 25 - 30\text{m}$ AGL, $v_z \approx 1.2\text{ m/s}$ e clamping fisico tra $80\text{m}$ (vento sostenuto) e $250\text{m}$ (vento debole).
   - **Soglia di Calma Anemometrica ($v < 4\text{ km/h}$)**:
     - Catena di fallback deterministica per evitare oscillazioni caotiche o valori non definiti:
       1. `landing.runwayHeading` (asse pista convenzionale se presente a catalogo).
       2. `flightPlans[0].heading` (orientamento preferenziale da note di club).
       3. `computeBearing(takeoff.coordinates, landing.coordinates)` (direzione naturale di arrivo dal decollo lungo la valle).
       4. Fallback standard a Sud ($180^\circ$) con indicazione esplicita: *"Calma anemometrica: atterraggio lungo l'asse convenzionale"*.

3. **Generazione dei Bracci del Circuito Standard (Attacco a C)**:
   - **Braccio di Sottovento (Downwind)**: parallelo all'asse pista/finale, percorso in favore di vento $(\theta_{\text{wind}} + 180^\circ)$, con scostamento laterale di sicurezza $\approx 100 - 150\text{m}$.
   - **Braccio Base (Base)**: virata a $90^\circ$ perpendicolare al vento verso l'imbocco del finale.
   - **Determinazione Mano Sinistra vs Mano Destra**:
     1. Priorità a convenzioni locali esplicite: `flightPlans[].circuitHand` (`'left'` o `'right'`).
     2. In assenza di specifica di club: posizionamento del sottovento sul lato della valle aperta rispetto all'azimut decollo-atterraggio $\beta = \text{computeBearing}(takeoff, landing)$, allontanando la virata dal costone montuoso per prevenire rotori orografici.
   - **Area di Smaltimento Quota (Holding Sector)**: settore semicircolare o ellissoidale posizionato lateralmente rispetto alla testata pista sopravvento, a quota $100 - 150\text{m}$ AGL.

4. **Safety Gate per Vento Sostenuto (> 18 km/h) & Attacco a 8**:
   - Conforme a `novice_pilot_spec.md`: per $v_{\text{landing}} > 18\text{ km/h}$, le condizioni al suolo superano il 50% della $v_{\text{trim}}$ di una vela EN-A ($\approx 36\text{ km/h}$), configurando **Soglia Pericolo (🔴 Rosso / NO FLY)**.
   - L'attivazione geometrica dell'Attacco a 8 non deve apparire come una manovra ordinaria:
     - Restituisce `isSafetyWarning: true` e `warningSeverity: 'severe'`.
     - L'interfaccia visualizza un banner avionico: *"Attenzione: Vento a terra > 18 km/h. Condizioni fuori inviluppo per vele base (EN-A). Rischio arretramento e gradiente ripido."*

5. **Firma Funzionale di `core/flightProcedures.js`**:
   ```javascript
   export function calculateLandingCircuit({
     landingCoordinates,
     takeoffCoordinates,
     windSpeedKmh,
     windDirectionDeg,
     flightPlan = null,
     glider = DEFAULT_GLIDER
   })
   ```

---

### 3.2. Cartografia & Adapter Pattern (`ui/map/mapEngineAdapter.js`)

1. **Doppia Manica a Vento (Decollo e Atterraggio)**:
   - **Manica Decollo**: coordinate decollo, cono di esposizione pendio ($70^\circ$, azimut decollo), cinematica calcolata sul vento alla quota di lancio.
   - **Manica Atterraggio**: coordinate atterraggio, indicatore di quota fondo valle, cinematica basata sul vento al suolo ($10\text{m}$).
   - Aggiornamento sincronizzato durante lo scrubbing con rotazione e gonfiaggio dei segmenti SVG.

2. **Tecnica a Doppio Tracciato Vettoriale (Casing & Core)**:
   - Per garantire conformità WCAG 2.1 AA ($\ge 4.5:1$) sia su sfondi chiari (OpenTopo, CyclOSM) sia su immagini aeree ad alto contrasto (Satellite) o mappe scure (Dark Gray Canvas):
     - **Casing esterno**: larghezza $6\text{px}$, opacità $0.85$, colore nero `#000000` (su mappe chiare e satellitari) o bianco `#ffffff` (su mappa scura).
     - **Core interno**: larghezza $3\text{px}$, codice colore avionico:
       - Finale: `#15803d` (Verde atterraggio).
       - Base: `#2563eb` (Blu virata).
       - Sottovento: `#b45309` (Ambra posizionamento).
       - Smaltimento quota: `#6366f1` (Indaco holding tratteggiato).

3. **Ciclo di Vita e Sospensione Mini-Mappa di Sfondo**:
   - All'apertura dell'overlay, sospendere i cicli animati della mini-mappa sottostante (`miniMapEngine.pause()`) per eliminare la contesa di risorse GPU/CPU.
   - Alla chiusura dell'overlay, distruggere l'istanza `flightAnalysisMapEngine` e ripristinare il loop della mini-mappa.
   - Aggiornamento in-place dei layer vettoriali (`updateFlightProcedures`) con latenza $< 5\text{ms}$ durante lo scrubbing orario senza distruggere né ricreare l'istanza Leaflet.

4. **Supporto HeadlessMockMapEngine**:
   - Interfacce mock implementate al 100% in memoria per garantire test Node.js deterministici a 0ms:
     - `renderComprensorioFlightMap(containerEl, data, options)`
     - `updateFlightProcedures(circuitData)`
     - Ispezione array `renderedCircuitPolylines: []`.

---

### 3.3. Presentazione UI: Comprensorio Flight Inspector

1. **Specifiche di Montaggio e Z-Index**:
   - Container `.gm-flight-analysis-overlay`:
     - `position: fixed; inset: 0; width: 100%; height: 100dvh; z-index: 1050; background: var(--gm-bg-base);`
     - Sovrasta completamente la barra fissa `#bottom-nav-bar` (`z-index: 100`) e il contenitore `#sheet-container` (`z-index: 1000`).
     - All'apertura: impostare `document.body.style.overflow = 'hidden'`.
     - Alla chiusura: ripristinare `document.body.style.overflow = ''`.

2. **Accessibilità Modale e Navigazione Gestuale**:
   - Attributi ARIA: `role="dialog"`, `aria-modal="true"`, `aria-label="Analisi Volo e Procedure Comprensorio"`.
   - **Focus Management**: focus automatico sul pulsante di chiusura `✕` all'apertura; ripristino del focus su `.gm-mini-map-expand-btn` alla chiusura.
   - **Gestione Chiusura**:
     - Tap su pulsante `✕` (`min-width: 48px; min-height: 48px;`).
     - Pressione tasto `Escape` sulla tastiera.
     - Navigazione indietro: `history.pushState({ overlay: 'flight-analysis' }, '')` all'apertura, intercettazione evento `popstate` per chiudere l'overlay senza uscire dall'applicazione.

3. **Drawer Informativo & Scrubber Orario**:
   - **Header Flottante**: nome comprensorio, decollo attivo, atterraggio principale, pulsante chiusura.
   - **Pannello Procedura**:
     - Badge di sintesi: `Circuito a C (Mano Sinistra) - Finale per 160°`.
     - Spiegazione testuale fenomenologica conforme a `novice_pilot_spec.md`.
     - Banner di allerta se $v > 18\text{ km/h}$.
     - Frequenza radio di club e regole di atterraggio.
   - **Scrubber Dockato in Basso**: collocato nella Thumb Zone, touch target slot $\ge 48\text{px}$, progressive disclosure (assenza di numeri nudi, conformità Gate 3).

---

## 4. Fasi Operative di Implementazione

| Fase | Attività Principali | File Coinvolti | Criterio di Accettazione |
| :--- | :--- | :--- | :--- |
| **Fase 1: Geodesia & Core Domain** | 1. Aggiunta `calculateDestinationPoint` in `geoSpatialMath.js`.<br>2. Propagazione `flightPlans` sanificati in `normalizeComprensorioCatalog` in `comprensorio.js`.<br>3. Modulo `core/flightProcedures.js` con calcolo finale dinamico, fallback calma e guardrail EN-A.<br>4. Test unitari in Node.js puro. | `core/geoSpatialMath.js`<br>`core/comprensorio.js`<br>`core/flightProcedures.js`<br>`tests/core/flightProcedures.test.mjs`<br>`tests/core/geoSpatialMath.test.mjs` | Test unitari 100% verdi in Node.js puro; zero DOM; formule geodetiche WGS84 verificate; conformità Gate 1 e Gate 2. |
| **Fase 2: Cartography Adapter** | 1. Estensione `LeafletMapEngine` con supporto doppia manica a vento, polilinee circuito a doppio tracciato (casing/core) e ciclo di vita pause/resume.<br>2. Implementazione metodi corrispondenti in `HeadlessMockMapEngine`. | `ui/map/mapEngineAdapter.js`<br>`tests/ui/mapTakeoffSector.test.mjs` | Rendering visuale corretto sia in `LeafletMapEngine` che in `HeadlessMockMapEngine`; aggiornamento in-place < 50ms allo scrub; contrasto WCAG AA verificato. |
| **Fase 3: UI Inspector Overlay** | 1. Sostituzione azione `open-full-map` in `ForecastView.js` con apertura overlay `100dvh` (`z-index: 1050`).<br>2. Stili responsive e touch floor $\ge 48\text{px}$ in `theme.css`.<br>3. Focus trap, chiusura ESC e integrazione `popstate`.<br>4. Scrubber dockato sincronizzato con lo store. | `ui/views/ForecastView.js`<br>`css/theme.css`<br>`tests/ui/forecastView.test.mjs` | Apertura overlay fluida a 100dvh; controlli Fitts $\ge 48\text{px}$; chiusura pulita con ripristino focus; zero scroll bleeding. |
| **Fase 4: Integrazione Dati** | Verifica catalogo comprensori, frequenze radio, ostacoli e `flightPlans` convenzionali. | `data/locations.json`<br>`core/comprensorio.js` | Visualizzazione note di club e allerte ostacoli sanificate per i comprensori censiti. |
| **Fase 5: Validazione & Shift-Left** | Esecuzione suite test completa (unitari, governance shift-left, audit visivo mobile). | `tests/ui/shiftLeftGovernance.test.mjs`<br>`tests/ui/forecastView.test.mjs` | 400+ test verdi; zero regressioni; conformità WCAG AA e regole Laws of UX; assenza token DOM nel core. |

---

## 5. Matrice Rischi e Punti Ciechi (Critical Review)

1. **Vento Nullo o Calma Anemometrica (< 4 km/h)**:
   - *Rischio*: In assenza di vento significativo, l'azimut anemometrico oscilla casualmente, provocando salti caotici nell'orientamento del circuito.
   - *Mitigazione*: Implementare la catena di fallback a 4 livelli (runwayHeading $\to$ flightPlans $\to$ bearing decollo-atterraggio $\to$ asse standard Sud), segnalando *"Calma anemometrica: atterraggio lungo l'asse pista predefinito"*.
2. **Inversione Brezza tra Decollo e Valle**:
   - *Rischio*: Mostrare un solo indicatore di vento induce in errore il pilota quando in decollo c'è vento meteo da Nord e a fondo valle brezza termica da Sud.
   - *Mitigazione*: La doppia manica a vento visualizza contemporaneamente le due condizioni differenti con quote esplicite (`1200m slm` vs `320m slm`).
3. **Falsa Sicurezza per Vento Forte (> 18 km/h) con Vele EN-A**:
   - *Rischio*: Mostrare un "Attacco a 8" senza allarmi induce allievi o neo-brevettati a ritenere sicura una condizione con vento superiore al 50% della trim speed dell'ala.
   - *Mitigazione*: Attivazione obbligatoria dello stato semantico di pericolo con banner avionico esplicito sul rischio arretramento e gradiente anemometrico.
4. **Lunghezza Statica del Finale vs Vento Variabile**:
   - *Rischio*: Tracciare un finale a distanza fissa ($200\text{m}$) con vento forte provoca l'illusione di una planata lunga, causando atterraggi corti (undershoot).
   - *Mitigazione*: Calcolo dinamico della lunghezza $D_{\text{final}}$ in funzione della ground speed residua ($v_{\text{trim}} - v_{\text{wind}}$).
5. **Leggibilità Polilinee su Mappe Eterogenee (WCAG AA)**:
   - *Rischio*: Tracciati monocolore sottili sbiadiscono su sfondi chiari OpenTopo o si confondono con texture fotografiche satellitari.
   - *Mitigazione*: Tecnica del doppio tracciato (casing a contrasto $6\text{px}$ + core semantico colorato $3\text{px}$).
6. **Contesa di Risorse Mini-Mappa vs Overlay**:
   - *Rischio*: Due istanze Leaflet con loop di animazione SVG attivi raddoppiano il carico CPU/GPU su smartphone.
   - *Mitigazione*: Sospensione esplicita (`pause()`) dell'istanza mini-mappa sottostante durante l'apertura dell'overlay a schermo intero.
7. **Trappola di Navigazione Mobile (Back Button)**:
   - *Rischio*: L'utente preme il tasto indietro nativo dello smartphone aspettandosi di chiudere l'overlay, ma il browser esce dall'applicazione.
   - *Mitigazione*: Inserimento stato in `history.pushState` e intercettazione `popstate` per chiudere l'overlay in modo trasparente.
