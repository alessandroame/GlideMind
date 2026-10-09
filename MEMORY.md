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
