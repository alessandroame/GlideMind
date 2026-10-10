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
+--------------------------------------------------------------------------+
|                        GlideMind Architecture                            |
+--------------------------------------------------------------------------+
|  [Headless Core] (Pure Node.js, Zero DOM)                                |
|  - core/flightProcedures.js  <-- [NUOVO] Calcolo geometrico circuiti      |
|                                  (Attacco a C, Attacco a 8, Finale,     |
|                                  Sottovento, Base, Smaltimento quota)    |
|  - core/comprensorio.js      <-- Estrazione doppio snapshot meteo        |
|                                  (Takeoff wind @ alt, Landing wind @ sfc)|
|  - core/windsock.js          <-- Cinematica e vettori manica a vento     |
+--------------------------------------------------------------------------+
                                    |
                                    v
+--------------------------------------------------------------------------+
|  [Cartography Adapter] (ui/map/mapEngineAdapter.js)                      |
|  - LeafletMapEngine:                                                     |
|    * renderComprensorioFlightMap(): viewport centrato sul binomio        |
|    * Dual Windsock Layer: takeoffMarker + landingMarker                  |
|    * Landing Circuit Layer: polilinee orientate con frecce direzionali   |
|    * Hazards & Conventions Layer: marker ostacoli e divieti              |
|    * updateFlightProcedures(): riallineamento reattivo < 50ms allo scrub  |
|  - HeadlessMockMapEngine: testabilità in Node.js al 100%                 |
+--------------------------------------------------------------------------+
                                    |
                                    v
