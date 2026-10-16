# Lezioni Apprese & Vincoli Stabili di Progetto (MEMORY)

Registro distillato per dominio dei vincoli architetturali e delle insidie di runtime di GlideMind.
> **Governance anti-bloat**: tetto massimo **200 righe**. Vietato l'append cronologico numerato: aggiornare le sezioni *in-place* sostituendo le regole superate. Le regole verificabili via codice risiedono in [`tests/ui/shiftLeftGovernance.test.mjs`](file:///c:/github/GlideMind/tests/ui/shiftLeftGovernance.test.mjs). Lo storico integrale pre-distillazione (voci 1–176) è archiviato in [`.agents/archive/MEMORY_v1_archive.md`](file:///c:/github/GlideMind/.agents/archive/MEMORY_v1_archive.md).

---

## 1. Core Headless, Matematica & Geodesia

- **Purezza Headless (`core/`)**:
  - *Insidia*: Importare `store.js`, `i18n.js` o riferimenti a `window`/`document` nei moduli di calcolo blocca l'esecuzione in Node.js puro.
  - *Regola*: Zero dipendenze DOM in `core/`. Includere dizionari di fallback interni e iniettare traduttori/adapter via parametri (`setFlyabilityTranslator`, `storageAdapter`).
- **Normalizzazione IEEE 754 `-0` e Delta Angolare con Segno**:
  - *Insidia*: `Math.sin(Math.PI)` produce `-0` facendo fallire `assert.equal(-0, 0)`; usare distanze angolari assolute `[0, 180]°` cancella il verso di virata (orario/antiorario).
  - *Regola*: Normalizzare sempre `val === 0 ? 0 : val` e usare in cinematica (`flightManeuvers.js`, `flightTelemetry.js`) il delta con segno `((b2 - b1 + 540) % 360) - 180` in `[-180, +180]°`.
- **Clamping Variometrico IGC, Smoothing e Termiche**:
  - *Insidia*: Glitch GNSS generano picchi verticali $> 50\text{ m/s}$, mentre il moving average a 5 punti attenua fisiologicamente le cuspidi secche nei test sintetici.
  - *Regola*: Linearizzare la quota se $|v_z| > 25\text{ m/s}$ limitando il rateo a $\pm 18\text{ m/s}$; tollerare brevi inversioni di virata nel clustering delle termiche e calibrare i test sull'attenuazione del filtro.
- **Divieto Assoluto di Punti Traccia Sintetici (`hasAttachedTrack`)**:
  - *Insidia*: Generare curve sintetiche per voli privi di GPS o fidarsi del flag legacy `flight.hasTrack === true` falsifica i dati aeronautici e corrompe mini-mappa e replay 3D.
  - *Regola*: Vietato creare punti artificiali (`isReconstructed: false` sempre). Validare la presenza fisica di coordinate solo tramite `hasAttachedTrack(flight)` (`core/logbook.js`) ed eseguire l'auto-purge in `logbookDb.js`.
- **Unità Centralizzate (`core/units.js`) e Date Locali Anti-Shift UTC**:
  - *Insidia*: `date.toISOString().split('T')[0]` sposta la data al giorno precedente/successivo vicino a mezzanotte; formattare unità nelle viste crea inconsistenze.
  - *Regola*: Usare sempre `formatDateIso(date)` e `parseDateIso(str)` fissato alle `12:00:00` locali (`core/datePresets.js`), e formattare vento/quota/vario tramite `core/units.js` leggendo `store.getState().ui.units`.

---

## 2. Meteo, Comprensorio & Modello di Volabilità

- **Comprensorio-Centrismo, Unico Binomio e Finestra Diurna VFR**:
  - *Insidia*: Valutare decolli orfani dell'atterraggio o passare parametri posizionali a `evaluateComprensorio` genera falsi positivi di sicurezza o `TypeError`.
  - *Regola*: Invocare `evaluateComprensorio({ comprensorio, weatherData, hourIndex, glider, pilotSafetyFactor })`, normalizzare le coordinate con `parseCoordinates()` e limitare timeline e serie all'arco diurno `resolveDaylightHours` (`core/daylight.js`).
