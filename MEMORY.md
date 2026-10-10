# Lezioni Apprese & Vincoli Stabili di Progetto (MEMORY)

Questo documento registra vincoli stabili e lezioni tecniche apprese durante lo sviluppo di GlideMind per prevenire regressioni e iterazioni a vuoto.

---

## 1. Governance Git & Junctions NTFS (Windows)
- **Problema**: L'uso di giunzioni NTFS (`mklink /J`) dentro un workspace Git provoca l'indicizzazione dei file del repository sorgente come file ordinari se non esplicitamente esclusi.
- **Causa Radice**: Git su Windows non mappa le directory junction a symlink Git standard, trattandole come normali directory percorribili.
- **Pattern Vincolante**: I plugin operativi condivisi devono essere installati globalmente in `~/.gemini/config/plugins/` (o configurati in `.gitignore`), mantenendo il repository dell'applicazione interamente disaccoppiato da percorsi esterni.

---

## 2. Test Runner Nativo Node.js (`node --test`)
- **Problema**: Specificare stringhe glob come `node --test tests/**/*.test.mjs` fallisce su Windows (`Could not find tests/**/*.test.mjs`).
- **Causa Radice**: La shell di sistema di Windows (`cmd.exe`) non espande i glob prima di passare i parametri al processo.
- **Pattern Vincolante**: Utilizzare sempre `node --test` senza argomenti glob o con percorsi espliciti. Node.js gestisce nativamente la scoperta ricorsiva di tutti i file `*.test.{js,mjs}` nella cartella `tests/`.

---

## 3. Disaccoppiamento Assoluto del Core Headless (`core/`)
- **Problema**: Nel progetto legacy ParaMeteo, algoritmi matematici e logica di dominio erano mescolati con manipolazioni dirette del DOM (`document.getElementById`), Canvas e oggetti `window`.
- **Causa Radice**: Assenza di separazione architetturale tra logica di calcolo e rendering visuale.
- **Pattern Vincolante**: La cartella `core/` deve rimanere pura: zero dipendenze da `window`, `document`, `HTMLElement`, `navigator` o `Canvas`. Tutti i moduli di calcolo devono poter essere eseguiti e testati al 100% in Node.js puro senza polyfill del DOM.

---

## 4. Ergonomia Outdoor HMI & Standard Touch
- **Problema**: Target di tocco piccoli (<44px), modali popup nidificate o griglie a scorrimento verticale compresso risultano inutilizzabili all'aperto con guanti o sotto la luce del sole.
- **Causa Radice**: Progettazione desktop-first scalata forzatamente su mobile.
- **Pattern Vincolante**: Dimensionamento minimo di ogni elemento interattivo a $\ge 44 \times 44\text{px}$, adozione di caroselli a riga singola con `touch-action: pan-x`, viewport dinamico `100dvh` e divieto assoluto di modali nidificate.

---

## 5. Normalizzazione IEEE 754 Negative Zero (`-0`) nei Calcoli Trigonometrici
- **Problema**: Operazioni trigonometriche su angoli retti o opposti (es. `Math.sin(Math.PI) * 10 / 10`) possono produrre il valore `-0`. Le asserzioni native `assert.equal(-0, 0)` in `node:assert/strict` falliscono poiché `Object.is(-0, 0)` è falso.
- **Causa Radice**: Standard floating point IEEE 754 con segno sui numeri reali.
- **Pattern Vincolante**: Nei moduli matematici di scomposizione vettoriale o rotazione angolare, normalizzare sempre i valori numerici nulli prima di restituirli all'esterno: `val === 0 ? 0 : val`.

---

## 6. Disaccoppiamento i18n & Store dai Moduli Core Headless
- **Problema**: Nel repository legacy, `flyability.js` importava direttamente `i18n.js` e `store.js`, i quali a loro volta eseguivano chiamate al DOM (`document.documentElement`, `document.dispatchEvent`) e `localStorage`.
- **Causa Radice**: Dipendenze circolari tra logica di dominio puro e livello di presentazione UI.
- **Pattern Vincolante**: I moduli in `core/` devono essere autonomi: includere sempre un dizionario di fallback nativo interno e accettare traduttori o gliders tramite iniezione delle dipendenze (parametri di funzione o `setFlyabilityTranslator`), garantendo zero import da file con riferimenti a `document` o `window`.

---

## 7. Clamping Fisico Variometrico nei Record IGC e Disaccoppiamento Telemetria
- **Problema**: Ricevitori GNSS a bassa frequenza o smartphone generano glitch altimetrici istantanei (es. salti di centinaia di metri in frazioni di secondo), provocando picchi di salita fittizi (> 50 m/s) e distorsione del guadagno termico cumulato. Inoltre `igcParser.js` legacy invocava direttamente analizzatori di manovre complessi legati a modelli UI.
- **Causa Radice**: Assenza di un boundary di confidenza fisica sui dati barometrici/GNSS e accoppiamento rigido tra parsing del tracciato e motori di classificazione manovre acrobatiche.
- **Pattern Vincolante**: Applicare un filtro anti-spike immediato nel loop di scansione B-record: se la velocità verticale $|v_z| > 25\text{ m/s}$, la quota viene linearizzata e il rateo limitato al valore fisico massimale del volo libero ($\pm 18\text{ m/s}$). Il parser deve calcolare autonomamente le grandezze cinematiche di primo livello (distanza, dislivello cumulato, velocità, min/max quota) e delegare l'analisi avanzata via callback `options.telemetryAnalyzer`.

---

## 8. Delta Angolare con Segno vs Distanza Angolare Geodetica
- **Problema**: L'uso di funzioni di differenza angolare geodetica (che restituiscono un valore assoluto in $[0, 180]^\circ$) corrompe l'analisi cinematica di spirali, virate e oscillazioni acrobatiche, poiché cancella la direzione di virata (orario vs antiorario) e impedisce l'integrazione cumulativa dell'angolo di virata oltre i $180^\circ$.
- **Causa Radice**: Confusione tra distanza metrica tra due azimut e variazione istantanea di prua lungo una traiettoria temporale continua.
- **Pattern Vincolante**: Nei moduli di cinematica e manovre (`core/flightManeuvers.js`, `core/flightTelemetry.js`), utilizzare esclusivamente il delta angolare con segno in $[-180, +180]^\circ$: `calculateAngularDelta(b1, b2) = ((b2 - b1 + 540) % 360) - 180`.

---

## 9. Attenuazione dei Picchi da Moving Average Altimetrico nelle Asserzioni di Test
- **Problema**: Il calcolo del guadagno di quota cumulato su un tracciato sintetico a cuspide (es. salita lineare seguita da discesa immediata) produce un valore inferiore al delta secco tra quota massima e quota minima.
- **Causa Radice**: Il filtro di smoothing altimetrico (moving average a finestra mobile, es. 5 punti) attenua fisiologicamente le cuspidi istantanee e i cambi repentini di pendenza.
- **Pattern Vincolante**: Nelle suite di test con profili sintetici ad alta variazione geometrica, calibrare le soglie di guadagno tenendo conto del coefficiente di attenuazione del filtro, oppure testare separatamente il calcolo puro del guadagno su array non smussati e l'effetto della pipeline integrata con tolleranza appropriata.

---

