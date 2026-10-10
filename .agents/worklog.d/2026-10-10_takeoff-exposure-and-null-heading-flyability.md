# Scheda Intervento: Calcolo Volabilità su Esposizione Decollo e Gestione Heading Null

- **Data**: 2026-10-10
- **Autore**: Antigravity (Pair Programming con Utente)
- **Tipo**: Bugfix / Algoritmo Aeronautico / Armonizzazione UI Core
- **File Coinvolti**:
  - `core/flyability.js`
  - `core/openMeteoApi.js`
  - `core/comprensorio.js`
  - `ui/views/ForecastView.js`
  - `ui/views/HomeDashboardView.js`
  - `ui/map/mapEngineAdapter.js`
  - `tests/core/flyability.test.mjs`
  - `tests/core/comprensorio.test.mjs`
  - `tests/ui/forecastView.test.mjs`

---

## 1. Contesto & Diagnosi

L'utente ha segnalato un'anomalia nel calcolo della volabilità rispetto all'esposizione del pendio:
> "nel calcolo della volabilita sembra non vega presa in considerazione l'esposizione del decollo correggi l'algoritmo considerano considerando che non tutti gli spot hanno l'esposizione."

Dallo screenshot fornito dall'utente (Decollo Ciavanis, quota 1780m, ore 08:00, azimut pendio 180° S, vento stimato 2 km/h da Est 101°), è emersa una discrepanza tra la scheda analitica dei parametri e la timeline in fondo:
1. Nella scheda parametri, "Vento in Decollo" mostrava un pallino rosso con etichetta "Non Favorevole" e consiglio che avvertiva di decollo sconsigliato a causa dello scostamento angolare ($\Delta\theta = 79^\circ$).
2. Nella timeline oraria in basso, lo slot delle 08:00 era verde "Volabile", coerentemente con l'algoritmo del comprensorio che valutava l'intensità di 2 km/h come brezza trascurabile.
3. Inoltre, per i decolli con orientamento non censito nel catalogo (`heading == null` o `undefined`), diversi componenti dell'applicazione ricorrevano a fallback forzati come `heading || 180` o `heading ?? 0`, generando azimut fittizi a Sud o a Nord, settori cartografici fittizi e false affermazioni di allineamento/sottovento.

---

## 2. Interventi Eseguiti

### 2.1 Core Headless: `core/flyability.js` & `core/comprensorio.js`
1. **Dizionario Interno Headless**: Aggiunta della chiave `'fly.exposure_unknown': 'Esposizione N/D'` per garantire traduzioni autonome senza dipendenze DOM.
2. **Valutazione Direzionale Reale (`evaluateDirectionFlyability`)**:
   - Se `takeoffAzimuth == null` o decollo assente, restituisce immediatamente `null`.
   - Se il vento è calmo ($\le 4\text{ km/h}$): se $\Delta\theta \le 90^\circ$ viene valutato verde `flyable` ("Vento Calmo"); se $\Delta\theta > 90^\circ$ viene valutato giallo `caution` ("Brezza da Dietro").
   - Se il vento è attivo ($> 4\text{ km/h}$):
     - $\Delta\theta \le 35^\circ \implies$ Verde `flyable`
     - $35^\circ < \Delta\theta \le 60^\circ \implies$ Giallo `caution` ("Vento al Traverso")
     - $60^\circ < \Delta\theta \le 90^\circ \implies$ Giallo `caution` se $v \le 14\text{ km/h}$, Rosso `unflyable` ("Traverso Marcato") se $v > 14\text{ km/h}$
     - $\Delta\theta > 90^\circ \implies$ Rosso `unflyable` se $v \le 18\text{ km/h}$, Nero `severe` ("NO FLY: Sottovento Sostenuto") se $v > 18\text{ km/h}$.