- **Proxy Aerodinamico Vela & Prudenza Pilota Opt-In (`usePilotCurrencyFactor`)**:
  - *Insidia*: Selettori soggettivi di "livello pilota" inducono errori di autovalutazione; d'altra parte la scarsa continuità di volo riduce i margini di gestione attiva ma non cambia la fisica dell'ala.
  - *Regola*: L'ala attiva (EN-A..D) definisce i limiti fisici invarianti ($V_{\text{trim}}$ per `windRed`/`windNoFly` e `safeLimit` di planata). Il fattore opt-in `calculatePilotSafetyFactor` (`1.0x`, `0.85x`, `0.75x`) riduce solo le soglie di pilotaggio attivo ($\Delta\text{Gust}$, EDR, CAPE, traverso).
- **Disaccoppiamento Oro-Meteorologico Decollo/Atterraggio e Sub-Spot**:
  - *Insidia*: Usare solo `baseKey` (`${spot.id}_${dateStr}`) serve l'aerologia del decollo primario; d'altra parte, salvare il fallback sintetico a `0ms` sulla `compositeKey` (`${spot.id}_${takeoff.id}_${landing.id}_${dateStr}`) senza invalidarlo al ritorno di `fetchWeatherDataAsync` lascia la `Timeline Volabilità` bloccata sui dati sintetici, mentre iniettare `landingWeather` sintetico (`26 km/h` gust) in un `mainWeather` reale degrada falsamente il pomeriggio.
  - *Regola*: In `ForecastView.js` invalidare tutte le chiavi `${spot.id}_*_${dateStr}` quando arriva il payload live, dare sempre priorità alle entry `!isSynthetic` in `getWeatherData`, non allegare mai `landingWeather` sintetico a un `mainWeather` reale e usare `windspeed_10m ?? wind_speed_10m` in `HomeDashboardView.js`.
- **Resilienza Client Open-Meteo & Protezione Quota HTTP 429**:
  - *Insidia*: Modelli regionali (`arome_france`, `icon_d2`) fuori dominio o oltre 2 giorni restituiscono HTTP 400; richieste concorrenti duplicate saturano il rate limit (HTTP 429).
  - *Regola*: Applicare in `core/openMeteoApi.js` fallback automatico a `best_match` su HTTP 400, in-flight promise pooling, circuit breaker cooldown su HTTP 429 e fallback su cache stale offline (`isStaleOfflineFallback: true`).
- **Traduzione Fenomenologica Anti-Gergo (`novice-pilot-auditor`)**:
  - *Insidia*: Esporre acronimi grezzi (`CAPE`, `LCL`, `EDR`) rallenta il triage pre-volo oltre i 3 secondi.
  - *Regola*: Affiancare sempre l'etichetta fenomenologica in italiano (*Instabilità / Temporali*, *Base Nubi*, *Turbolenza in Termica*, *Gradiente Termico*) come dato primario.

---

## 3. Architettura UI, Ergonomia Outdoor & Design System

- **Governance CSS, Dual Theme Sunlight e Touch Floor ($\ge 48\text{px}$)**:
  - *Insidia*: Selettori CSS top-level duplicati causano override silenziosi; lo shorthand `background:` su `<select>` ripete l'icona SVG; target $< 48\text{px}$ falliscono con i guanti.
  - *Regola*: Zero stili inline statici, zero selettori duplicati in `css/theme.css`, `background-repeat: no-repeat !important` sui `<select>` multi-layer e touch target $\ge 48\text{px}$ (estesi via `::before` sui controlli compatti).
- **Home Dashboard 100% Meteo-Centrica e Timeline Sottile (`HomeDashboardView.js`)**:
  - *Insidia*: Card statistiche pilota in Home rubano il 35% dell'Above-the-Fold; barre orarie spesse `8px` con numeri ripetuti creano rumore visivo.
  - *Regola*: Nessun blocco statistiche pilota in Home (mostrare `#home-pilot-currency-alert` solo se `reentry`/`lapsed`). Barra simbiotica monoriga (`#home-symbiotic-toolbar`), card a 2 righe con `.gm-home-timeline-bar` alta `3.5px` senza numeri orari né `.is-selected-hour`, opacità differenziata (`flyable: 0.85`, `unflyable: 0.28`) e singolo bottone `.gm-spot-accordion-trigger` con chevron verticale.