## 10. Fallback Modelli Regionali Open-Meteo & Astrazione Cache Headless
- **Problema**: Richiedere modelli numerici ad altissima risoluzione regionali (es. `arome_france` per l'arco alpino occidentale o `icon_d2` per la Germania) su coordinate al di fuori del loro dominio geografico o per orizzonti temporali superiori a 2 giorni genera errori HTTP 400 Bad Request da Open-Meteo. Inoltre, salvare la cache legandosi a `localStorage` blocca i test Node.js e l'esecuzione headless.
- **Causa Radice**: Assenza di un fallback synoptico a livello di client API e accoppiamento rigido del meccanismo di caching al runtime del browser.
- **Pattern Vincolante**: `core/openMeteoApi.js` deve adottare una cache in-memory (`InMemoryCache`) con interfaccia LRU/TTL pura, esportabile/importabile via JSON per essere montata opzionalmente su `localStorage` dallo store della UI. Nel client di rete, se un modello specifico restituisce HTTP 400, il client deve rieseguire automaticamente la richiesta con il fallback trasparente al modello universale `best_match`. In caso di fallimento o timeout della connessione, il client deve recuperare la voce cache scaduta (stale) marcandola con `isStaleOfflineFallback: true` prima di sollevare eccezioni.

---

## 11. Disaccoppiamento del Ciclo di Vita del Router dal DOM Fisico
- **Problema**: Se il router subordina l'invocazione del ciclo di vita (`mount()`, `unmount()`) delle viste alla presenza fisica di un nodo DOM (`if (containerEl)`), i test del controller in ambienti headless Node.js senza polyfill non eseguono i callback di ciclo di vita.
- **Causa Radice**: Assunzione che la navigazione e il montaggio logico di una vista richiedano un albero DOM reale anziché un'interfaccia di montaggio astratta.
- **Pattern Vincolante**: `ui/router.js` deve invocare sempre i controller di vista registrati passando `containerEl` (anche se nullo o mock), permettendo a viste e test di operare in headless, mentre l'iniezione di markup di placeholder per viste non registrate deve rimanere condizionata alla presenza effettiva di un elemento contenitore.

---

## 12. Paradigma Comprensorio-Centrico vs Point-Centric per Piloti Ricreativi
- **Problema**: Trattare i singoli decolli come punti isolati disconnessi genera dispersione nei preferiti, ricerche frammentate e, soprattutto, omette la valutazione dell'atterraggio a fondo valle, creando falsi positivi di sicurezza per piloti non esperti di cross-country.
- **Causa Radice**: Modelli orientati a rotte di cross-country o database appiattiti su singole coordinate GPS di decollo.
- **Pattern Vincolante**: L'entità radice primaria in GlideMind è la `Località` (Comprensorio), che incapsula obbligatoriamente i decolli (`takeoffs`) e gli atterraggi (`landings`) associati. I preferiti (`pinnedLocationIds`), le ricerche e le card di sintesi meteo aggregano la volabilità del miglior decollo e la sicurezza del vento a terra all'atterraggio. Nello stato applicativo e nelle viste è vietato separare decolli e atterraggi o gestirli come entità orfane.

---

## 13. Proxy Aerodinamico della Vela vs Auto-Dichiarazione 'Livello Pilota'
- **Problema**: Inserire selettori di "Livello Pilota" (principiante/intermedio/esperto) nella UI genera attrito decisionale, sovraccarico cognitivo sul decollo e rischi di autovalutazione fallace (Dunning-Kruger o mancato aggiornamento del profilo).
- **Causa Radice**: Trattare la sicurezza come una preferenza dichiarativa soggettiva anziché ancorarla alle caratteristiche aerodinamiche oggettive dell'ala in uso.
- **Pattern Vincolante**: Nessun selettore di livello pilota nella UI dell'app. L'attrezzatura attiva nel profilo o hangar (`glider`: EN-A, EN-B, EN-C, EN-D con $v_{\text{trim}}$, allungamento $AR$, efficienza) è l'unica sorgente di verità per l'inviluppo di volo. Per una vela EN-A (scuola/principiante), le soglie restrittive (vento $\le 18\text{ km/h}$, $\Delta$ gust $\le 8\text{ km/h}$, efficienza cono atterraggio $\le 1:5.5$) scaturiscono matematicamente dalle formule fisiche. La skill `novice-pilot-auditor` è uno strumento di ingegneria/audit invocato nei checkpoint cardine (rilascio UI, modifiche algoritmi meteo, briefing AI, debriefing IGC).

---

## 14. Architettura Concettuale Minimale della Home: Ordinamento Volabilità & Currency Pilota (Zero PIN/Preferiti)
- **Problema**: Inserire nella Home selettori date estesi, statistiche di carriera o micro-gestioni di bookmarking con stelle/pin genera attrito e affollamento visivo (clutter) opprimente, contrario all'essenzialità del pilota outdoor.
- **Causa Radice**: Sovrapposizione di responsabilità tra la vista principale (Home) e i tab specialistici (Previsioni, Logbook, Mappa) e tentativi di trasformare la Home in un gestore di preferiti.
- **Pattern Vincolante**: La Home (`HomeDashboardView.js`) deve contenere **esclusivamente 2 blocchi funzionali**:
  1. **Panoramica Volabilità Comprensori ordinata dinamicamente per condizione decrescente**: dal migliore al peggiore (`Aperto/Volabile` in cima $\to$ `Cautela` $\to$ `Chiuso` in fondo), **senza bottoni di PIN, icone stella preferiti o logiche di aggiunta/rimozione preferiti**. Ogni card sintetizza: nome comprensorio, badge di stato, explainability fisica sintetica, decollo migliore attivo ($T_{\text{best}}$) e atterraggio di rientro ($L_{\text{safe}}$), con tap rapido verso `ForecastView`. Include filtro di ricerca istantaneo ad autocompletamento (NN/G #6).
  2. **Stato di Volo / Currency del Pilota**: una singola riga o card essenziale con l'ultimo volo effettuato (data, località, durata), indicatore di allenamento/currency e azione rapida primaria `+ Carica IGC`.
  Tutti i dettagli specialistici (modelli meteo, radiosondaggi LCL, bussola 360°, ore di carriera, telemetria 3D, matrici addestrative) risiedono rigorosamente nei rispettivi tab dedicati (`ForecastView`, `LogbookView`).

---

## 15. Regola dell'Unico Binomio (1 Decollo + 1 Atterraggio per Comprensorio)
- **Problema**: Mostrare o valutare liste eterogenee di decolli multipli e atterraggi alternativi dentro una card sintetica di comprensorio disorienta il pilota e distrugge il colpo d'occhio outdoor.
- **Causa Radice**: Assenza di un vincolo di sintesi aeronautica 1:1.
- **Pattern Vincolante**: Ogni comprensorio sintetizza **esclusivamente un singolo decollo** e **un singolo atterraggio**. Nel catalogo, i punti di riferimento storici/ufficiali sono marcati con `isPrimary: true`. L'interfaccia di calcolo (`evaluateComprensorio`) espone sempre un unico binomio coerente (`takeoff` e `landing`), garantendo una densità visiva ad alta leggibilità in ogni vista riassuntiva.


---

## 16. Layout Geometry Testing, Deduplicazione CSS & Salvaguardie Viewport Mobile
- **Problema**: Card schiacciate con larghezza fissa (270px) in container da 358px, testo troncato con ellissi arbitrarie (`...`), elementi dislocati da classi `.sr-only` non mappate e sovrapposizione con la barra di navigazione fissa inferiore. I test unitari passavano al 100% perché controllavano solo stringhe HTML (`assert.ok(html.includes(...))`).
- **Causa Radice**: Doppia definizione concorrente di classi (`.gm-spot-card`) nei fogli di stile con override silenzioso e assenza di test su geometrie computate reali (bounding box, scrollWidth, clearance).
- **Pattern Vincolante**:
  1. **Deduplicazione CSS Rigorosa**: Le classi card principali devono essere definite esattamente UNA volta come blocco autonomo. Larghezze fisse (es. caroselli) devono essere esplicitamente scoped (`.gm-carousel .gm-spot-card`).
  2. **Larghezza Mobile 100%**: Le card nelle viste dashboard devono avere sempre `width: 100%` per sfruttare l'intera larghezza utile del container.
  3. **Trasparenza Tipografica Outdoor**: Vietato l'uso di `text-overflow: ellipsis` su stringhe di explainability fisica e metriche aeronautiche. Gerarchia a due righe strutturate: riga 1 decollo (nome esplicito, quota, vento), riga 2 atterraggio (nome, quota, efficienza).
  4. **Verifica dello Spazio Utile e Clearance Navigazione**: Ogni schermata principale deve calibrare le altezze per far rientrare le card e le barre di azione primarie interamente sopra la barra di navigazione fissa (`#bottom-nav-bar`), garantendo un margine di sicurezza $\ge 24\text{px}$.
  5. **Test di Salvaguardia Automatizzati**: Includere nella suite di test verifiche statiche su `css/theme.css` (conteggio selettori, presenza di `width: 100%`, definizione di `.sr-only`) per impedire regressioni di layout.

---

## 17. Contratti di Firma e Normalizzazione Coordinate nei Moduli Meteo & Comprensorio
- **Problema**: L'invocazione di `evaluateComprensorio(spot, weatherData, hour, glider)` fallisce con `TypeError: Cannot read properties of undefined (reading 'takeoffs')`, e chiamare `generateSyntheticWeather` con stringhe coordinate grezze genera `Error: Invalid latitude value: undefined`.
- **Causa Radice**: Disallineamento tra firme a parametri posizionali e firme a oggetto distrutturato (`{ comprensorio, weatherData, hourIndex, glider }`), unito all'aspettativa di oggetti `{ lat, lon }` normalizzati anziché stringhe `"45.833, 9.302"`.
- **Pattern Vincolante**:
  1. `evaluateComprensorio` deve essere sempre invocato passando un singolo oggetto parametri: `{ comprensorio, weatherData, hourIndex, glider }`.
  2. Nelle viste e nei test, applicare sempre preventivamente `parseCoordinates(takeoff.coordinates)` prima di passare le coordinate ai generatori meteo o funzioni geodetiche.
  3. Denominazione conforme agli standard meteorologici WMO: utilizzare `classifyAtmosphericStability(lapseRate)` e `calculateLCL(temp, dewPoint, elev)` senza abbreviazioni arbitrarie.

---

## 18. Gate di Validazione UX Laws Obbligatorio in Fase Progettuale
- **Problema**: Progettazione di elementi UI ridondanti (es. pulsante Home duplicato nell'header quando già presente nella bottom bar), posizionamento scorretto di controlli primari fuori dalla Thumb Zone (timeline orizzontale a scroll in alto) o mancanza di un check sistematico sui principi di ergonomia prima di scrivere codice.
- **Causa Radice**: Assenza di un passaggio obbligatorio di verifica euristica preventivo durante la concezione dell'interfaccia.
- **Pattern Vincolante**: Prima di produrre codice, markup o proposte di layout per qualsiasi schermata o componente, l'agente deve applicare e documentare la checklist **Pre-Design UX Check**:
  1. *Occam's Razor & Prägnanz*: Zero controlli duplicati rispetto al frame globale (`#bottom-nav-bar`). Nessun bottone parassita.
  2. *Fitts's Law & Thumb Zone*: Controlli di scrubbing e trigger primari in basso, touch target $\ge 48\times 48\text{px}$.
  3. *Hick's & Miller's Law*: Scelte visibili essenziali (3–5 opzioni), informazioni raggruppate in blocchi (chunking), zero scroll orizzontale su viste dati.
  4. *Jakob's Law*: Bottom bar per navigazione di primo livello, bottom sheet (`SheetManager`) per filtri e selezioni, mai dialoghi popup modali annidati.
  5. *Doherty Threshold*: Aggiornamento reattivo immediato ($<50\text{ms}$) allo scrubbing.

---

## 19. Gate di Audit Terminologico & Microcopy Pilota (Anti-Gergo) in Fase Progettuale
- **Problema**: Esposizione diretta di metriche fisiche grezze, acronimi specialistici o terminologia da modello numerico (`Energia CAPE`, `J/kg`, `LCL`, `EDR`, `Lapse Rate`) nei componenti UI, nelle card e nei briefing di volo. In ambiente outdoor e sul decollo, o per allievi e neo-brevettati, il dato termodinamico non contestualizzato genera sovraccarico cognitivo, rallenta la valutazione pre-volo oltre i 3 secondi di sicurezza e rischia di mascherare pericoli critici (es. colpi di vento e cumulonembi).
- **Causa Radice**: I controlli preventivi in fase di ideazione si concentravano esclusivamente su layout, geometrie e target di tocco, omettendo il vocabolario a schermo e rimandando la revisione di `novice-pilot-auditor` alla fine del task (o omettendola).
- **Pattern Vincolante**:
  In **fase progettuale preventiva** (prima di scrivere o proporre markup, controller o prompt), l'agente deve eseguire e documentare l'**Audit di Vocabolario & Microcopy** secondo i criteri di `novice-pilot-auditor`:
  1. **Censimento Terminologico Preventivo**: Elencare ogni etichetta, unità di misura e metrica prevista nella vista o card prima di implementarla.
  2. **Regola della Traduzione Fenomenologica**: L'etichetta primaria e il testo principale devono descrivere l'**effetto pratico sul volo e sulla sicurezza** (es. *Rischio Temporali*, *Instabilità*, *Base Nubi*, *Turbolenza in Termica*), mai l'acronimo accademico crudo (*CAPE*, *LCL*, *EDR*).
  3. **Gerarchia Qualitativo-Quantitativa**:
     - *Dato Primario*: Stato semantico chiaro e color-coded (*Basso / Moderato / Sovrasviluppo CB*, *Calmo / Turbolento*).
     - *Dato Secondario (Accessorio)*: Il valore numerico specialistico con unità di misura (`650 J/kg`, `0.22 m²/³ s⁻¹`) può comparire esclusivamente come informazione di secondo livello in piccolo, tra parentesi o in tooltip per piloti esperti.
  4. **Tavola di Mappatura Vincolante**:
     - `CAPE (J/kg)` $\to$ Label: `Instabilità / Temporali` | Stato primario: `Calmo / Moderato / Rischio Sovrasviluppo CB` | Dettaglio: `CAPE ${val} J/kg`
     - `LCL (m)` $\to$ Label: `Base Nubi (Cumulo)` | Quota: `${val}m slm` (con delta dal decollo)
     - `EDR / Turbulence` $\to$ Label: `Turbolenza in Termica` | Stato: `Leggera / Moderata / Forte`
     - `Lapse Rate (°C/100m)` $\to$ Label: `Gradiente Termico` | Stato: `Stabile / Instabile`
     - `Vertical Shear` $\to$ Label: `Taglio del Vento` | Stato: `Omogeneo / Gradiente Ripido`



---

## 20. Pattern di Selezione Temporale per il Volo Libero & Prevenzione Timezone Shift UTC
- **Problema**: L'uso di `date.toISOString().split('T')[0]` genera slittamenti di data imprevisti (es. alle ore 23:00 a Roma UTC+2 la data calcolata diventa domani). Inoltre, selettori statici a intervalli generici (`+1, +2, +3 giorni`) lasciano i piloti cechi rispetto alle finestre del weekend a inizio settimana e duplicano bottoni quando un giorno fisso coincide con un preset (es. venerdì dove domani è sabato).
- **Causa Radice**: Serializzazione in formato UTC anziché calendario locale e mancato disaccoppiamento tra il modello di pianificazione del pilota e i controlli generici del browser.
- **Pattern Vincolante**:
  1. *Formattazione Locale Rigorosa*: Utilizzare sempre `formatDateIso(date)` che estrae `getFullYear()`, `getMonth() + 1` e `getDate()` in orario locale, e `parseDateIso(str)` impostando le 12:00:00 (mezzogiorno) per neutralizzare salti da ora legale/solare.
  2. *Preset Intelligenti Dinamici*: Calcolare i preset in base al giorno della settimana (`dayOfWeek`): Lun-Gio mostra Oggi, Domani, Sabato e Domenica; Ven fonde Domani e Sabato; il Weekend espone Oggi, Domani e Prossimo Weekend.
  3. *Iniezione Chip Custom*: Se l'utente seleziona una data specifica via calendario (`openSheet`), iniettare una scheda attiva dedicata mantenendo visibili i preset principali per un ritorno a "Oggi" o "Sabato" con 1 singolo tocco (Cheap Takeover).
  4. *SSOT Reattivo Cross-View*: `store.activeDate` deve governare in modo sincronizzato sia la graduatoria dei comprensori in `HomeDashboardView` sia i dettagli orari in `ForecastView`.

---

## 21. Architettura di Persistenza a Due Livelli per Tracciati IGC (Meta vs Raw Blob)
- **Problema**: Caricare l'intero database dei tracciati IGC in memoria RAM all'apertura del Logbook su dispositivi mobili provoca memory bloat, jank dell'interfaccia e possibili crash da esaurimento memoria (out-of-memory) con centinaia di voli memorizzati.
- **Causa Radice**: Mancata separazione architetturale tra i metadati di consultazione frequente (data, durata, sito, quota max, termiche) e i dati grezzi ad alta densità (coordinate GPS 1Hz, B-records, curve barometriche).
- **Pattern Vincolante**:
  Separare lo storage IndexedDB in 2 entità/store distinte:
  1. `flights_meta`: record leggero contenente solo KPI, metadati e statistiche per il rendering istantaneo delle card del logbook e il calcolo della currency.
  2. `flights_raw`: blob di testo IGC e campionamenti densi, salvati con chiave identica `flightId` e caricati asincronamente on-demand solo ed esclusivamente quando l'utente attiva il visualizzatore 3D.

---

## 22. Strategia di Backup Globale vs Logbook Modulare Indipendente & Auto-Sync
- **Problema**: L'assenza di una strategia di backup espone l'utente alla perdita irreversibile dei voli in caso di pulizia cache/dati del browser da parte dell'OS mobile (Storage Eviction). Inoltre, un backup monolitico inscindibile impedisce al pilota di esportare/importare il solo libretto di volo per migrare su altri dispositivi senza sovrascrivere le preferenze di sistema.
- **Causa Radice**: Trattare la persistenza come un dettaglio implementativo anziché come un requisito critico di affidabilità dei dati del pilota.
- **Pattern Vincolante**:
  Implementare in `core/backupManager.js` due canali indipendenti:
  1. **Full System Snapshot**: Esportazione/importazione JSON completa di LocalStorage (impostazioni, ali, siti custom) + IndexedDB (voli e tracce) con modalità di ripristino sia "Sovrascrittura totale" sia "Smart Merge non distruttivo".
  2. **Dedicated Logbook Backup & Restore**: Esportazione/importazione autonoma del solo archivio voli (`flights_meta` + `flights_raw`), permettendo la conservazione e portabilità del libretto di volo in formato aperto.
  3. **Auto-Sync & Dirty Tracker**: Rilevamento modifiche non salvate in RAM (`syncDirtyTracker`) con notifica non invasiva quando trascorrono >14 giorni o $\ge 3$ voli dall'ultimo backup.

---

## 23. Architettura 3D Replay ad Adapter Unificato (MapLibre Primario con Fallback CesiumJS)
- **Problema**: Il rendering 3D di terreni DEM e traiettorie su MapLibre GL con Three.js CustomLayer presenta complessità critiche di sincronizzazione matriciale, clipping di frustum e lag della telecamera. Legarsi a un unico motore senza alternative rischia di bloccare lo sviluppo in vicoli ciechi insormontabili.
- **Causa Radice**: Mancanza di un'interfaccia astratta di disaccoppiamento tra il controller dell'interfaccia utente (scrubber, HUD, Canvas 2D) e il renderer 3D sottostante.
- **Pattern Vincolante**:
  La vista `FlightReplayView.js` interagisce esclusivamente con l'interfaccia astratta `IReplay3dEngine`:
  - `init(containerEl, trackData, options)`
  - `play()`, `pause()`, `seek(timeMs)`, `setSpeed(multiplier)`
  - `setCameraMode(mode)` (cockpit / chase / orbit)
  - `destroy()`
  - **Engine Primario**: `MapLibreReplayEngine` (MapLibre GL + raster DEM Terrarium + Three.js GLB).
  - **Engine di Fallback Provato**: `CesiumReplayEngine` (CesiumJS standalone con coordinate cartesiane native WGS84, già validato empiricamente in ParaMeteo). Se MapLibre incontra ostacoli o incompatibilità grafiche, lo switch sul fallback Cesium avviene a costo zero di riscrittura della UI e della telemetria.

---

## 24. Ingestione Meteo Mappa a Catalogo Statico vs Bounding Box Dinamico
- **Problema**: Eseguire query batch su Open-Meteo in base al bounding box visibile della mappa ad ogni evento di pan o zoom (`moveend`) genera centinaia di combinazioni variabili di coordinate geografiche, invalidando la cache LRU e consumando rapidamente la quota oraria dell'API (HTTP 429 Too Many Requests).
- **Causa Radice**: Accoppiamento rigido tra gli eventi geometrici di viewport e le chiamate di rete meteorologiche.
- **Pattern Vincolante**:
  La mappa dei comprensori (`SpotMapView.js`) esegue l'ingestione batch esclusivamente sull'elenco statico dei comprensori censiti (`data/locations.json`, ~25-30 coordinate fisse per macro-regione). Tutti gli aggiornamenti visivi su pan, zoom e scrubbing orario operano istantaneamente in RAM sui dati pre-caricati in memoria, con zero chiamate di rete su interazione utente.

---

## 25. Classificazione Semantica della Volabilità Multi-Giorno a 4 Colori (Verde, Giallo, Rosso, Nero) con Accessibilità Outdoor
- **Problema**: Mostrare le 14 date nel calendario senza indicare lo stato di volabilità costringe il pilota a esplorare ogni giorno alla cieca. Inoltre, basare la classificazione esclusivamente sul colore (o gradienti continui) viola WCAG AA ed è illeggibile all'aperto sotto luce solare diretta o su schermi montati su cockpit/imbrago.
- **Causa Radice**: Assenza di sintesi oraria deterministica della finestra di volo (10:00-18:00) e violazione della regola ergonomica sul feedback visivo multimodale (Colore + Simbolo + Testo).
- **Pattern Vincolante**:
  La volabilità su griglia a 14 giorni adotta una scala a 4 stati discreti determinata da `calculateDailyFlyabilitySummary`:
  1. 🟢 **Volabile (Verde / `flyable`)**: finestra attiva $\ge 2\text{h}$, condizioni in asse e sicure, assenza di temporali (`●`).
  2. 🟡 **Cautela (Giallo / `caution`)**: turbolenza o gradiente termico vivace, vento sostenuto o instabilità convettiva pomeridiana (`▲`).
  3. 🔴 **Chiuso (Rosso / `unflyable`)**: vento oltre i limiti di trim speed, traverso marcato, pioggia o sottovento (`✕`).
  4. ⚫ **Severo (Nero / `severe`)**: temporali severi, raffiche estreme $> 35\text{ km/h}$, CAPE $> 1500\text{ J/kg}$, pioggia battente (`⚡`).
  Ogni tessera di calendario combina obbligatoriamente:
  - Bordo inferiore semantico da 3px (`fly-*`).
  - Badge a pillola con icona funzionale (`●`, `▲`, `✕`, `⚡`) e microcopy testuale (`Volabile`, `Cautela`, `Chiuso`, `Severo`).
  - Dot indicatore "Tendenza sinottica" per orizzonti $> 7$ giorni.
  - Legenda semantica esplicita alla base del bottom sheet per chiarire il significato a colpo d'occhio.

---

## 26. Idratazione Progressiva a Due Livelli di Zoom & Cache Entity-Centric per Mappa Meteo
- **Problema**: Eseguire richieste Open-Meteo batch sull'intero catalogo di 134 comprensori genera URL lunghi oltre 4.000 caratteri (errore HTTP 414 URI Too Long) e scarica 5-8 MB di payload JSON su dispositivi mobili. Viceversa, interrogare le API ad ogni evento di zoom o spostamento della mappa provoca raffiche di chiamate ridondanti che superano la quota oraria (HTTP 429).
- **Causa Radice**: Assenza di partizionamento geografico delle coordinate e indicizzazione della cache legata al rettangolo visibile anziché all'entità comprensorio.
- **Pattern Vincolante**:
  1. **Partizionamento Macro-Regionale**: A livello Macro (zoom 5 – 8.9), scaricare solo la macro-regione attiva (Nord-Ovest, Nord-Est, Centro, Sud/Isole o raggio 100 km dal pilota, max 25-30 comprensori, payload $< 500\text{ KB}$, URL $< 800$ caratteri).
  2. **Zero Chiamate a Livello Micro (Zoom $\ge$ 9)**: I dati orari completi (168 ore) sono già residenti in RAM per i comprensori dell'area. Il passaggio a livello micro non esegue chiamate di rete, ma sblocca sul canvas i dettagli vettoriali ad alta fedeltà (cono decollo $T_{\text{best}}$, vento reale a quota decollo, linea di planata sicura verso $L_{\text{safe}}$ con $E_{\text{richiesta}} \le E_{\text{glider}}$).
  3. **Cache Entity-Centric (`spotId`)**: La cache in RAM è indicizzata per ID comprensorio univoco con TTL 30 min. Prima di scaricare, si applica la differenza insiemistica $\text{SpotsDaScaricare} = \text{SpotsNelRaggio} \setminus \text{SpotsInCache}$, con debounce di 400ms su `moveend`.

---

## 27. Salvaguardia Anti-Eviction Mobile IndexedDB & Deduplicazione Deterministica Voli IGC
- **Problema**: Su iOS Safari e alcuni browser Android con storage sotto pressione, IndexedDB può essere eliminato silenziosamente dopo 7 giorni di mancata interazione se l'app non ha lo storage persistente autorizzato dal sistema operativo. Inoltre, il salvataggio o l'importazione ripetuta dello stesso file IGC rischia di creare record duplicati che sballano ore totali e statistiche di currency.
- **Causa Radice**: Affidamento allo storage volatile predefinito del browser e generazione di ID di volo puramente casuali (`crypto.randomUUID()`).
- **Pattern Vincolante**:
  1. **Richiesta Persistenza Esplicita**: Inizializzare `core/logbookDb.js` invocando `navigator.storage.persist?.()` e monitorando `navigator.storage.persisted()`.
  2. **Deduplicazione Idempotente tramite Fingerprint**: Calcolare una chiave univoca deterministica del volo basata su data UTC, ora di decollo, durata e coordinate del primo fix GPS. Se un volo con fingerprint identico esiste già, l'operazione di inserimento aggiorna il record esistente anziché duplicarlo.
  3. **Risoluzione Conflitti nel Ripristino**: Includere in `flights_meta` il campo `updatedAt` (ISO UTC) per governare il merge non distruttivo secondo la regola deterministica Last-Write-Wins.

---

## 28. Pattern Stale-While-Revalidate e Disaccoppiamento Rete nei Controller UI (Zero Spinner Bloccanti Outdoor)
- **Problema**: L'inserimento di fetch di rete bloccanti all'apertura delle viste (con spinner o schermate di attesa a tutto schermo in attesa della risposta di Open-Meteo) paralizza l'interfaccia utente in presenza di connessioni montane degradate o assenti (2G/3G/EDGE o decolli isolati), e rischia di rompere la suite di test in Node.js per dipendenza da endpoint esterni.
- **Causa Radice**: Trattare la rete come pre-condizione sincrona di rendering anziché come stream asincrono opzionale di idratazione dello stato.
- **Pattern Vincolante**:
  1. **Rendering Ottimistico Istantaneo a 0ms**: All'apertura della vista o al cambio spot/data, renderizzare immediatamente a schermo il contenuto utilizzando i dati in cache locale (`cachedWeatherMap` o `store.weatherData`) o, in assenza di cache, il fallback sintetico deterministico.
  2. **Fetch Asincrono non Bloccante in Background**: Nel runtime del browser (`typeof window !== 'undefined'`), lanciare la promessa di rete `fetchWeatherData` in background. Quando la risposta HTTP arriva con successo, aggiornare `store.weatherData` e re-renderizzare il controller in modo trasparente.
  3. **Feedback di Rete Non Intrusivo**: Vietati spinner modali bloccanti a tutto schermo. Utilizzare un badge discreto nella barra superiore (🟢 Live Open-Meteo • aggiornato ${min} fa / 🟡 In aggiornamento... / ⚪ Offline / Stime).
  4. **Isolamento Rigido per Headless Test**: In ambiente Node.js puro (`typeof window === 'undefined'`), nessuna chiamata di rete esterna viene eseguita in automatico, preservando l'esecuzione deterministica dei test a 0ms senza dipendenza da internet.

---

## 29. Pipeline Ibrida per Ingestione e Validazione Spot: Isolamento Staging e Pre-filtro Deterministico
- **Problema**: L'affidamento a un LLM per la validazione geografica degli spot (decolli e atterraggi) introduce allucinazioni numeriche su coordinate, distanze e quote altimetriche. Inoltre, l'aggiornamento diretto del file `data/locations.json` durante lo sviluppo rischia di rompere la sincronizzazione con i controller UI (`HomeDashboardView`, `ForecastView`) e i relativi test.
- **Causa Radice**: Assunzione errata che i modelli linguistici possano sostituire calcoli trigonometrici e topografici deterministici, unitamente alla mancanza di un buffer di staging per i dati territoriali grezzi.
- **Pattern Vincolante**:
  1. **Separazione Rigida tra Calcolo Deterministico e Audit Semantico**: Il clustering geografico (Haversine $\Delta d \le 100\text{ m}$), il controllo di plausibilità altimetrica DEM Copernicus ($|\Delta h| \le 30\text{ m}$) e il calcolo dell'efficienza di planata al decollo ($E \le 7$) sono eseguiti esclusivamente da funzioni pure in Node.js (`core/geoSpatialMath.js`). L'agente o subagent AI interviene solo a valle sui dati pre-filtrati per risolvere ambiguità di toponimi, normalizzare i pericoli (`hazards`) e identificare revoche di concessioni atterraggi da testo libero.
  2. **Isolamento Completo dello Staging (`data/staging-locations.json`)**: Lo script di harvesting e l'agente validatore operano come tooling offline (`scripts/`) senza toccare a runtime il catalogo master. Le modifiche vengono esportate in staging e confluite in `data/locations.json` solo previa verifica manuale o soglia di attendibilità $\ge 80\%$, garantendo zero interferenze con le altre viste dell'applicazione.

---

## 30. Separazione Rigida tra Dati Descrittivi e Metadati di Attendibilità (Anti-Inquinamento Microcopy)
- **Problema**: L'inserimento di tag tecnici tipo `[attendibilità XX%]` all'interno del testo libero delle descrizioni (`description`, `hazards`, `rules`, `shuttle`, `access`) inquina la UI outdoor, vìola i principi del microcopy aeronautico e costringe la logica di business a ricorrere a parsing regex su stringhe.
- **Causa Radice**: Confluenza di note di audit e punteggi di confidenza all'interno dei campi di testo libero durante l'importazione.
- **Pattern Vincolante**: Le metriche di attendibilità e provenienza devono risiedere esclusivamente in campi numerici strutturati (`reliability: number`, `audit: object`). Tutti i campi testuali destinati all'utente devono essere purificati preventivamente tramite `cleanUserText(text)`, eliminando categoricamente qualsiasi tag di attendibilità dal rendering della UI.

---

## 31. Vincolo Mobile Portrait-Only & Salvaguardia Ergonomica con Media Query ad Altezza Minima
- **Problema**: Consentire l'orientamento orizzontale (landscape) su smartphone riduce l'altezza utile netta a soli 240-320px (a causa delle barre del browser e OS). Con la media query desktop classica `@media (min-width: 768px)`, uno smartphone ruotato (es. 844x390px) supera 768px attivando la shell desktop (`#desktop-nav-bar`), nascondendo la bottom bar e facendo collassare timeline sticky, card comprensori e bottom sheets (`SheetManager`). Inoltre, sul decollo i piloti operano il dispositivo a una sola mano (Thumb Zone).
- **Causa Radice**: Breakpoint responsive basati unicamente sulla larghezza (`min-width`) e mancato allineamento tra ergonomia fisica outdoor e modalità di visualizzazione dello schermo.
- **Pattern Vincolante**:
  1. **PWA Manifest Orientation**: Dichiarare obbligatoriamente `"orientation": "portrait-primary"` in `manifest.webmanifest` per vincolare la visualizzazione verticale quando installata su mobile.
  2. **Media Query Desktop con Guardia di Altezza**: Tutti i breakpoint desktop (`#desktop-nav-bar`, `#bottom-nav-bar`, `#main-view`, dialoghi, scrubber) devono richiedere contestualmente larghezza e altezza minime: `@media (min-width: 768px) and (min-height: 550px)`. Questo impedisce a qualsiasi smartphone ruotato di attivare erroneamente l'interfaccia desktop.
  3. **Guardia Visiva Mobile Landscape**: Includere in `index.html` e `theme.css` un overlay ergonomico (`#gm-landscape-guard`) attivo unicamente su touch device con altezza ridotta: `@media (orientation: landscape) and (max-height: 520px) and (max-width: 1000px) and (pointer: coarse)`, che invita il pilota a ruotare il dispositivo in verticale per una consultazione ottimale.

---

## 32. Architettura del Doppio Tema Outdoor: Dark Cockpit & Sunlight Light Mode (Anti-Riverbero Zenitale)
- **Problema**: L'adozione esclusiva di un tema scuro, pur ideale per display OLED e risparmio energetico, genera un forte "effetto specchio" sotto la luce solare zenitale diretta a mezzogiorno sul decollo: il fondo nero riflette il cielo o il volto del pilota anziché emettere luce, rendendo illeggibili testi a basso contrasto. Viceversa, un tema chiaro generico da ufficio (con grigi sfumati e card pastello) sbiadisce completamente all'aperto e non soddisfa i ratio di contrasto WCAG 2.1 AA.
- **Causa Radice**: Assunzione che la leggibilità outdoor dipenda solo dalla polarità dello sfondo (scuro vs chiaro) anziché dalla luminanza differenziale e dal contrasto tra testo e superficie.
- **Pattern Vincolante**:
  1. **Dual High-Contrast Theme Engine**: L'applicazione supporta due temi nativi ad alto contrasto governati da CSS Custom Properties: `dark` (predefinito, cockpit e luce moderata) e `light` ("Sunlight Mode", ad altissima luminanza per luce solare battente), oltre alla modalità `system` (media query OS).
  2. **Palette Sunlight Mode a Contrasto Estremo**: Nel tema chiaro, il fondo primario è bianco ottico/slate ultra-chiaro (`#f8fafc` / `#ffffff`) con testo quasi nero puro (`#0a0c10` / `#0f172a`), garantendo un contrasto $\ge 12:1$ (ben oltre la soglia minima WCAG AA di $4.5:1$).
  3. **Ricalibrazione Semantica dei 4 Colori di Volabilità**: I codici di stato di volabilità (🟢 Verde, 🟡 Giallo, 🔴 Rosso, ⚫ Severo) devono essere ricalibrati con varianti a densità pigmentata più scura sul tema chiaro (`#15803d` anziché verde neon, `#b45309` anziché giallo chiaro, `#b91c1c` anziché rosso chiaro, `#09090b` per severo) per mantenere sempre un contrasto $\ge 4.5:1$ contro lo sfondo.
  4. **Adattamento Mappe e Telemetria Canvas**: La commutazione del tema deve aggiornare sia la palette raster/vettoriale della mappa (`SpotMapView.js`, layer tile chiara vs scura) sia il colore delle tracce altimetriche e termiche sui Canvas 2D per prevenire linee scure invisibili su fondo scuro o viceversa.
  5. **SSOT e Runtime Switch a Zero Ricaricamento**: La selezione del tema risiede in `store.ui.theme`, viene persistita in `localStorage` e si applica in tempo reale a `document.documentElement.dataset.theme` e al meta-tag `<meta name="theme-color">` entro 50ms senza ricaricare la pagina.

---

## 33. Modellazione Campi Scuola e Aree di Ground Handling nel Paradigma Comprensorio
- **Problema**: L'inserimento di campetti scuola o aree pianeggianti per addestramento a terra (controllo vela/kiting) rischiava di generare anomalie di calcolo nel motore aerodinamico (`calculateGlideToLanding`) per assenza di dislivello tra decollo e atterraggio ($\Delta h \approx 0$).
- **Causa Radice**: Assunzione che ogni sito censito corrisponda a un volo montano con dislivello positivo tra cresta e fondovalle.
- **Pattern Vincolante**:
  1. **Unico Binomio Coincidente**: Il campetto scuola viene modellato come Comprensorio autonomo avente un decollo didattico/gonfiaggio e un'area di atterraggio alle medesime coordinate geografiche e medesima quota slm.
  2. **Salvaguardia di Efficienza Aerodinamica**: Con coordinate coincidenti ($D = 0$), `calculateGlideToLanding` produce $E_{\text{richiesta}} = 0$, confermando l'assoluta sicurezza del rientro al suolo ($E_{\text{richiesta}} \le 5.5$) anche per vele scuola EN-A.
---

## 34. Allineamento Tipografico Baseline e Ciclo di Verifica Visivo Obbligatorio (Visual Verification Loop)
- **Problema**: L'inserimento di elementi secondari (es. versione o badge) a fianco di titoli o loghi ha causato gravi disallineamenti verticali su browser reali (elemento sollevato come un esponente/apice), nonostante i test unitari a stringa passassero al 100%.
- **Causa Radice**:
  1. I tag di intestazione (`<h1>`..`<h6>`) ereditano margini verticali non nulli (`margin: ~10px 0`) dallo user-agent stylesheet del browser.
  2. L'utilizzo di classi utility fittizie (es. `items-baseline`, `gap-1.5`) non supportate dal CSS compilato porta flexbox a ripiegare su `align-items: stretch` o `normal`, posizionando lo span privo di margine al limite superiore del blocco.
- **Pattern Vincolante**:
  1. **Annidamento sulla Baseline Tipografica**: Quando un'etichetta accessoria (versione, unità di misura) deve seguire il testo del titolo, annidare il tag `<span class="...-version">` direttamente all'interno dell'`<h1>` (`<h1 class="gm-title">Titolo <span class="gm-version">vX.Y</span></h1>`) con `display: flex; align-items: baseline; gap: 6px; margin: 0; padding: 0;`.
  2. **Classi CSS Esplicite**: Vietato introdurre classi di utility nel markup senza la corrispondente definizione esplicita e verificata in `css/theme.css`.
  3. **Visual Verification Loop con Chrome DevTools**: Prima di dichiarare completato qualsiasi task che impatti il layout, la tipografia o la resa grafica, è obbligatorio innescare un ciclo di verifica visiva tramite `chrome-devtools` (ispezione geometrica `getBoundingClientRect()` o cattura screenshot a diverse risoluzioni 375px/412px), evitando di fidarsi esclusivamente di controlli testuali `html.includes(...)`.

---

## 35. Prevenzione dell'Accavallamento nel Header Mobile & Spaziatura Fitts's Law (Anti-Clustering UI)
- **Problema**: Nel header di Previsioni (ForecastView), Comprensorio Bar, Selettore Sub-Spot e Date Tabs risultavano appiccicati a filo (`0px` di gap) e a contatto con il bordo superiore del viewport mobile, violando i principi Gestalt di Proximity e Common Region.
- **Causa Radice**:
  1. Uso di classi utility non definite nel CSS (`gap-2.5` privo di escape o regola CSS), che causava il fallback a `gap: normal` (`0px`).
  2. Assenza di supporto al `safe-area-inset-top` in `#main-view` e top padding esplicito su `.gm-forecast-view`.
  3. Altezza del sub-spot dropdown inferiore al floor Fitts di 48px (`min-height: 42px`).
- **Pattern Vincolante**:
  1. Definire sempre componenti complessi con classi semantiche dedicate (`.gm-forecast-header`) aventi `gap` e `padding` espliciti in `theme.css`.
  2. Integrare `padding-top: calc(16px + env(safe-area-inset-top, 0px))` nel contenitore `#main-view` e `padding-top: 4px` nella vista per garantire respiro dal bordo/notch.
  3. Uniformare il touch target e i border-radius dei selettori a `min-height: var(--gm-touch-min, 48px)` e `border-radius: var(--gm-radius-md)`.

---

## 36. Progressive Disclosure nei Controlli di Panoramica e Scrubber Temporali (Anti-Naked Numbers)
- **Problema**: L'inserimento di un valore numerico scalare isolato (es. la velocità del vento in km/h senza unità) alla base delle 13 colonne dello scrubber orario ha generato ambiguità cognitiva nell'utente ("cosa indicano i numeri in basso?").
- **Causa Radice**: Violazione della separazione delle responsabilità nei componenti UI e della regola di Shneiderman (*Overview first, details on demand*). Lo scrubber è un controllore temporale di panoramica rapida a colpo d'occhio, non un cruscotto di dettaglio multi-scalare. In colonne da 25px di larghezza, un numero nudo manca di affordance, omette informazioni critiche di sicurezza (raffiche, disallineamento, pioggia) e induce in errore se disallineato dal semaforo di volabilità.
- **Pattern Vincolante**:
  1. **Livello 0 (Scrubber / Timeline)**: Esclusivamente Navigazione + Stato Qualitativo. Lo slot compresso contiene unicamente l'Ora, la Barra di Volabilità semaforica e l'orientamento vettoriale macro (freccia). Zero numeri nudi senza unità.
  2. **Livello 1 (Card di Dettaglio Attiva)**: Tutte le grandezze fisiche quantitative (vento medio, raffica massima, direzione esatta in gradi e punti cardinali, quota, efficienza di planata) appartengono esclusivamente alla scheda di dettaglio sincronizzata (`renderSummaryCard`), dove sono esposte con unità di misura esplicite e contesto completo.
  3. **Accessibilità Completa nei Livelli Compressi**: Le informazioni quantitative omesse graficamente dalla colonna per ragioni di spazio visivo devono rimanere accessibili agli screen reader tramite attributi `aria-label` descrittivi completi (`aria-label="Ore 19:00, Volabile, Vento 9 km/h"`).

---

## 37. Event Delegation nei Componenti Portal / Modal Sheets (Separazione DOM Tra Main View e Dialoghi Sovrimpressi)
- **Problema**: La selezione di una località dal picker comprensori o di una data dal calendario modale non sortiva alcun effetto (clic completamente silente, nessun aggiornamento dello store, mancata chiusura dello sheet).
- **Causa Radice**:
  1. I drawer e modali sono alloggiati in un contenitore dedicato `#sheet-container` collocato in `#app-root` (fratello di `#main-view`) per gestire correttamente z-index e accessibilità (`role="dialog"`).
  2. I view controller collegavano i listener delegati (`this.boundClickHandler`) unicamente a `this.containerEl` (`#main-view`).
  3. Gli eventi di click all'interno di `#sheet-container` risalivano verso `#app-root` e `document` senza mai transitare per `#main-view`, risultando invisibili alla vista attiva.
- **Pattern Vincolante**:
  1. Ogni view controller che genera o controlla fogli modali deve registrare `boundClickHandler` contestualmente su `this.containerEl` e su `this.sheetContainerEl` (`#sheet-container`).
  2. Nel metodo `unmount()`, rimuovere obbligatoriamente il listener da entrambi gli elementi.
  3. L'intero elemento card (`.gm-picker-item`) deve esporre `data-action="pick-spot"` e `data-spot-id`, azzerando i punti morti (dead zones) di tocco lungo i bordi.
  4. I test unitari devono validare il dispatching reale simulando l'interazione sul listener registrato su `sheet-container`.

---

## 38. Continuous Touch & Pointer Dragging negli Scrubber Temporali (In-Place Reactive Scrubbing)
- **Problema**: Lo scrubber orario reagiva esclusivamente al singolo `click`/tap discreto, impedendo lo scorrimento continuo col dito (*slide/drag gesture*) tipico dei jog wheel e delle barre di scrubbing multimediali.
- **Causa Radice**:
  1. La gestione eventi ascoltava solo `click` su `[data-action="select-hour"]`.
  2. L'invocazione di `this.render()` a ogni cambio ora rimpiazzava l'intero `containerEl.innerHTML`, distruggendo il nodo DOM su cui poggiava il dito durante il drag e provocando l'interruzione immediata del tocco (*lost pointer capture*).
  3. Assenza di `touch-action: none` nel CSS dello scrubber, con conseguente innesco del panning/scroll verticale del browser durante il movimento orizzontale.
- **Pattern Vincolante**:
  1. **Pointer Capture & Touch-Action**: Applicare sempre `touch-action: none` e `cursor: ew-resize` sul container dello scrubber. Utilizzare `setPointerCapture(evt.pointerId)` su `pointerdown` per garantire la continuità degli eventi `pointermove` anche se il dito devia verticalmente fuori dalla striscia.
  2. **In-Place Reactive DOM Update (`setHour`)**: Durante lo scrubbing attivo, aggiornare chirurgicamente in place i container interni (`#forecast-spot-card-container`, `#forecast-wind-panel-container`, `#forecast-sounding-panel-container`) e le classi `.active` delle colonne senza distruggere lo scrubber nel DOM. Latenza di aggiornamento $< 2\text{ms}$ (sotto Doherty Threshold).
  3. **Haptic Micro-Feedback**: Emettere un micro-impulso aptico opzionale (`navigator.vibrate(8)`) al passaggio tra le colonne per restituire una percezione fisica tangibile della selezione oraria.

---

## 39. Batch Ingestion Multi-Coordinate Open-Meteo, Indicizzazione Timestamp Multi-Day e Resilienza Offline
- **Problema**: L'interrogazione sequenziale di 30-50 comprensori nella Home causa latenze di rete elevate e rischio di throttling HTTP 429. Inoltre, nei forecast orari multi-giorno (orizzonte 7-8 giorni, 192 ore), l'accesso diretto via indice orario giornaliero `[hourIndex]` (es. `hourIndex = 14`) ricade erroneamente sempre sul giorno corrente (Day 0), ignorando la data target selezionata. Infine, la caduta della connessione rischia di generare sfarfallii se la lettura da cache sovrascrive lo stato offline con uno stato 'live' fittizio.
- **Causa Radice**:
  1. Omissione del supporto alle query multi-coordinate supportate nativamente da Open-Meteo (`latitude=lat1,lat2&longitude=lon1,lon2`).
  2. Presunzione che l'array `hourly.time` contenga esclusivamente le 24 ore della giornata target.
  3. Mancata separazione tra flag di fallimento di rete attivo (`_networkFailed = true`) e presenza di record storici residui in cache.
- **Pattern Vincolante**:
  1. **Batch Ingestion Unificata**: Per dashboard con molteplici località (`HomeDashboardView`), raggruppare tutte le coordinate in un'unica richiesta batch (`fetchBatchComprensoriWeather`), memorizzando i risultati per singolo comprensorio nella cache LRU in-memory.
  2. **Timestamp Prefix Resolution**: In qualsiasi funzione di arricchimento o valutazione (`evaluateComprensorio`), individuare l'indice dell'ora tramite matching esplicito del prefisso data ISO: `timePrefix = targetDate + 'T' + String(hourIndex).padStart(2, '0')`.
  3. **Stale-While-Revalidate & Guardie Offline**: Inizializzare la UI con render ottimistico a 0ms (dati in cache o sintetici). Quando la richiesta di rete fallisce, impostare `networkStatus = 'offline'` e `_networkFailed = true`, impedendo alle letture di fallback sincrone da cache di ripristinare indebitamente il badge 'live'.

---

## 40. Fitts's Law su Viewport Mobili Compatti: Stepper Orario Dedicato, Bonifica Emoji Decorative e Tema Sunlight Mode
- **Problema**:
  1. Su schermi smartphone da 390px, la divisione dello scrubber orario in 13 slot produce colonne larghe ~28px, rendendo il tocco discreto del singolo slot orario difficoltoso con dita fredde o guanti da volo (Fitts's Law).
  2. La presenza di emoji decorative nei controlli e nei titoli riduce la nitidezza e il contrasto visivo all'aperto, violando il principio di sobrietà visiva.
  3. L'uso esclusivo della tavolozza scura genera riflessi speculari sotto la luce solare zenitale diretta in alta montagna.
- **Causa Radice**:
  1. Conflitto geometrico tra l'esigenza di mostrare l'intera finestra diurna a colpo d'occhio (08:00–20:00) senza scroll orizzontale e il target touch minimo ($\ge 44\text{px}$).
  2. Residui di formattazione non strutturata con emoji invece di icone vettoriali semantiche conformi agli standard outdoor.
- **Pattern Vincolante**:
  1. **Stepper Fitts-Compliant**: Mantenere la visualizzazione compressa a 13 colonne per il colpo d'occhio e il dragging continuo, ma affiancarla con due pulsanti stepper (`<` e `>`) con area cliccabile virtuale estesa via pseudo-elemento `::before` a $\ge 44\times 44\text{px}$.
  2. **Iconografia Monocromatica Semantica**: Eliminare emoji decorative da pulsanti e titoli; utilizzare esclusivamente SVG monocromatici scalabili con attributi ARIA corretti.
  3. **Tavolozza Sunlight Light Mode**: Definire le variabili `[data-theme="light"]` con contrasto WCAG AAA ($\ge 7:1$) e sincronizzare reattivamente `document.documentElement` e `<meta name="theme-color">` tramite lo store.

---

## 41. Preferiti Pilota come Filtro Primario della Home e Gestione Migrazione Seed
- **Problema**: Mostrare tutti i comprensori del catalogo nazionale (135 siti) nella Home Dashboard satura la vista con località irrilevanti per il pilota locale (es. siti di altre regioni lontane centinaia di km), degradando la glanceable UI e moltiplicando inutilmente il traffico di rete batch verso Open-Meteo.
- **Causa Radice**: Assenza di un filtro sui preferiti (`pinnedSpotIds`) a livello di radice della vista Home, che delegava il filtraggio esclusivamente alla ricerca testuale anziché al set di siti selezionati dal pilota nella vista Previsioni.
- **Pattern Vincolante**:
  1. **Home Filtrata su Preferiti Pilota**: In assenza di ricerca testuale attiva, la vista Home Dashboard deve istanziare e valutare esclusivamente i comprensori contrassegnati come preferiti (`state.pinnedSpotIds`), mantenendo come default iniziale il set essenziale locale del pilota (Chialamberto, Martiniana Po, Monte Cavallaria).
  2. **Ricerca Espansa On-Demand**: Quando l'utente digita una query di ricerca nella Home, la scansione si espande sull'intero catalogo normalizzato per consentire la rapida consultazione di qualsiasi sito, tornando automaticamente ai soli preferiti una volta cancellata la query.
  3. **Migrazione Trasparente dei Seed Legacy**: In fase di idratazione dello store da `localStorage` (`loadPersistedState`), intercettare le configurazioni seed legacy e migrarle automaticamente ai nuovi default senza richiedere pulizie manuali della cache del browser.
  4. **Stato Vuoto Esplicito & Call-to-Action**: Se l'utente rimuove tutti i preferiti, la lista non deve rimanere vuota o rotta, ma deve renderizzare un feedback esplicito con pulsante di navigazione diretta alla pagina Previsioni per consentire la selezione di nuovi spot con l'icona stella.

---

## 42. In-Flow Flex Docking vs `position: fixed` Subpixel Leakage su Display Hi-DPI
- **Problema**: Su display ad alta densità di pixel (`devicePixelRatio != 1`, es. 1.25, 1.5, 2.0) o con altezze decimali del viewport (es. 669.6px), barre o scrubber posizionati con `position: fixed; bottom: 0;` generano fessure subpixel (0.4px - 1px) attraverso le quali traspaiono elementi della pagina in fase di scorrimento. Inoltre, attribuire un padding artificiale (`pb-48`) al contenitore della pagina consente ai nodi del DOM di scorrere fisicamente sotto i componenti dockati.
- **Causa Radice**: Discretizzazione numerica tra coordinate CSS logiche (floating point) e pixel hardware fisici nei motori di rendering, combinata con layout fixed overlay in cui il contenitore scorrevole non è limitato all'altezza utile effettiva.
- **Pattern Vincolante**:
  1. **In-Flow Flex Shell (Zero Fixed Overlays per Dock Primari)**: `#app-root` deve essere un flexbox a colonna rigido (`display: flex; flex-direction: column; height: 100dvh; max-height: 100dvh; overflow: clip;`).
  2. **Contenitore Utile Scorrevole Autonomo**: I contenuti scorrevoli di ciascuna vista devono essere incapsulati in un contenitore interno (`flex: 1 1 0%; min-height: 0; overflow-y: auto;`), la cui altezza termina esattamente sopra il primo componente dockato.
  3. **Docked Footers come Fratelli Flex In-Flow**: Elementi dockati in basso (come lo scrubber orario `.gm-timeline-scrubber-sticky` e la barra di navigazione `#bottom-nav-bar`) devono essere posizionati in-flow nel flexbox (`position: relative; flex-shrink: 0; width: 100%;`), garantendo adiacenza geometrica perfetta (0px di gap) e assenza totale di elementi scorrevoli al di sotto.
  4. **Sigillo Anti-Leak**: Applicare `overflow: clip` ad `#app-root` e `overflow: hidden` ad `html, body` e `#sheet-container`.

---

## 44. Catalogo Modelli di Parapendio, Filtro per Costruttore e Deduzione Aerodinamica Automatica per Vele Custom (Postel's Law / Tesler's Law)
- **Problema**: Limitare la selezione dell'attrezzatura di volo alle sole 4 classi generiche EN-A..EN-D obbliga il pilota ad approssimare la propria ala reale e non permette di memorizzare marca e modello specifici (es. "Ozone Buzz Z7", "Advance Iota DLS"). Al contempo, forzare l'utente a inserire manualmente parametri fisici complessi (velocità di trim, velocità di affondo, efficienza massima, allungamento alare) introduce forte attrito operativo e rischio di errori manuali.
- **Causa Radice**:
  1. Assenza di una base dati di ali certificate e categorizzate per costruttore.
  2. Modelli di configurazione che scaricano la complessità dei parametri fisici sull'utente anziché risolverla via software (violazione della Tesler's Law).
- **Pattern Vincolante**:
  1. **Catalogo Modelli Certificato Headless (`core/gliders.js`)**: Mantenere un catalogo curato e verificato empiricamente di oltre 50 modelli iconici dei principali 14 costruttori mondiali, con attributi completi (`brand`, `model`, `category`, `vTrim`, `vMax`, `glideRatio`, `ar`).
  2. **Interfaccia a Selezione Rapida (Filtri a Chip & Ricerca Istantanea)**: Nel modal sheet di selezione della vela, offrire una riga orizzontale a scorrimento di chip per marca (`.gm-glider-brand-chips`) combinata con una casella di ricerca reattiva a testo libero (`#glider-search-input`), azzerando il tempo di selezione a meno di 2 tap.
  3. **Deduzione Aerodinamica Automatica (Tesler's Law)**: In caso di modelli non ancora a catalogo, permettere l'inserimento libero di marca e modello; i parametri aerodinamici fondamentali vengono calcolati e dedotti automaticamente dalla classe EN indicata (`getGliderClassDefaults(category)`).

---

## 45. WAI-ARIA Focus Retention su Modali Nascosti e Discrepanza Interfaccia Router (`navigate` vs `navigateTo`)
- **Problema**:
  1. Alla chiusura dei pannelli o fogli modali (`#sheet-container`), i browser Chromium bloccano l'attributo emettendo l'avviso/errore: `Blocked aria-hidden on an element because its descendant retained focus. Avoid using aria-hidden on a focused element or its ancestor.`
  2. Al click su una località/comprensorio nella Home Dashboard per aprire il meteo, l'applicazione si blocca con `Uncaught TypeError: this.router.navigateTo is not a function`.
- **Causa Radice**:
  1. In `ui/sheetManager.js`, `containerEl.setAttribute('aria-hidden', 'true')` veniva invocato prima che il focus venisse rimosso o ripristinato dall'elemento figlio cliccato (es. `<button class="gm-glider-option-card">`), violando le specifiche WAI-ARIA 1.2 che vietano `aria-hidden="true"` su un nodo che contiene `document.activeElement`. Inoltre, `#sheet-container` non impiegava l'attributo standard `inert`.
  2. In `ui/router.js`, il metodo canonico di instradamento è sempre stato denominato `navigate`, mentre in `HomeDashboardView.js` e `ForecastView.js` veniva invocato `this.router.navigateTo`. Nei test unitari, mock ad-hoc implementavano `navigateTo`, mascherando il disallineamento rispetto al router reale singleton.
- **Pattern Vincolante**:
  1. **Focus Evacuation & Inert Marking**: Prima di applicare `aria-hidden="true"` ad un contenitore modale in fase di chiusura (`closeSheet`), verificare se `containerEl.contains(document.activeElement)`. Spostare immediatamente il focus sul trigger di apertura precedente (`previousActiveElement`) oppure invocare esplicitamente `document.activeElement.blur()`. Contestualmente, applicare l'attributo standard `inert` (`containerEl.setAttribute('inert', ''); containerEl.inert = true;`) quando chiuso e rimuoverlo all'apertura (`containerEl.removeAttribute('inert'); containerEl.inert = false;`).
  2. **Interfaccia Router Resiliente**: `createRouter` in `ui/router.js` deve esportare l'alias `navigateTo: navigate`. Contestualmente, i view controller devono disporre di un metodo proxy sicuro `navigateTo(route, params)` che invoca `this.router.navigate || this.router.navigateTo`, garantendo robustezza assoluta sia con il router reale che con qualsiasi mock di test.
  3. **Zero Faux-Testing sui Router Mock**: Nei test unitari, i contratti mockati devono riflettere l'API standard del router singleton (`navigate`), evitando asimmetrie tra ambiente di collaudo e runtime browser di produzione.

---

## 46. Collapsing Sticky Header per Continuità Cognitiva su Scroll (Recognition over Recall) & Defensive DOM Guards
- **Problema**:
  1. Durante lo scorrimento verso il basso in `ForecastView` (per consultare diagrammi del vento, radiosondaggi e briefing di Guido), i selettori di comprensorio e decollo scorrono fuori dal viewport. Il pilota perde l'ancoraggio visivo su quale decollo e quota siano selezionati, rischiando errori di valutazione sull'allineamento anemometrico del pendio (violazione dell'euristica NN/G #6 *Recognition over Recall*).
  2. L'aggiunta di listener di scroll sul contenitore ha provocato fallimenti nei test unitari con mock container minimalistici: `TypeError: this.containerEl.querySelector is not a function`.
- **Causa Radice**:
  1. Header monolitico che scorre interamente con il corpo della pagina, in assenza di una testata contestuale collassabile.
  2. Assunzione indebita della presenza di `querySelector` in mock container headless privi di layout engine o API DOM complete.
- **Pattern Vincolante**:
  1. **Collapsing Sticky Header Monofila GPU-Accelerato (`.gm-forecast-sticky-bar`)**: Posizionato con `position: absolute; top: 0; left: 0; right: 0; z-index: 25;` all'interno della vista relativa. A riposo (`scrollTop <= 60px`) è nascosto con `transform: translateY(-100%); opacity: 0; pointer-events: none`. Quando `scrollTop > 60px`, scivola in vista (`transform: translateY(0); opacity: 1; pointer-events: auto`) mantenendo visibili comprensorio, decollo attivo con quota e orientamento, badge di freschezza dati (`Live Open-Meteo` o `Offline`) e pulsante di scroll-to-top rapido (`data-action="scroll-to-top"`).
  2. **Zero Layout Thrashing & Zero CLS**: Nessun reflow del contenitore scorrevole (CLS = 0) e listener di scorrimento passivo (`{ passive: true }`).
  3. **Guardie Difensive su Metodi DOM (`typeof querySelector === 'function'`)**: In tutti i view controller e componenti, verificare sempre `typeof this.containerEl.querySelector === 'function'` prima di invocare selettori avanzati o manipolare listener su sotto-nodi, garantendo compatibilità al 100% sia con i browser reali sia con i mock semplificati dei test unitari.

---

## 47. Vocabolario Semantico Aeronautico vs Modello Struttura Fisica: Volabilità ('Volabile' / 'Non Volabile' vs 'Aperto' / 'Chiuso')
- **Problema**: L'adozione dei termini "Aperto" e "Chiuso" per indicare la volabilità nelle card dei comprensori provocava disorientamento cognitivo nel pilota, inducendolo a credere che il sito fosse interdetto fisicamente, recintato o chiuso da un'ordinanza amministrativa, anziché indicare una condizione meteorologica avversa (es. raffiche forti). Inoltre, creava asimmetria rispetto alla legenda del calendario che riportava già "Volabile".
- **Causa Radice**: Trasposizione acritica di convenzioni UI da stazioni sciistiche o strutture commerciali chiuse/aperte verso un'applicazione di volo libero in cui i decolli montani sono siti naturali governati esclusivamente da aerologia e micro-meteorologia.
- **Pattern Vincolante**:
  1. **Terminologia di Dominio Aeronautica**: Utilizzare sempre la scala semantica di volabilità espressa dal punto di vista dell'ala e del pilota:
     - 🟢 **`Volabile`** (al posto di *Aperto*)
     - 🟡 **`Cautela`** (condizioni impegnative o al limite operativo)
     - 🔴 **`Non Volabile`** (al posto di *Chiuso*)
     - ⚫ **`Severo`** (turbolenza estrema, temporali o NO-FLY)
  2. **Coerenza Orizzontale Trasversale**: Mantenere la stessa identica etichettatura testuale in tutti i layer: algoritmo di sintesi comprensorio ([`core/comprensorio.js`](file:///c:/github/GlideMind/core/comprensorio.js)), resolver giornaliero ([`core/flyability.js`](file:///c:/github/GlideMind/core/flyability.js)), preset date ([`core/datePresets.js`](file:///c:/github/GlideMind/core/datePresets.js)), legende del calendario e badge a colpo d'occhio ([`ui/views/HomeDashboardView.js`](file:///c:/github/GlideMind/ui/views/HomeDashboardView.js), [`ui/views/ForecastView.js`](file:///c:/github/GlideMind/ui/views/ForecastView.js)).

---

## 48. Lingua Inglese Esclusiva nel Codice Sorgente e Governance Regole Antigravity
- **Problema**: In assenza di una direttiva prescrittiva montata nel system prompt globale e di workspace, l'agente può introdurre commenti, identificatori, descrizioni di test o messaggi di errore in italiano o linguaggi misti, degradando la leggibilità e l'interoperabilità del codebase. Inoltre, se un workspace non possiede il file canonico `AGENTS.md` alla radice, le specifiche in `.agents/rules/` rimangono dormienti e non vengono iniettate all'avvio.
- **Causa Radice**: Mancata formalizzazione dello standard nel plugin globale `engineering-workflow` e assenza del file root `AGENTS.md` nel workspace per l'ingestion gerarchica di Antigravity.
- **Pattern Vincolante**:
  1. **Standard Globale (`engineering-workflow/rules/AGENTS.md`)**: Tutto il codice sorgente (nomi di variabili, funzioni, classi, file, commenti `//`, docstring JSDoc, test unitari `describe`/`it`, eccezioni e commit Git) deve essere redatto esclusivamente in lingua inglese. L'interfaccia utente (UI copy e file di localizzazione) segue la lingua target di prodotto, mantenendo chiavi e commenti in inglese.
  2. **Attivazione Workspace (`AGENTS.md`)**: La radice del repository deve sempre ospitare `AGENTS.md` con l'inclusione attiva dei vincoli architetturali (`@[...]`), garantendo il montaggio deterministico delle direttive in ogni sessione.

---

## 49. Neutralità del Selettore Temporale nelle Viste Multi-Sito vs Viste Dettaglio
- **Problema**: Mostrare badge o dot di volabilità (es. "Volabile", "Non Volabile") nel selettore di data della Home Dashboard induceva un grave bias cognitivo e di sicurezza per il pilota: mancando uno spot selezionato, il calcolo ripiegava silenziosamente sul primo comprensorio del catalogo (Monte Cornizzolo). Se a Cornizzolo c'era vento forte da Sud, il calendario indicava la giornata come "Non Volabile", inducendo il pilota a credere che l'intera regione non fosse volabile, mentre in altre vallate con diversa esposizione le condizioni erano ottimali.
- **Causa Radice**: Sovrapposizione indebita tra il selettore di navigazione temporale di una vista aggregata multi-sito (Home) e il calendario di valutazione micro-meteorologica di un singolo sito montano (`ForecastView`).
- **Pattern Vincolante**:
  1. **Selettore Date Neutro nelle Viste Globali/Catalogo (`HomeDashboardView`)**: Quando il contesto operativo comprende molteplici comprensori orograficamente diversi, il selettore date (quick tabs e bottom sheet calendario) deve rimanere **neutro** (date, giorni, mesi, indicatore di orizzonte sinottico per > 7gg), senza dot o badge di volabilità ancorati a spot sentinella arbitrari e senza legende semantiche per singolo sito. Il suo scopo esclusivo è consentire il cambio di data per filtrare e riordinare la classifica dei comprensori.
  2. **Valutazione Semantica Riservata alle Viste di Dettaglio (`ForecastView`)**: I badge a 4 colori (Verde, Giallo, Rosso, Nero) e la legenda semantica sono riservati esclusivamente alle viste in cui il decollo primario e l'atterraggio sono noti, univoci ed esplicitati al pilota.

---

## 50. Contratti Operabili da Tastiera e Affordance Navigazionale delle Card Dashboard (Jakob's Law & WCAG POUR)
- **Problema**: L'uso di elementi semantici contenitore (`<article>`) per card cliccabili in dashboard responsive le rende invisibili agli screen reader come controlli azionabili e inaccessibili da tastiera (`Tab`, `Enter`, `Space`). Inoltre, in assenza di chevron o indicatori visuali espliciti, l'utente fatica a percepire immediatamente che la card sia un target d'azione a tutta area verso una vista di dettaglio (`ForecastView`).
- **Causa Radice**: Affidamento esclusivo all'evento mouse `click` su un elemento non interattivo per default nel DOM senza implementare il pattern WAI-ARIA Card Navigation.
- **Pattern Vincolante**:
  1. **Semantica Interattiva**: Quando una card svolge la funzione di pulsante di navigazione verso un'altra vista, deve esporre esplicitamente `role="button"` e `tabindex="0"`.
  2. **Event Delegation Tastiera**: Il controller della vista deve intercettare gli eventi `keydown` sui target con `role="button"`, attivando la navigazione su tasti `Enter` e `Space` (`e.preventDefault()`).
  3. **Visual Affordance (Jakob's Law)**: Includere sempre una chevron di avanzamento (`.gm-spot-chevron`) e uno stile `:focus-visible` ad alto contrasto per confermare visivamente la destinazione dell'interazione.
  4. **Robustezza di Ricerca (Postel's Law)**: Nelle barre di ricerca filtri, normalizzare sempre la query e i campi target con rimozione dei diacritici Unicode (`normalize('NFD').replace(/[\u0300-\u036f]/g, '')`), consentendo il matching tollerante a prescindere da accenti o formattazioni. Estendere la ricerca a decolli e atterraggi secondari del comprensorio.
  5. **Event Delegation su Container Persistente (`input`)**: I listener per campi di input di ricerca non devono essere agganciati direttamente al singolo elemento `input` (che viene ricreato a ogni re-render asincrono della vista indotto da store o caricamento catalogo), bensì delegati sul contenitore principale persistente (`this.containerEl.addEventListener('input', ...)`), garantendo che l'interazione da parte dell'utente non si disattivi mai.
  6. **Soppressione Controlli Nativi Duplicati nei Campi `type="search"`**: Quando si implementa un pulsante custom di cancellazione (per garantire target touch outdoor $\ge 44\text{px}$ conforme a Fitts), è obbligatorio sopprimere via CSS i bottoni nativi del browser (`.gm-search-input::-webkit-search-cancel-button { -webkit-appearance: none; display: none; }`) per prevenire la comparsa di due icone 'X' affiancate.

---

## 51. Governance UX Dati Meteo Offline & Gestione Dati Non Disponibili (Zero Mock Mascherati)
- **Problema**: In assenza di connessione o selezionando una data futura non presente in cache, le card degli spot mostravano parametri meteo concreti (es. "15 km/h da SW", "Raffiche Moderate") e verdetti di volo ("CAUTELA", "NON VOLABILE") calcolati su costanti di fallback o su cache di giorni precedenti, mentre il badge di stato rimaneva bloccato in "AGGIORNAMENTO...". Questo induceva nel pilota la convinzione ingannevole e pericolosa che esistesse una reale previsione per quella data.
- **Causa Radice**: 
  1. `evaluateComprensorio` nel Core iniettava valori sintetici arbitrari (`windSpeed = 12`, `windDir = 180`) quando `weatherData` era `null`.
  2. La mappa cache della Home indicizzava i payload unicamente per `spotId` anziché per `spotId_targetDate`.
  3. Il fallimento o l'assenza di dati nella chiamata batch non commutava lo stato di loading allo stato terminale offline.
  4. `fetchBatchComprensoriWeather` richiedeva staticamente solo 2 giorni di previsione (`forecast_days = 2`).
- **Pattern Vincolante**:
  1. **Divieto di Dati Mascherati (Zero Placebo)**: Se non esistono dati orari reali in cache per la data attiva, la card DEVE mostrare lo stato neutro `Dati N/D` (`.gm-badge-nd`), sostituire il vento con `-- km/h` ed esplicitare `Previsione non disponibile offline`. È vietato calcolare verdetti o visualizzare direzioni/raffiche stimate.
  2. **Preservazione Geometria Orogrorafica**: L'efficienza geometrica di planata tra decollo e atterraggio primari (`1:X.X`) e le quote devono essere sempre visualizzate poiché sono costanti geografiche certe e non dipendono dalla rete.
  3. **Tassonomia dei 3 Stati**: Distinguere rigorosamente tra Cache Valida (`Offline / Stima`), Assenza Dati (`Dati N/D`) e Transitorio di Caricamento (Skeleton screen a struttura fissa anti-CLS se privi di cache).
  4. **Chiusura Deterministica del Loading**: Qualsiasi operazione asincrona di fetch deve ripulire la guardia `isLoading` in blocco `finally` e commutare il badge su `'offline'` in caso di insuccesso.

---

## 52. Ergonomia Date Picker Mobile (Scroll-Snap Orizzontale), Contrasto Sunlight WCAG AA e WAI-ARIA Tablist Compliance
- **Problema**:
  1. Su viewport mobile stretti ($\le 390\text{px}$, es. iPhone SE o schermi Android da 360px), i pulsanti preset data (4 preset + calendario + eventuale data custom attiva) superano la larghezza orizzontale utile, causando a capo irregolari o inducendo lo scorrimento orizzontale accidentale dell'intero viewport applicativo, violando il vincolo *Zero Horizontal Scrollbar*.
  2. Nei contenitori con semantica `role="tablist"`, la presenza di controlli privi di `role="tab"` e `aria-selected` corrompe l'albero di accessibilità WAI-ARIA.
  3. Nella modalità ad alta luminanza (*Sunlight Mode* / `[data-theme="light"]`), il testo bianco `#ffffff` sui pulsanti e tab attivi color ambra (`--gm-accent: #d97706`) presenta un contrasto di appena 3.2:1, fallendo il requisito WCAG AA ($\ge 4.5:1$) e compromettendo la leggibilità sotto la luce solare diretta.
  4. Nei controller delle viste, eseguire `store.setState({ activeDate })` e contestualmente invocare manualmente `render()` e chiamate asincrone di rete genera doppi rendering e doppie query di rete, poiché il listener reattivo dello store scatta sincronicamente alla mutazione dello stato.
- **Causa Radice**:
  1. Assenza di confinamento orizzontale con snap sul container flex `.gm-date-tabs`.
  2. Markup bottoni eterogeneo senza semantica ARIA uniforme dentro la tablist.
  3. Mancata sovrascrittura del colore testo per elementi attivi/selezionati nel tema chiaro.
  4. Ridondanza tra dispatching reattivo dello store e invocazione procedurale all'interno dei gestori di click.
- **Pattern Vincolante**:
  1. **Scroll-Snap Carousel a Riga Singola**: I tab orizzontali su mobile devono adottare sempre `display: flex; flex-wrap: nowrap; overflow-x: auto; scroll-snap-type: x mandatory; touch-action: pan-x; -webkit-overflow-scrolling: touch; scrollbar-width: none;` con figli diretti a `flex-shrink: 0; scroll-snap-align: start; min-height: 48px;`.
  2. **WAI-ARIA Tablist Uniforme**: Qualsiasi controllo interattivo all'interno di `role="tablist"` deve esporre `role="tab"` ed esplicitare `aria-selected="true|false"`.
  3. **High-Contrast Dark Text su Sfondo Chiaro Ambra**: In `[data-theme="light"]`, gli elementi con classe `.active` su sfondo `--gm-accent` devono adottare colore scuro `#09090b`, garantendo un rapporto di contrasto $\ge 8.5:1$ conforme a WCAG AA/AAA.
  4. **Single Source of Truth nei Click Handler**: Quando un click handler commuta lo stato applicativo tramite `store.setState`, la vista deve delegare l'aggiornamento visuale e il recupero dati al listener reattivo dello store, evitando duplicazioni di rendering e traffico di rete ridondante.

---

## 53. Visibilità dei Modal Sheet e Coerenza di Transizione Scale/Opacity in Modalità Desktop
- **Problema**: In modalità desktop (`min-width: 768px` e `min-height: 550px`), cliccando sul pulsante del date picker (o su qualsiasi altro drawer/sheet gestito da `openSheet()`, come il selettore comprensori o il selettore delle vele), lo schermo si oscurava con il backdrop, ma la finestra modale non appariva, risultando completamente invisibile.
- **Causa Radice**:
  1. Nella media query desktop, `.gm-sheet` è configurato come dialogo modale centrato a transizione di scala (`transform: scale(0.95); opacity: 0;`).
  2. All'attivazione dello sheet (aggiunta della classe `.active` a `#sheet-container`), la regola CSS base a livello globale impostava solo `transform: translateY(0);` senza specificare `opacity: 1;`.
  3. Nella media query desktop mancava la dichiarazione per `#sheet-container.active .gm-sheet`, lasciando l'opacità bloccata a zero (`opacity: 0`). Di conseguenza, il pannello veniva renderizzato a schermo ma con il 100% di trasparenza.
- **Pattern Vincolante**:
  1. **Garanzia di Opacità Attiva**: Qualsiasi stato attivo di un contenitore di overlay deve forzare esplicitamente `opacity: 1;` sia nella dichiarazione di default mobile (`#sheet-container.active .gm-sheet { transform: translateY(0); opacity: 1; }`) sia nelle varianti desktop centrate (`#sheet-container.active .gm-sheet { transform: scale(1); opacity: 1; }`).
  2. **Soppressione Controlli Touch Mobile su Desktop**: Nelle viste modali desktop, nascondere sempre elementi di trascinamento touch concepiti esclusivamente per smartphone (`.gm-sheet-handle-bar { display: none; }`).
---

## 54. Ergonomia dello Scrubber Orario: Profilo Continuo Ultracompatto, Indicatore 'ORA' Situazionale e Contrasto WCAG 2.1 Non-Text
- **Problema**:
  1. Nello scrubber orario sticky di `ForecastView`, la presenza dell'header superiore con il testo "Scrubber Orario" e il controllo stepper `< ORE SELEZIONATE: 10:00 >` introduceva gergo tecnico interno, duplicava l'informazione già visibile nella colonna selezionata e consumava ~36-40px verticali preziosi su schermi smartphone a `100dvh`.
  2. Quando l'utente consulta le previsioni del giorno stesso ("oggi"), mancava qualsiasi indicatore per distinguere l'ora reale corrente (`now`) dalle ore passate o future, degradando la *situational awareness*.
  3. L'indicatore di volabilità era una barretta sottile (9px) a riempimento parziale (30% per non volabile = appena 9.6px di altezza), risultando invisibile all'aperto a distanza di braccio.
  4. In modalità chiara (`[data-theme="light"]`), lo slot della capsula (`#e2e8f0`) su sfondo bianco card (`#ffffff`) aveva un contrasto di appena 1.27:1 (fallimento del requisito WCAG 2.1 SC 1.4.11 $\ge 3:1$ per componenti grafici/UI), scomparendo sotto luce solare diretta.
- **Causa Radice**:
  1. I controlli stepper erano stati concepiti come mitigazione per target discreti stretti prima che venisse implementato lo scorrimento continuo orizzontale a trascinamento (*drag/slide gesture* con pointer capture).
  2. Mancanza di correlazione tra `this.activeDate` e l'orologio di sistema locale.
  3. Approccio a colonnina di mercurio percentuale inadatto a comunicare un segnale qualitativo semaforico.
  4. Assenza di bordo di contrasto e sfondo definito per lo slot della barra in tema chiaro.
- **Pattern Vincolante**:
  1. **Scrubber a Profilo Singolo Puro**: Rimuovere gli header tecnici e i controlli duplicati. La timeline oraria è un carosello continuo a 13 slot (08..20) interattivo via tocco e scorrimento a trascinamento orizzontale continuo, con supporto tastiera (frecce sinistra/destra).
  2. **Marcatore Situazionale 'ORA' (Today)**: Quando `this.activeDate === formatDateIso(new Date())`, la colonna corrispondente a `currentHour` riceve la classe `.is-now` con badge assoluto `.compact-now-badge` ("ORA") posizionato a zero displacement flex, mentre le ore passate (`h < currentHour`) ricevono attenuazione visiva (`.is-past` a opacità 0.6 quando non attive).
  3. **Visibilità Semaforica Potenziata**: Larghezza della capsula estesa da 9px a **14px**, con sfondo colorato abbinato allo stato (`var(--gm-status-*-bg)`) e riempimento solido ad alto contrasto (100% per volabile, 65% per cautela, 35% per non volabile).
---

## 55. Prevenzione Artefatti Sticky Hover & Focus su Scrubbers e Slider Touch (Pointer Capture)
- **Problema**: Eseguendo lo swipe con il dito sullo scrubber orario (es. toccando l'ora 12 e trascinando fino all'ora 17), l'ora iniziale (12) manteneva uno sfondo evidenziato bluastro (`#2e3549`), facendo apparire contemporaneamente due colonne selezionate.
- **Causa Radice**:
  1. **Sticky Hover su Schermi Touch**: I browser mobile (WebKit/Blink) emulano gli eventi mouse al tocco. La regola `.gm-timeline-col-compact:hover { background-color: var(--gm-bg-hover); }` priva di media query faceva sì che l'elemento inizialmente toccato conservasse permanentemente la pseudo-classe `:hover` (`#2e3549`) anche dopo che il dito si era spostato su un'altra colonna.
  2. **Stale Focus**: L'elemento iniziale con `tabindex="0"` riceveva il focus DOM al `pointerdown`, mantenendo lo stato `:focus` fino a un successivo tocco esterno.
  3. **Rischio Synthetic Click**: Al rilascio del dito dopo il trascinamento (`pointerup`), il browser poteva emettere un evento sintetico `click` sull'elemento originario.
- **Pattern Vincolante**:
  1. **Hover Confinato a Dispositivi con Mouse**: Includere sempre qualsiasi regola `:hover` per elementi di scrubber/slider all'interno di `@media (hover: hover) and (pointer: fine)`. Su dispositivi touch (`hover: none`), l'hover è disattivato alla radice.
  2. **Roving Tabindex**: Impostare `tabindex="0"` esclusivamente sulla colonna attiva (`isActive`), e `tabindex="-1"` su tutte le altre.
  3. **Blur Deterministico al Pointer Interaction**: Invocare `document.activeElement.blur()` su `handlePointerDown` e `handlePointerUp` se il focus risiede all'interno del container della timeline.
  4. **Guardia Anti-Trailing Click**: Tracciare lo spostamento orizzontale durante il pointer move (`hasDraggedPointer = true` se $\Delta x > 4\text{px}$) e sopprimere l'azione `select-hour` nei gestori di `click` sintetici successivi.

---

## 56. Indicatori Qualitativi a 4 Stati (Verde, Giallo, Rosso, Nero) nella Triage Home e Prevenzione Starvation Flexbox nei Nomi dei Decolli
- **Problema**: Includere numeri grezzi (km/h, gradi, rapporto 1:X) incapsulati in capsule pesanti con sfondi colorati e bordi (`.gm-ind-pill`) nella riga decollo/atterraggio della Home Dashboard creava un sovraccarico visivo anti-Gestalt (violazione della **Legge di Prägnanz** con badge multipli in competizione nella stessa card). Inoltre, la larghezza combinata delle due capsule a destra (>240px) affamava il contenitore flessibile di sinistra, provocando il troncamento severo del nome del decollo (es. `Ciavanis` troncato in `(1780`).
- **Causa Radice**:
  1. Utilizzo improprio di contenitori stile badge (`border`, `background`, `padding`) per indicatori semaforici secondari all'interno di una card che possiede già un badge primario di verdetto (`VOLABILE`).
  2. Violazione del principio di progressive disclosure: esposizione obbligatoria dei numeri fisici inline invece di delegarli a tooltip/progressive disclosure o schermi larghi.
  3. Gestione flexbox asimmetrica: `.gm-flight-data` aveva `white-space: nowrap; flex-shrink: 0;` mentre `.gm-flight-target` veniva compresso a larghezza zero prima dell'altitudine.
- **Pattern Vincolante**:
  1. **Indicatori Semaforici Senza Bordo e Senza Sfondo (`background: transparent; border: none; padding: 0;`)**: I sub-indicatori di riga devono consistere unicamente in un dot circolare semaforico da 6.5px (`.gm-ind-dot`) con bagliore coerente allo stato e label testuale ad alta leggibilità (`0.72rem`, `font-weight: 600`).
  2. **Quattro Stati Aereonautici Vincolati al Calcolo di Dominio (SSOT Vela)**:
     - 0 (Verde / Volabile / Ottimale): `Vento OK`, `In asse`, `Rientro agevole`.
     - 1 (Giallo / Cautela / Marginale): `Sostenuto`/`Raffiche mod.`, `Traverso`, `Nel cono`.
     - 2 (Rosso / Non Volabile / Critico): `Vento forte`/`Raffiche forti`, `In coda`, `Rientro critico`.
     - 3 (Nero / Pericoloso / NO FLY): `NO FLY`, `Sottovento`, `Fuori cono`. (In dark mode: dot nero bordato in rosso pericolo `1.5px solid #ef4444`).
  3. **Progressive Disclosure dei Numeri Fisici**: I numeri di dettaglio (`15 km/h`, `da SW 212°`, `1:2.5`) risiedono nell'attributo `title` per l'ispezione/hover e in una classe `.gm-ind-micro` nascosta di default su mobile (`display: none`), preservando il budget di larghezza degli indicatori a $\le 110\text{px}$.
  4. **Protezione Layout Flexbox con Altitudine Inviolabile**: Nel contenitore `.gm-flight-label`, impostare `min-width: 0; flex: 1 1 auto;`, su `.gm-flight-target` impostare `min-width: 0; flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis;` e su `.gm-flight-alt` impostare tassativamente `flex-shrink: 0;`. Ciò garantisce che i nomi dei decolli/atterraggi dispongano sempre di oltre 180px di respiro, eliminando ogni rischio di troncamento.





---

## 57. Shift-Left Quality Gate vs Reattività Post-Hoc: Dai Controlli Successivi ai Vincoli Generativi
- **Problema**: Il processo di sviluppo ricorreva a cicli iterativi di rework: (1) richiesta utente $\to$ (2) implementazione del flusso principale $\to$ (3) riscontro utente di difetti grafici, acronimi crudi o violazioni ergonomiche $\to$ (4) invocazione manuale degli audit (`laws-of-ux-audit`, `novice-pilot-auditor`, regression testing) $\to$ (5) reiterazione correttiva.
- **Causa Radice**: Trattare i vincoli ergonomici, le leggi UX e le specifiche di vocabolario aeronautico come *controlli diagnostici ex-post* invocati su richiesta anziché come *vincoli generativi obbligatori ex-ante* (Shift-Left).
- **Pattern Vincolante**:
  1. **Adozione del Protocollo Shift-Left**: Prima di presentare qualsiasi codice all'utente, l'agente deve applicare autonomamente la matrice a 5 Gate (`.agents/rules/shift_left_quality_gate.md`).
  2. **Automated Governance Gate (`shiftLeftGovernance.test.mjs`)**: La suite `npm test` include asserzioni automatiche su isolamento headless, traduzione fenomenologica obbligatoria (divieto di acronimi crudi isolati come CAPE o LCL), divieto di numeri nudi (`compact-wind`), floor Fitts $\ge 48\text{px}$, protezione landscape mobile e conformità al tema chiaro Sunlight Mode.
  3. **Zero Turn Yielding su Codice Non Conforme**: Vietato restituire il turno con la sola implementazione logica delegando all'utente la verifica visiva ed ergonomica. Il codice consegnato deve già incorporare tutte le protezioni di layout, vocabolario e accessibilità.

---

## 58. Badge di Stato a Simbolo Geometrico Avionico (WCAG 1.4.1), Chip di Filtro Rapido Volabilità (Hick's Law) ed Explainability Multi-Rischio
- **Problema**:
  1. Le scritte di testo estese ("NON VOLABILE", "CAUTELA", "VOLABILE") nelle pillole dei comprensori consumavano 75-90px di spazio orizzontale su schermi mobile da 390px, aumentando il rischio di troncamento dei nomi dei siti o competendo visivamente con la freccia di espansione. Rimuovere completamente il testo affidandosi solo al colore viola il requisito WCAG 2.1 SC 1.4.1 (Use of Color), rendendo l'interfaccia inaccessibile a piloti con deficit visivi (daltonismo) o con lenti da sole polarizzate in pieno giorno.
  2. In giornate meteorologiche marginali o avverse, scorrere decine di comprensori senza poter filtrare a colpo d'occhio solo i siti volabili rallentava drasticamente il processo decisionale pre-volo (violazione della Hick's Law).
  3. Quando un comprensorio presentava sia un decollo sfavorevole (es. vento forte) sia un rientro critico/fuori cono all'atterraggio, l'algoritmo di sintesi riportava solo il primo fattore, mascherando il pericolo geometrico d'atterraggio (violazione di Explainability e Tesler's Law).
- **Causa Radice**:
  1. Conflitto tra brevità di layout orizzontale su mobile ed eliminazione imprudente dei canali non cromatici.
  2. Assenza di un filtro di stato di 1° livello nella Home Dashboard.
  3. Branching condizionale `if-else` esclusivo nella composizione della motivazione nel Core (`core/comprensorio.js`).
- **Pattern Vincolante**:
  1. **Simboli Geometrici Avionici Compatti (Standard ForeFlight/SkyDemon)**: I badge di stato nella testata della card adottano una geometria quadrata/circolare compatta da $26\times 26\text{ px}$ con riempimento solido ad alto contrasto (WCAG AA/AAA $\ge 4.5:1$ fino a $7.9:1$) e simbolo geometrico esplicito:
     - `✓` (Verde solido): Volabile
     - `▲` (Ambra solido): Cautela
     - `✕` (Rosso rubino solido): Non Volabile
     - `⚡` (Rosso/Nero pericolo): Severe / Condizioni proibitive
     - `○` (Grigio ardesia solido): Dati meteo non disponibili (N/D)
     La conformità WCAG è garantita dalla combinazione quadrivalente: **Colore + Forma + Simbolo geometrico + `aria-label` / `title`**.
  2. **Chip di Filtro Rapido Volabilità (`Tutti (N)` vs `Volabili / Cautela (M)`)**: Sotto la barra di ricerca, offrire due chip a tocco rapido (touch target visivo $\ge 36\text{px}$, area di tocco estesa) con contatore dinamico (`this.flyabilityFilter`). Gestire l'empty state dedicato con un'azione di reset rapido a 1 tap.
  3. **Explainability Multi-Rischio nel Core Headless**: Quando sia il decollo sia l'atterraggio presentano allerte concorrenti (`takeoffSeverity >= 2` o `= 1` e `!glideMetrics.isSafe`), la stringa `reason` deve obbligatoriamente combinare entrambi i fattori separati da un bullet centrale (`•`), prevenendo il mascheramento del rischio d'atterraggio.

---

## 59. Riprogettazione UI/UX Previsioni: Parametri Glanceable a 4 Stati, Accordion con Consigli Pilota e Vista Sincronizzata Multi-Grafico (Nowcast Integration)
- **Problema**:
  1. La visualizzazione meteorologica oraria era frammentata in pannelli isolati (vento e radiosondaggi) privi di una sintesi organica a colpo d'occhio sui fattori determinanti del volo libero (vento, raffiche, base cumulo, CAPE, turbolenza, insolazione, rientro in atterraggio).
  2. Mancava un pattern di progressive disclosure omogeneo per approfondire i singoli parametri con dati analitici, consigli pratici di sicurezza (Novice Pilot Spec) e grafici di tendenza oraria.
  3. L'utente non poteva confrontare simultaneamente i trend di tutti i parametri fisici su un unico asse orario per cogliere a colpo d'occhio l'evoluzione del ciclo diurno (innesco termico, rinforzo vento, rischio sovrasviluppi pomeridiani).
  4. L'etichetta "• Live" nella testata delle previsioni induceva confusione facendo credere che i dati provenissero da un anemometro fisico reale sul decollo, mentre si trattava di modelli numerici (Open-Meteo). Inoltre, consultando la giornata odierna ("Oggi"), la vista si posizionava staticamente sulle 13:00 anziché mostrare immediatamente l'ora reale corrente.
- **Causa Radice**:
  1. Architettura UI a sezioni chiuse e prive di una matrice comune di valutazione dei parametri.
  2. Assenza di una vista multi-grafico aggregata sincronizzata sullo stesso intervallo diurno 08:00-20:00.
  3. Mancanza di disaccoppiamento tra stato di connettività API e telemetria live sul campo, e mancata risoluzione automatica dell'ora odierna.
- **Pattern Vincolante**:
  1. **Triage Glanceable a 7 Parametri (`computeParamMetrics`)**: Modellare e presentare tutti i 7 fattori chiave (vento decollo, raffiche & delta, base cumulo LCL, instabilità CAPE, turbolenza EDR, copertura nuvolosa, atterraggio) con indicatori semaforici a 4 stati (verde, giallo, rosso, nero/severe), etichetta di testo e valore sintetico con unità esplicita.
  2. **Accordion a Svelamento Progressivo**: Tocco sul parametro con touch target $\ge 48\text{px}$ per mostrare griglia analitica a 2 colonne, box "Consiglio Pilota" con raccomandazioni per piloti principianti ed EN-A, e grafico orario di tendenza vettoriale SVG.
  3. **Modalità Alternativa "Solo Grafici" (`forecastMode === 'charts'`)**: Barra di switch `Schede` vs `Solo Grafici` (zero emoji decorative) con stack compatto di 6 curve diurne sincronizzate con cursore verticale coordinato sull'ora attiva.
  4. **Nowcast Context & Pulizia Badge**: Risoluzione automatica dell'ora iniziale (`_resolveInitialHour`: ora locale corrente per oggi, 13:00 per date future); eliminazione del badge ingannevole "Live" nella testata previsionale numerica.

---

## 60. Mappa Comprensori con Headless Adapter, Progressive Scaling a 3 Livelli e Cono di Planata Corretto per Vento
- **Problema**: L'integrazione di una cartografia mobile ad alta densità per 134 comprensori alpini e appenninici rischiava di incorrere in:
  1. *Cluttering e sovrapposizione visiva a zoom macro* (cerchi sovrapposti e illeggibili a zoom 5-7).
  2. *Falsi positivi di planata aerodinamica* ignorando la componente di vento contrario lungo la rotta tra decollo e atterraggio.
  3. *Blocco dei test unitari in Node.js puro* legando il controller della mappa a WebGL2/MapLibre o istanze DOM Leaflet non mockabili.
  4. *Errori HTTP 414 e 429* richiedendo tutti i comprensori nazionali contemporaneamente ad Open-Meteo.
- **Causa Radice**: Assenza di un adapter cartografico astratto (`IMapEngine`), mancata partizione macro-regionale e semplificazione geometrica del cono di planata privo del vettore vento.
- **Pattern Vincolante**:
  1. **Headless Map Adapter Pattern (`IMapEngine`)**: Disaccoppiare la vista cartografica in `ui/map/mapEngineAdapter.js` con `LeafletMapEngine` nel browser e `HeadlessMockMapEngine` nei test Node.js a 0ms senza JSDOM.
  2. **Progressive Marker Scaling a 3 Livelli**:
     - *Zoom < 7.5 (Macro)*: Pillole semantiche compatte (dot 14px a 4 colori con nome spot).
     - *Zoom 7.5 - 8.9 (Medio)*: Aureole di bacino aerologico (raggio 8-10 km) con quota centrale.
     - *Zoom >= 9.0 (Micro)*: Vettori ad alta fedeltà con azimut decollo, freccia del vento reale calcolata a quota decollo (`XX km/h DIR (quota slm)`), e linea geodetica colorata in base all'efficienza con vento.
  3. **Cono di Planata con Correzione Vento (`calculateWindCorrectedGlideRatio`)**: Calcolare la velocità al suolo effettiva $v_{\text{ground}} = \max(5, v_{\text{trim}} - v_{\text{headwind}})$ e l'efficienza richiesta sul terreno ($E_{\text{richiesta\_vento}} = E_{\text{still}} \cdot \frac{v_{\text{trim}}}{v_{\text{ground}}}$), segnalando rientri critici o impossibili in caso di forte vento contrario.
  4. **Pulsante 1-Tap "Top Spot" & Scrubber Dockato (Thumb Zone)**: Barra superiore con raccomandazione immediata del miglior comprensorio volabile della macro-regione attiva all'ora selezionata, e timeline oraria dockata a filo sopra la navbar con clearance $\ge 24\text{px}$ e `touch-action: pan-x`.
  5. **Dual Theme Tile Switching**: Commutazione trasparente tra CartoDB Dark Matter e CartoDB Positron/Sunlight Mode all'evento `themeChange` senza ricaricamento di pagina.

---

## 61. Smussamento Vettoriale dei Grafici Meteo tramite Spline Monotona (Fritsch-Carlson) e Zero Overshoot
- **Problema**: Il rendering delle serie orarie meteorologiche (vento, raffiche, base cumulo LCL, CAPE, turbolenza EDR, copertura nuvolosa e brezza di valle) tramite polilinee spezzate (`<polyline points="...">` o sequenze lineari `L x y`) produceva curve angolari con spigoli vivi a ogni marcatore orario. Questo approccio generava affaticamento visivo all'aperto sotto forte contrasto solare e travisava visivamente l'evoluzione continua dei gradienti termodinamici e fluidodinamici dell'atmosfera.
- **Causa Radice**: Connessione diretta punto-punto senza interpolazione di forma. L'applicazione di spline Bézier cubiche convenzionali prive di controllo di monotonicità causa tipicamente overshooting (creste che superano i massimi fisici o scendono sotto zero generando valori impossibili di CAPE o vento negativo).
- **Pattern Vincolante**:
  1. **Interpolazione Spline Monotona Cubica (`buildSmoothPath`)**: Implementare l'algoritmo di Fritsch-Carlson per calcolare i punti di controllo Bézier cubici (`C cp1x,cp1y cp2x,cp2y x,y`). Quando due segmenti consecutivi cambiano pendenza ($s_{i-1} \cdot s_i \le 0$), la tangente viene forzata orizzontale ($m_i = 0$), garantendo zero overshooting ed eliminando cuspidi sia sui picchi che sulle valli. Nei tratti monotoni, il gradiente è calcolato tramite media armonica ponderata.
  2. **Tracciamento Coordinato dell'Area Sottesa (`buildSmoothAreaPath`)**: Le campiture ombreggiate (fill delle raffiche, instabilità CAPE, turbolenza ed insolazione) devono seguire la medesima curva cubica della linea superiore (`M x0,baselineY L x0,y0 C ... L xN,baselineY Z`), evitando qualsiasi disallineamento geometrico tra bordo e campitura.
  3. **Attributi SVG di Fluidità Visiva**: Configurare sempre `stroke-linecap="round"` e `stroke-linejoin="round"` sui tracciati vettoriali per garantire una resa grafica priva di artefatti ad alta risoluzione su display retina e smartphone outdoor.

---

## 62. Stato Iniziale Collassato delle Sezioni Parametri nelle Previsioni (Hick's Law & Glanceable Overview)
- **Problema**: L'apertura predefinita forzata della prima sezione/scheda ("Vento in Decollo") al montaggio della vista Previsioni espandeva immediatamente il corpo dell'accordion (dettagli analitici, consiglio pilota e grafico orario SVG), occupando gran parte della vista verticale e costringendo il pilota a scorrere la pagina per scoprire lo stato degli altri 6 parametri critici (raffiche, base cumulo, instabilità CAPE, ecc.).
- **Causa Radice**: Inizializzazione arbitraria di `this.expandedCardId = 'vento-decollo'` anziché `null` nel costruttore del controller.
- **Pattern Vincolante**:
  1. **Inizializzazione Neutra Collassata**: Impostare `this.expandedCardId = null;` nel costruttore, nel metodo di montaggio vista (`mount`) e in qualsiasi selezione o cambio di comprensorio (`pick-spot`, `forecast-spot-select`).
  2. **Panoramica a Colpo d'Occhio (Glanceable Triage)**: All'ingresso nella vista, tutte le schede dei parametri devono mostrarsi nella loro forma sintetica chiusa (titolo, semaforo a 4 stati, etichetta e valore chiave con unità), permettendo al pilota una scansione cognitiva completa in meno di 2 secondi, riservando l'espansione e i dettagli analitici al tocco esplicito.