3. **Punteggio Volabilità Oraria (`getFlyabilityScore`)**:
   - Se `evaluateDirectionFlyability` restituisce `null` (decollo senza esposizione), popola `details.direction` con `hasExposure: false`, `severity: 0` e `text: 'Esposizione N/D'`, impedendo penalizzazioni arbitrarie. La volabilità complessiva dello slot dipende unicamente da velocità, raffiche e limiti della vela.
4. **Preservazione nei Riassunti**: In `calculateWeekOverview` e `calculateDailyFlyabilitySummary`, rimossi i fallback `|| 0` o `|| 180`, preservando il valore originario o `null`.
5. **Indicatori Comprensorio (`core/comprensorio.js`)**:
   - `indicators.direction` restituisce `hasExposure: selectedTakeoff?.heading != null`, `label: 'Esposiz. N/D'`, `diffDegrees: null` e `severity: 0` quando l'heading non è presente.
   - La motivazione (`reason`) dichiara con trasparenza: `Vento X km/h da Y° • Esposizione N/D`. Con brezza debole, evidenzia: `Brezza debole / vento calmo`.

### 2.2 Client Meteo: `core/openMeteoApi.js`
- In `fetchSpotWeather` e `enrichWeatherData`, preservato `takeoff_azimuth: null` quando non specificato.
- Nel builder opzioni, abilitata la cancellazione esplicita dell'azimut tramite `'customHeading' in options`.

### 2.3 Shell UI: `ForecastView.js`, `HomeDashboardView.js` & `mapEngineAdapter.js`
1. **Rimozione Fallback Fittizi**: Rimossi tutti i costrutti `takeoff.heading || 180` da `ForecastView.js` e `HomeDashboardView.js`.
2. **Armonizzazione `computeParamMetrics` in `ForecastView.js`**:
   - Vento $\le 4\text{ km/h}$ su decollo orientato $\implies$ `flyable` ("Vento Calmo") se $\le 90^\circ$, `caution` ("Brezza da Dietro") se $> 90^\circ$.
   - Decolli privi di heading $\implies$ valutati unicamente sull'intensità e raffiche rispetto alla classe della vela.
   - Nelle righe di dettaglio e consiglio pilota, mostra `Scostamento Decollo: N/D (Esposizione non nota)` e consiglio: *"Esposizione del pendio non nota nel catalogo. Intensità vento nei limiti: valutare l'allineamento del decollo direttamente sul posto."*
3. **Compasso Vento SVG (`renderWindCompass`)**:
   - Se `heading == null`, sopprime il cono verde di apertura a 70° e la freccia azimutale di pendio.
   - Mostra il badge `Esposizione N/D` e il valore `Azimut Decollo: N/D`.
4. **Cartografia Leaflet (`mapEngineAdapter.js`)**:
   - In `generateTakeoffSectorSvg`, se `heading == null` renderizza un marker neutro tratteggiato senza settore direzionale ingannevole orientato a Nord o Sud.

---

## 3. Validazione Automatizzata

1. `tests/core/flyability.test.mjs`:
   - Validazione slot con decollo privo di esposizione (`hasExposure: false`, `severity: 0`).
   - Validazione calma di vento ($\le 4\text{ km/h}$) con vento in asse, al traverso e in coda.
   - Validazione vento sostenuto al traverso e sottovento.
2. `tests/core/comprensorio.test.mjs`:
   - Regressione Ciavanis 180° a 2 km/h da 101°: esito `flyable`, `severity: 0`, motivazione di brezza calma.
   - Regressione decollo privo di esposizione: `hasExposure: false`, `label: 'Esposiz. N/D'`, `severity: 0`.
3. `tests/ui/forecastView.test.mjs`:
   - Verifica di `computeParamMetrics` per Ciavanis e per decolli senza heading.
   - Verifica di `renderSpecificSpotMetrics` (`Azimut Pendio: N/D`).
   - Verifica di `renderWindCompass` (assenza di cono verde e freccia di pendio con heading null).
4. `npm test`: 73 suite di test, 497 test eseguiti con successo, 0 fallimenti.