- **Date Picker Monoriga (`36px`) e Calendario 7 Colonne (`Lun–Dom`)**:
  - *Insidia*: Aggiungere un 5° chip `.custom` manda in overflow i viewport `360px`; colorare `.gm-date-grid-item.active` di giallo ambra lo confonde con lo stato `Cautela`.
  - *Regola*: Dividere `.gm-date-tabs` in `.gm-date-stepper` (`[‹ Data ▾ ›]`) + `.gm-date-quick-chips` fissi (`!p.isCustom`). Nello sheet calendario usare una griglia a 7 colonne (`Lun–Dom`) con spacer iniziali e anello `.active` ciano neutro (`#38bdf8`) che preserva la barra inferiore a 4 colori.
- **Selettore Sub-Spot, Silenziamento Badge `Live` Nominale e Scrubbar Uniforme (`ForecastView.js`, `SpotMapView.js`)**:
  - *Insidia*: Mostrare il badge verde `● Live` quando `networkStatus === 'live'` fa credere al pilota di leggere un anemometro fisico sul prato diverso dalla scrubbar (`ORA`), mentre variare l'altezza verticale (`fillPct`) di `.compact-bar` senza asse Y crea un istogramma inverso ambiguo (`100%` = vento calmo, `35%` = vento forte).
  - *Regola*: Nascondere `#gm-home-live-badge` e `#gm-forecast-live-badge` (`hidden`) quando `networkStatus === 'live'`, mantenere `.gm-quick-subspot-switcher` a 3 colonne (`Panoramica | Decollo | Atterraggio`) e renderizzare `.compact-bar` come pillola orizzontale di altezza fissa (`16x8px`, `fillPct: 100`) con `.compact-bar-unflyable .compact-bar-fill { opacity: 0.35 }`.
- **Rimozione Categorie Normative Vela (`EN-A..D`) e Filtri Logbook a 5 Gruppi (`LogbookView.js`)**:
  - *Insidia*: Mostrare badge `EN-A`/`EN-B` nella UI o nei debriefing sovrascrive con etichette burocratiche i veri parametri aerodinamici ($V_{\text{trim}}$, $V_{\text{max}}$, efficienza); mescolare chip piatti nel Logbook satura lo spazio mobile.
  - *Regola*: Omettere `.gm-glider-pill-badge` e riferimenti `EN-A..D` dalla UI/debriefing, esponendo sempre $V_{\text{trim}}$, $V_{\text{max}}$ e $L/D$. Nel Logbook usare una barra a 5 gruppi tematici espandibili (`Vela ▾`, `Anno ▾`, `Caratteristiche ▾`, `Tempo ▾`, `Distanza ▾`) con drawer `.gm-filter-group-drawer` e combinazione in `AND` logico.
- **Warning Floating Zero-CLS e Cleanup Deterministico degli Overlay**:
  - *Insidia*: Banner di avviso nel flusso statico generano Cumulative Layout Shift (CLS) e restano bloccati a schermo; cambiare rotta con uno sheet aperto lascia listener orfani.
  - *Regola*: Ancorare tutti i warning con `position: fixed` in basso sopra nav/scrubber dotandoli di `.gm-warning-close-btn` (`✕`, `48x48px`). In `ui/router.js`, chiudere sempre `sheetManager.closeSheet()` al cambio rotta e inibire le scorciatoie da tastiera quando un overlay è attivo.

---

## 4. Cartografia 2D, Geodesia & Replay 3D WebGL

- **Tile Server Keyless, Isolamento Tema/Layer e Cache Mappa Entity-Centric**:
  - *Insidia*: I tile CartoDB/Stadia mostrano watermark `API KEY REQUIRED`; interrogare Open-Meteo sul bounding box a ogni `moveend` esaurisce la quota API.
  - *Regola*: Usare basemap keyless (Esri World Imagery/Topo/Dark Gray, OpenTopoMap, CyclOSM) mantenendo il layer scelto indipendente dal cambio tema UI. Caricare il meteo sulla mappa solo per comprensori del catalogo partizionati per macro-regione, indicizzando la cache per `spotId`.