+--------------------------------------------------------------------------+
|  [UI Shell & View] (ui/views/ForecastView.js & css/theme.css)            |
|  - Comprensorio Flight Inspector Overlay:                                |
|    * Header flottante: Comprensorio, decollo, atterraggio, close button ✕|
|    * Selettore layer basemap: Topo, Satellite, Scuro, CyclOSM            |
|    * Toggle filtri: [Circuito Atterraggio] [Maniche a Vento] [Ostacoli]  |
|    * Drawer informativo: spiegazione manovra, frequenza radio, regole    |
|    * Scrubber orario continuo (08..20) sincronizzato con lo store        |
+--------------------------------------------------------------------------+
```

---

## 3. Specifiche Tecniche di Dettaglio

### 3.1. Modulo Headless: `core/flightProcedures.js`
1. **Calcolo Orientamento Finale Controvento**:
   - Dato il vento all'atterraggio $\theta_{\text{wind}}$ (es. $160^\circ$ SSE, $14\text{ km/h}$):
     - Prua del finale (Final Leg): $\text{heading}_{\text{final}} = \theta_{\text{wind}}$.
     - Origine del finale: offset geodetico a monte dell'atterraggio lungo la congiungente $(\theta_{\text{wind}} + 180^\circ)$ a una distanza proporzionale al rateo di discesa ($\approx 150-250\text{m}$).
     - Soglia di calma anemometrica: per $v < 4\text{ km/h}$, orientamento vincolato all'asse pista convenzionale o pendenza del fondo valle.
2. **Generazione dei Bracci del Circuito Standard (Attacco a C)**:
   - **Braccio di Sottovento (Downwind)**: parallelo all'asse pista/finale, percorso in favore di vento ($\theta_{\text{wind}} + 180^\circ$), scostamento laterale $\approx 100-150\text{m}$.
   - **Braccio Base (Base)**: virata a $90^\circ$ perpendicolare al vento verso l'imbocco del finale.
   - **Virata a Mano Sinistra vs Mano Destra**: determinata in base a ostacoli noti sul terreno (es. collina, cavi, oasi) o orientamento convenzionale da `flightPlans`.
   - **Area di Smaltimento Quota**: settore di attesa/holding posizionato sul lato libero da ostacoli prima dell'inserimento in sottovento.
3. **Modalità Attacco a 8**:
   - Attivabile in caso di vento sostenuto ($> 18\text{ km/h}$) o atterraggi ristretti, dove non si effettua il sottovento per evitare di rimanere bloccati dietrovento.

### 3.2. Doppia Manica a Vento (Decollo e Atterraggio)
- In `ui/map/mapEngineAdapter.js`:
  - **Manica a Vento Decollo**: posizionata alle coordinate del decollo, con cono di esposizione pendio ($70^\circ$, azimut decollo) e cinematica calcolata sul vento alla quota di decollo.
  - **Manica a Vento Atterraggio**: posizionata alle coordinate dell'atterraggio, con indicatore di quota al suolo e cinematica basata sul vento a $10\text{m}$ (brezza di valle).
  - Entrambe le maniche a vento rispondono allo scrubbing orario con aggiornamento istantaneo dell'angolo di rotazione e del gonfiaggio dei segmenti SVG.

### 3.3. Presentazione UI: Comprensorio Flight Inspector
- Il pulsante espandi della mini-mappa (`.gm-mini-map-expand-btn`) apre l'overlay a schermo intero (`gm-flight-analysis-overlay`):
  - **Altezza dinamica**: `100dvh` su mobile per azzerare il clipping della barra indirizzi.
  - **Mappa Leaflet interattiva**: pan e pinch-to-zoom abilitati (a differenza della mini-mappa statica).
  - **Triage Rapido della Procedura**:
    - Badge sintetico: `Circuito a C (Mano Sinistra) - Finale per 160°`.
    - Spiegazione testuale: *"Vento in atterraggio da SSE a 14 km/h con raffiche a 18 km/h. Finale controvento verso Sud-Sud-Est. Smaltimento quota sul lato Ovest per evitare la linea elettrica."*
    - Scheda radio e club: frequenza (es. `144.300 MHz`), regole (es. `Piegaggio vele a bordo campo`).
  - **Scrubber Dockato in Basso**: touch-friendly ($\ge 48\text{px}$), permette al pilota di simulare il volo alle 11:00 (vento debole) e alle 15:00 (brezza formata) osservando il riallineamento automatico dei bracci del circuito.

---

## 4. Fasi Operative di Implementazione

| Fase | Attività Principali | File Coinvolti | Criterio di Accettazione |
| :--- | :--- | :--- | :--- |
| **Fase 1: Core Domain** | Implementazione modulo headless per calcolo geometrico dei circuiti di atterraggio e convenzioni | `core/flightProcedures.js`<br>`tests/core/flightProcedures.test.mjs` | Test unitari 100% verdi in Node.js puro; zero DOM; formule geodetiche WGS84 verificate |
| **Fase 2: Map Engine** | Estensione adapter cartografico con supporto doppia manica a vento, polilinee circuito dinamico e layer ostacoli | `ui/map/mapEngineAdapter.js`<br>`tests/ui/mapTakeoffSector.test.mjs` | Rendering visuale corretto sia in `LeafletMapEngine` che in `HeadlessMockMapEngine`; update reattivo < 50ms |
| **Fase 3: UI Inspector** | Costruzione overlay Analisi Volo Comprensorio in `ForecastView.js` con apertura da pulsante espandi mini-mappa | `ui/views/ForecastView.js`<br>`css/theme.css` | Apertura overlay fluida a 100dvh; controlli Fitts $\ge 48\text{px}$; chiusura pulita con ripristino focus |
| **Fase 4: Integrazione Dati** | Arricchimento dati catalogo con frequenze radio, ostacoli e `flightPlans` convenzionali | `data/locations.json`<br>`core/comprensorio.js` | Visualizzazione note di club e allerte ostacoli per i comprensori principali |
| **Fase 5: Validazione** | Esecuzione suite test completa (unitari, governance shift-left, audit visivo e mobile) | `tests/ui/forecastView.test.mjs`<br>`tests/ui/shiftLeftGovernance.test.mjs` | 400+ test verdi; zero regressioni; conformità WCAG AA e regole Laws of UX |

---

## 5. Matrice Rischi e Punti Ciechi (Critical Review)

1. **Vento Nullo o Molto Debole (< 4 km/h)**:
   - *Rischio*: In assenza di vento significativo, l'azimut anemometrico oscilla casualmente, provocando salti caotici nell'orientamento del circuito.
   - *Mitigazione*: Implementare soglia di calma: per $v < 4\text{ km/h}$, il circuito si allinea all'asse convenzionale della pista o alla pendenza naturale della valle, segnalando *"Vento debole/calma: atterraggio lungo l'asse pista predefinito"*.
2. **Inversione Brezza tra Decollo e Valle**:
   - *Rischio*: Mostrare un solo indicatore di vento induce in errore il pilota quando in decollo c'è vento meteo da Nord e a fondo valle brezza termica da Sud.
   - *Mitigazione*: La doppia manica a vento visualizza contemporaneamente le due condizioni differenti con quote esplicite (`1200m slm` vs `320m slm`).
3. **Performance e Reattività Leaflet su Mobile**:
   - *Rischio*: Ricreare l'istanza della mappa o distruggere il DOM ad ogni cambio ora causa freeze e sfarfallio.
   - *Mitigazione*: Istanza Leaflet persistente con ridisegno selettivo dei soli layer vettoriali (`updateFlightProcedures`), garantendo aggiornamenti a 60 FPS durante lo scrubbing.