- **Geometria Pulita dei Marker Cartografici (`mapEngineAdapter.js`)**:
  - *Insidia*: Mostrare la quota testuale dentro il pin di atterraggio (`.gm-mini-pin-landing`) o frecce/gradi ridondanti sul decollo collide con le maniche a vento vettoriali.
  - *Regola*: Renderizzare l'atterraggio come hub circolare `22x22px` contenente solo `⏚` (zero `.gm-mini-pin-alt`), il decollo con settore d'esposizione pulito, doppia manica a vento con rotazione shortest-path e badge dislivello sul punto medio della retta D–A.
- **Sincronizzazione 3D MapLibre GL + Three.js (`MapLibreReplayEngine.js`)**:
  - *Insidia*: Disallineamento tra quota terreno DEM e coordinate ENU locales, nastro 3D che ingloba il parapendio o stallo del canvas WebGL durante il play.
  - *Regola*: Fissare l'origine locale $P_0$ al decollo compensando `map.transform.elevation`, applicare `Dual-Regime Hermite Scaling` (spessore schermo invariante `6.0px`), aggiornare `setDrawRange` col vertice di testa agganciato all'avatar, invocare `this.map.triggerRepaint()` a ogni frame e gestire `webglcontextlost`.

---

## 5. Persistenza Dual-Store, Backup & PWA Offline-First

- **Separazione IndexedDB (`flights_meta` / `flights_raw`) e Stripping `localStorage`**:
  - *Insidia*: Caricare tutti i punti GPS all'avvio satura la RAM; serializzare `points` o `originalPoints` dentro `localStorage` provoca `QuotaExceededError` (> 5MB).
  - *Regola*: Separare in IndexedDB `flights_meta` e `flights_raw`. In `core/store.js`, rimuovere sempre gli array densi (`points`, `originalPoints`, `uncalibratedOriginalPoints`) prima di salvare `flights` in `localStorage`.
- **Ordine di Bootstrap e Autorevolezza di IndexedDB (`ui/app.js`)**:
  - *Insidia*: Chiamare `store.loadPersistedState()` dopo `logbookManager.getAllFlights()` sovrascrive l'archivio IndexedDB con uno snapshot `localStorage` obsoleto.
  - *Regola*: In `bootstrapApp()`, invocare prima `store.loadPersistedState()` per le preferenze e subito dopo idratare `flights` da `logbookManager.getAllFlights()`. Persistere anche i voli manuali (`ImportFlightSheet.js`) tramite `logbookManager.saveFlight()`.
- **Pre-Chunking IGC, Trimming Non-Distruttivo e Service Worker (`sw.js`)**:
  - *Insidia*: L'header `HFDTEDATE:DDMMYY,NN` non riconosciuto causa collisioni di fingerprint; cachare tile mappa o risposte API nel Service Worker satura lo storage.
  - *Regola*: Supportare il formato `HFDTEDATE:DDMMYY,NN` in `logbookDb.js`, conservare `originalPoints` per il ricalcolo al trimming e configurare `sw.js` in Cache-First per gli asset statici, pass-through per `open-meteo.com` e Network-Only per i tile cartografici.

---

## 6. Test Harness, Governance & Ambiente Windows

- **Test Runner Nativo su Windows e Mock Guard Offline**:
  - *Insidia*: `node --test tests/**/*.test.mjs` fallisce su Windows (`cmd.exe` non espande i glob); chiamate HTTP reali nei test consumano quota esterna.
  - *Regola*: Eseguire `node --test` senza glob o con percorsi espliciti, usare sempre fixture/mock offline (`?mock=1`) e mantenere `ui/router.js` eseguibile anche con `containerEl` nullo.
- **Isolamento Plugin, Git Staging e Gate Automatici**:
  - *Insidia*: Le giunzioni NTFS (`mklink /J`) nel workspace vengono tracciate da Git come file ordinari; `git add .` include file temporanei.
  - *Regola*: Mantenere i plugin in `~/.gemini/config/plugins/`, usare staging chirurgico per singolo file ed eseguire `tests/ui/shiftLeftGovernance.test.mjs` a ogni consegna.
