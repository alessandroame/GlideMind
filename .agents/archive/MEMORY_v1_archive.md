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
- **Problema**: Operazioni trigonometriche su angoli retti o opposti (es. `Math.sin(Math.PI) * 10 / 10`) possono produrre il valore `-0`. Le asserzioni native `assert.equal(-0, 0)` in `node:assert/strict` falliscono poichÃ© `Object.is(-0, 0)` Ã¨ falso.
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
- **Pattern Vincolante**: Applicare un filtro anti-spike immediato nel loop di scansione B-record: se la velocitÃ  verticale $|v_z| > 25\text{ m/s}$, la quota viene linearizzata e il rateo limitato al valore fisico massimale del volo libero ($\pm 18\text{ m/s}$). Il parser deve calcolare autonomamente le grandezze cinematiche di primo livello (distanza, dislivello cumulato, velocitÃ , min/max quota) e delegare l'analisi avanzata via callback `options.telemetryAnalyzer`.

---

## 8. Delta Angolare con Segno vs Distanza Angolare Geodetica
- **Problema**: L'uso di funzioni di differenza angolare geodetica (che restituiscono un valore assoluto in $[0, 180]^\circ$) corrompe l'analisi cinematica di spirali, virate e oscillazioni acrobatiche, poichÃ© cancella la direzione di virata (orario vs antiorario) e impedisce l'integrazione cumulativa dell'angolo di virata oltre i $180^\circ$.
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
- **Causa Radice**: Assunzione che la navigazione e il montaggio logico di una vista richiedano un albero DOM reale anzichÃ© un'interfaccia di montaggio astratta.
- **Pattern Vincolante**: `ui/router.js` deve invocare sempre i controller di vista registrati passando `containerEl` (anche se nullo o mock), permettendo a viste e test di operare in headless, mentre l'iniezione di markup di placeholder per viste non registrate deve rimanere condizionata alla presenza effettiva di un elemento contenitore.

---

## 12. Paradigma Comprensorio-Centrico vs Point-Centric per Piloti Ricreativi
- **Problema**: Trattare i singoli decolli come punti isolati disconnessi genera dispersione nei preferiti, ricerche frammentate e, soprattutto, omette la valutazione dell'atterraggio a fondo valle, creando falsi positivi di sicurezza per piloti non esperti di cross-country.
- **Causa Radice**: Modelli orientati a rotte di cross-country o database appiattiti su singole coordinate GPS di decollo.
- **Pattern Vincolante**: L'entitÃ  radice primaria in GlideMind Ã¨ la `LocalitÃ ` (Comprensorio), che incapsula obbligatoriamente i decolli (`takeoffs`) e gli atterraggi (`landings`) associati. I preferiti (`pinnedLocationIds`), le ricerche e le card di sintesi meteo aggregano la volabilitÃ  del miglior decollo e la sicurezza del vento a terra all'atterraggio. Nello stato applicativo e nelle viste Ã¨ vietato separare decolli e atterraggi o gestirli come entitÃ  orfane.

---

## 13. Proxy Aerodinamico della Vela vs Auto-Dichiarazione 'Livello Pilota'
- **Problema**: Inserire selettori di "Livello Pilota" (principiante/intermedio/esperto) nella UI genera attrito decisionale, sovraccarico cognitivo sul decollo e rischi di autovalutazione fallace (Dunning-Kruger o mancato aggiornamento del profilo).
- **Causa Radice**: Trattare la sicurezza come una preferenza dichiarativa soggettiva anzichÃ© ancorarla alle caratteristiche aerodinamiche oggettive dell'ala in uso.
- **Pattern Vincolante**: Nessun selettore di livello pilota nella UI dell'app. L'attrezzatura attiva nel profilo o hangar (`glider`: EN-A, EN-B, EN-C, EN-D con $v_{\text{trim}}$, allungamento $AR$, efficienza) Ã¨ l'unica sorgente di veritÃ  per l'inviluppo di volo. Per una vela EN-A (scuola/principiante), le soglie restrittive (vento $\le 18\text{ km/h}$, $\Delta$ gust $\le 8\text{ km/h}$, efficienza cono atterraggio $\le 1:5.5$) scaturiscono matematicamente dalle formule fisiche. La skill `novice-pilot-auditor` Ã¨ uno strumento di ingegneria/audit invocato nei checkpoint cardine (rilascio UI, modifiche algoritmi meteo, briefing AI, debriefing IGC).

---

## 14. Architettura Concettuale Minimale della Home: Ordinamento VolabilitÃ  & Currency Pilota (Zero PIN/Preferiti)
- **Problema**: Inserire nella Home selettori date estesi, statistiche di carriera o micro-gestioni di bookmarking con stelle/pin genera attrito e affollamento visivo (clutter) opprimente, contrario all'essenzialitÃ  del pilota outdoor.
- **Causa Radice**: Sovrapposizione di responsabilitÃ  tra la vista principale (Home) e i tab specialistici (Previsioni, Logbook, Mappa) e tentativi di trasformare la Home in un gestore di preferiti.
- **Pattern Vincolante**: La Home (`HomeDashboardView.js`) deve contenere **esclusivamente 2 blocchi funzionali**:
  1. **Panoramica VolabilitÃ  Comprensori ordinata dinamicamente per condizione decrescente**: dal migliore al peggiore (`Aperto/Volabile` in cima $\to$ `Cautela` $\to$ `Chiuso` in fondo), **senza bottoni di PIN, icone stella preferiti o logiche di aggiunta/rimozione preferiti**. Ogni card sintetizza: nome comprensorio, badge di stato, explainability fisica sintetica, decollo migliore attivo ($T_{\text{best}}$) e atterraggio di rientro ($L_{\text{safe}}$), con tap rapido verso `ForecastView`. Include filtro di ricerca istantaneo ad autocompletamento (NN/G #6).
  2. **Stato di Volo / Currency del Pilota**: una singola riga o card essenziale con l'ultimo volo effettuato (data, localitÃ , durata), indicatore di allenamento/currency e azione rapida primaria `+ Carica IGC`.
  Tutti i dettagli specialistici (modelli meteo, radiosondaggi LCL, bussola 360Â°, ore di carriera, telemetria 3D, matrici addestrative) risiedono rigorosamente nei rispettivi tab dedicati (`ForecastView`, `LogbookView`).

---

## 15. Regola dell'Unico Binomio (1 Decollo + 1 Atterraggio per Comprensorio)
- **Problema**: Mostrare o valutare liste eterogenee di decolli multipli e atterraggi alternativi dentro una card sintetica di comprensorio disorienta il pilota e distrugge il colpo d'occhio outdoor.
- **Causa Radice**: Assenza di un vincolo di sintesi aeronautica 1:1.
- **Pattern Vincolante**: Ogni comprensorio sintetizza **esclusivamente un singolo decollo** e **un singolo atterraggio**. Nel catalogo, i punti di riferimento storici/ufficiali sono marcati con `isPrimary: true`. L'interfaccia di calcolo (`evaluateComprensorio`) espone sempre un unico binomio coerente (`takeoff` e `landing`), garantendo una densitÃ  visiva ad alta leggibilitÃ  in ogni vista riassuntiva.


---

## 16. Layout Geometry Testing, Deduplicazione CSS & Salvaguardie Viewport Mobile
- **Problema**: Card schiacciate con larghezza fissa (270px) in container da 358px, testo troncato con ellissi arbitrarie (`...`), elementi dislocati da classi `.sr-only` non mappate e sovrapposizione con la barra di navigazione fissa inferiore. I test unitari passavano al 100% perchÃ© controllavano solo stringhe HTML (`assert.ok(html.includes(...))`).
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
- **Causa Radice**: Disallineamento tra firme a parametri posizionali e firme a oggetto distrutturato (`{ comprensorio, weatherData, hourIndex, glider }`), unito all'aspettativa di oggetti `{ lat, lon }` normalizzati anzichÃ© stringhe `"45.833, 9.302"`.
- **Pattern Vincolante**:
  1. `evaluateComprensorio` deve essere sempre invocato passando un singolo oggetto parametri: `{ comprensorio, weatherData, hourIndex, glider }`.
  2. Nelle viste e nei test, applicare sempre preventivamente `parseCoordinates(takeoff.coordinates)` prima di passare le coordinate ai generatori meteo o funzioni geodetiche.
  3. Denominazione conforme agli standard meteorologici WMO: utilizzare `classifyAtmosphericStability(lapseRate)` e `calculateLCL(temp, dewPoint, elev)` senza abbreviazioni arbitrarie.

---

## 18. Gate di Validazione UX Laws Obbligatorio in Fase Progettuale
- **Problema**: Progettazione di elementi UI ridondanti (es. pulsante Home duplicato nell'header quando giÃ  presente nella bottom bar), posizionamento scorretto di controlli primari fuori dalla Thumb Zone (timeline orizzontale a scroll in alto) o mancanza di un check sistematico sui principi di ergonomia prima di scrivere codice.
- **Causa Radice**: Assenza di un passaggio obbligatorio di verifica euristica preventivo durante la concezione dell'interfaccia.
- **Pattern Vincolante**: Prima di produrre codice, markup o proposte di layout per qualsiasi schermata o componente, l'agente deve applicare e documentare la checklist **Pre-Design UX Check**:
  1. *Occam's Razor & PrÃ¤gnanz*: Zero controlli duplicati rispetto al frame globale (`#bottom-nav-bar`). Nessun bottone parassita.
  2. *Fitts's Law & Thumb Zone*: Controlli di scrubbing e trigger primari in basso, touch target $\ge 48\times 48\text{px}$.
  3. *Hick's & Miller's Law*: Scelte visibili essenziali (3â5 opzioni), informazioni raggruppate in blocchi (chunking), zero scroll orizzontale su viste dati.
  4. *Jakob's Law*: Bottom bar per navigazione di primo livello, bottom sheet (`SheetManager`) per filtri e selezioni, mai dialoghi popup modali annidati.
  5. *Doherty Threshold*: Aggiornamento reattivo immediato ($<50\text{ms}$) allo scrubbing.

---

## 19. Gate di Audit Terminologico & Microcopy Pilota (Anti-Gergo) in Fase Progettuale
- **Problema**: Esposizione diretta di metriche fisiche grezze, acronimi specialistici o terminologia da modello numerico (`Energia CAPE`, `J/kg`, `LCL`, `EDR`, `Lapse Rate`) nei componenti UI, nelle card e nei briefing di volo. In ambiente outdoor e sul decollo, o per allievi e neo-brevettati, il dato termodinamico non contestualizzato genera sovraccarico cognitivo, rallenta la valutazione pre-volo oltre i 3 secondi di sicurezza e rischia di mascherare pericoli critici (es. colpi di vento e cumulonembi).
- **Causa Radice**: I controlli preventivi in fase di ideazione si concentravano esclusivamente su layout, geometrie e target di tocco, omettendo il vocabolario a schermo e rimandando la revisione di `novice-pilot-auditor` alla fine del task (o omettendola).
- **Pattern Vincolante**:
  In **fase progettuale preventiva** (prima di scrivere o proporre markup, controller o prompt), l'agente deve eseguire e documentare l'**Audit di Vocabolario & Microcopy** secondo i criteri di `novice-pilot-auditor`:
  1. **Censimento Terminologico Preventivo**: Elencare ogni etichetta, unitÃ  di misura e metrica prevista nella vista o card prima di implementarla.
  2. **Regola della Traduzione Fenomenologica**: L'etichetta primaria e il testo principale devono descrivere l'**effetto pratico sul volo e sulla sicurezza** (es. *Rischio Temporali*, *InstabilitÃ *, *Base Nubi*, *Turbolenza in Termica*), mai l'acronimo accademico crudo (*CAPE*, *LCL*, *EDR*).
  3. **Gerarchia Qualitativo-Quantitativa**:
     - *Dato Primario*: Stato semantico chiaro e color-coded (*Basso / Moderato / Sovrasviluppo CB*, *Calmo / Turbolento*).
     - *Dato Secondario (Accessorio)*: Il valore numerico specialistico con unitÃ  di misura (`650 J/kg`, `0.22 mÂ²/Â³ sâ»Â¹`) puÃ² comparire esclusivamente come informazione di secondo livello in piccolo, tra parentesi o in tooltip per piloti esperti.
  4. **Tavola di Mappatura Vincolante**:
     - `CAPE (J/kg)` $\to$ Label: `InstabilitÃ  / Temporali` | Stato primario: `Calmo / Moderato / Rischio Sovrasviluppo CB` | Dettaglio: `CAPE ${val} J/kg`
     - `LCL (m)` $\to$ Label: `Base Nubi (Cumulo)` | Quota: `${val}m slm` (con delta dal decollo)
     - `EDR / Turbulence` $\to$ Label: `Turbolenza in Termica` | Stato: `Leggera / Moderata / Forte`
     - `Lapse Rate (Â°C/100m)` $\to$ Label: `Gradiente Termico` | Stato: `Stabile / Instabile`
     - `Vertical Shear` $\to$ Label: `Taglio del Vento` | Stato: `Omogeneo / Gradiente Ripido`



---

## 20. Pattern di Selezione Temporale per il Volo Libero & Prevenzione Timezone Shift UTC
- **Problema**: L'uso di `date.toISOString().split('T')[0]` genera slittamenti di data imprevisti (es. alle ore 23:00 a Roma UTC+2 la data calcolata diventa domani). Inoltre, selettori statici a intervalli generici (`+1, +2, +3 giorni`) lasciano i piloti cechi rispetto alle finestre del weekend a inizio settimana e duplicano bottoni quando un giorno fisso coincide con un preset (es. venerdÃ¬ dove domani Ã¨ sabato).
- **Causa Radice**: Serializzazione in formato UTC anzichÃ© calendario locale e mancato disaccoppiamento tra il modello di pianificazione del pilota e i controlli generici del browser.
- **Pattern Vincolante**:
  1. *Formattazione Locale Rigorosa*: Utilizzare sempre `formatDateIso(date)` che estrae `getFullYear()`, `getMonth() + 1` e `getDate()` in orario locale, e `parseDateIso(str)` impostando le 12:00:00 (mezzogiorno) per neutralizzare salti da ora legale/solare.
  2. *Preset Intelligenti Dinamici*: Calcolare i preset in base al giorno della settimana (`dayOfWeek`): Lun-Gio mostra Oggi, Domani, Sabato e Domenica; Ven fonde Domani e Sabato; il Weekend espone Oggi, Domani e Prossimo Weekend.
  3. *Iniezione Chip Custom*: Se l'utente seleziona una data specifica via calendario (`openSheet`), iniettare una scheda attiva dedicata mantenendo visibili i preset principali per un ritorno a "Oggi" o "Sabato" con 1 singolo tocco (Cheap Takeover).
  4. *SSOT Reattivo Cross-View*: `store.activeDate` deve governare in modo sincronizzato sia la graduatoria dei comprensori in `HomeDashboardView` sia i dettagli orari in `ForecastView`.

---

## 21. Architettura di Persistenza a Due Livelli per Tracciati IGC (Meta vs Raw Blob)
- **Problema**: Caricare l'intero database dei tracciati IGC in memoria RAM all'apertura del Logbook su dispositivi mobili provoca memory bloat, jank dell'interfaccia e possibili crash da esaurimento memoria (out-of-memory) con centinaia di voli memorizzati.
- **Causa Radice**: Mancata separazione architetturale tra i metadati di consultazione frequente (data, durata, sito, quota max, termiche) e i dati grezzi ad alta densitÃ  (coordinate GPS 1Hz, B-records, curve barometriche).
- **Pattern Vincolante**:
  Separare lo storage IndexedDB in 2 entitÃ /store distinte:
  1. `flights_meta`: record leggero contenente solo KPI, metadati e statistiche per il rendering istantaneo delle card del logbook e il calcolo della currency.
  2. `flights_raw`: blob di testo IGC e campionamenti densi, salvati con chiave identica `flightId` e caricati asincronamente on-demand solo ed esclusivamente quando l'utente attiva il visualizzatore 3D.

---

## 22. Strategia di Backup Globale vs Logbook Modulare Indipendente & Auto-Sync
- **Problema**: L'assenza di una strategia di backup espone l'utente alla perdita irreversibile dei voli in caso di pulizia cache/dati del browser da parte dell'OS mobile (Storage Eviction). Inoltre, un backup monolitico inscindibile impedisce al pilota di esportare/importare il solo libretto di volo per migrare su altri dispositivi senza sovrascrivere le preferenze di sistema.
- **Causa Radice**: Trattare la persistenza come un dettaglio implementativo anzichÃ© come un requisito critico di affidabilitÃ  dei dati del pilota.
- **Pattern Vincolante**:
  Implementare in `core/backupManager.js` due canali indipendenti:
  1. **Full System Snapshot**: Esportazione/importazione JSON completa di LocalStorage (impostazioni, ali, siti custom) + IndexedDB (voli e tracce) con modalitÃ  di ripristino sia "Sovrascrittura totale" sia "Smart Merge non distruttivo".
  2. **Dedicated Logbook Backup & Restore**: Esportazione/importazione autonoma del solo archivio voli (`flights_meta` + `flights_raw`), permettendo la conservazione e portabilitÃ  del libretto di volo in formato aperto.
  3. **Auto-Sync & Dirty Tracker**: Rilevamento modifiche non salvate in RAM (`syncDirtyTracker`) con notifica non invasiva quando trascorrono >14 giorni o $\ge 3$ voli dall'ultimo backup.

---

## 23. Architettura 3D Replay ad Adapter Unificato (MapLibre Primario con Fallback CesiumJS)
- **Problema**: Il rendering 3D di terreni DEM e traiettorie su MapLibre GL con Three.js CustomLayer presenta complessitÃ  critiche di sincronizzazione matriciale, clipping di frustum e lag della telecamera. Legarsi a un unico motore senza alternative rischia di bloccare lo sviluppo in vicoli ciechi insormontabili.
- **Causa Radice**: Mancanza di un'interfaccia astratta di disaccoppiamento tra il controller dell'interfaccia utente (scrubber, HUD, Canvas 2D) e il renderer 3D sottostante.
- **Pattern Vincolante**:
  La vista `FlightReplayView.js` interagisce esclusivamente con l'interfaccia astratta `IReplay3dEngine`:
  - `init(containerEl, trackData, options)`
  - `play()`, `pause()`, `seek(timeMs)`, `setSpeed(multiplier)`
  - `setCameraMode(mode)` (cockpit / chase / orbit)
  - `destroy()`
  - **Engine Primario**: `MapLibreReplayEngine` (MapLibre GL + raster DEM Terrarium + Three.js GLB).
  - **Engine di Fallback Provato**: `CesiumReplayEngine` (CesiumJS standalone con coordinate cartesiane native WGS84, giÃ  validato empiricamente in ParaMeteo). Se MapLibre incontra ostacoli o incompatibilitÃ  grafiche, lo switch sul fallback Cesium avviene a costo zero di riscrittura della UI e della telemetria.

---

## 24. Ingestione Meteo Mappa a Catalogo Statico vs Bounding Box Dinamico
- **Problema**: Eseguire query batch su Open-Meteo in base al bounding box visibile della mappa ad ogni evento di pan o zoom (`moveend`) genera centinaia di combinazioni variabili di coordinate geografiche, invalidando la cache LRU e consumando rapidamente la quota oraria dell'API (HTTP 429 Too Many Requests).
- **Causa Radice**: Accoppiamento rigido tra gli eventi geometrici di viewport e le chiamate di rete meteorologiche.
- **Pattern Vincolante**:
  La mappa dei comprensori (`SpotMapView.js`) esegue l'ingestione batch esclusivamente sull'elenco statico dei comprensori censiti (`data/locations.json`, ~25-30 coordinate fisse per macro-regione). Tutti gli aggiornamenti visivi su pan, zoom e scrubbing orario operano istantaneamente in RAM sui dati pre-caricati in memoria, con zero chiamate di rete su interazione utente.

---

## 25. Classificazione Semantica della VolabilitÃ  Multi-Giorno a 4 Colori (Verde, Giallo, Rosso, Nero) con AccessibilitÃ  Outdoor
- **Problema**: Mostrare le 14 date nel calendario senza indicare lo stato di volabilitÃ  costringe il pilota a esplorare ogni giorno alla cieca. Inoltre, basare la classificazione esclusivamente sul colore (o gradienti continui) viola WCAG AA ed Ã¨ illeggibile all'aperto sotto luce solare diretta o su schermi montati su cockpit/imbrago.
- **Causa Radice**: Assenza di sintesi oraria deterministica della finestra di volo (10:00-18:00) e violazione della regola ergonomica sul feedback visivo multimodale (Colore + Simbolo + Testo).
- **Pattern Vincolante**:
  La volabilitÃ  su griglia a 14 giorni adotta una scala a 4 stati discreti determinata da `calculateDailyFlyabilitySummary`:
  1. ð¢ **Volabile (Verde / `flyable`)**: finestra attiva $\ge 2\text{h}$, condizioni in asse e sicure, assenza di temporali (`â`).
  2. ð¡ **Cautela (Giallo / `caution`)**: turbolenza o gradiente termico vivace, vento sostenuto o instabilitÃ  convettiva pomeridiana (`â²`).
  3. ð´ **Chiuso (Rosso / `unflyable`)**: vento oltre i limiti di trim speed, traverso marcato, pioggia o sottovento (`â`).
  4. â« **Severo (Nero / `severe`)**: temporali severi, raffiche estreme $> 35\text{ km/h}$, CAPE $> 1500\text{ J/kg}$, pioggia battente (`â¡`).
  Ogni tessera di calendario combina obbligatoriamente:
  - Bordo inferiore semantico da 3px (`fly-*`).
  - Badge a pillola con icona funzionale (`â`, `â²`, `â`, `â¡`) e microcopy testuale (`Volabile`, `Cautela`, `Chiuso`, `Severo`).
  - Dot indicatore "Tendenza sinottica" per orizzonti $> 7$ giorni.
  - Legenda semantica esplicita alla base del bottom sheet per chiarire il significato a colpo d'occhio.

---

## 26. Idratazione Progressiva a Due Livelli di Zoom & Cache Entity-Centric per Mappa Meteo
- **Problema**: Eseguire richieste Open-Meteo batch sull'intero catalogo di 134 comprensori genera URL lunghi oltre 4.000 caratteri (errore HTTP 414 URI Too Long) e scarica 5-8 MB di payload JSON su dispositivi mobili. Viceversa, interrogare le API ad ogni evento di zoom o spostamento della mappa provoca raffiche di chiamate ridondanti che superano la quota oraria (HTTP 429).
- **Causa Radice**: Assenza di partizionamento geografico delle coordinate e indicizzazione della cache legata al rettangolo visibile anzichÃ© all'entitÃ  comprensorio.
- **Pattern Vincolante**:
  1. **Partizionamento Macro-Regionale**: A livello Macro (zoom 5 â 8.9), scaricare solo la macro-regione attiva (Nord-Ovest, Nord-Est, Centro, Sud/Isole o raggio 100 km dal pilota, max 25-30 comprensori, payload $< 500\text{ KB}$, URL $< 800$ caratteri).
  2. **Zero Chiamate a Livello Micro (Zoom $\ge$ 9)**: I dati orari completi (168 ore) sono giÃ  residenti in RAM per i comprensori dell'area. Il passaggio a livello micro non esegue chiamate di rete, ma sblocca sul canvas i dettagli vettoriali ad alta fedeltÃ  (cono decollo $T_{\text{best}}$, vento reale a quota decollo, linea di planata sicura verso $L_{\text{safe}}$ con $E_{\text{richiesta}} \le E_{\text{glider}}$).
  3. **Cache Entity-Centric (`spotId`)**: La cache in RAM Ã¨ indicizzata per ID comprensorio univoco con TTL 30 min. Prima di scaricare, si applica la differenza insiemistica $\text{SpotsDaScaricare} = \text{SpotsNelRaggio} \setminus \text{SpotsInCache}$, con debounce di 400ms su `moveend`.

---

## 27. Salvaguardia Anti-Eviction Mobile IndexedDB & Deduplicazione Deterministica Voli IGC
- **Problema**: Su iOS Safari e alcuni browser Android con storage sotto pressione, IndexedDB puÃ² essere eliminato silenziosamente dopo 7 giorni di mancata interazione se l'app non ha lo storage persistente autorizzato dal sistema operativo. Inoltre, il salvataggio o l'importazione ripetuta dello stesso file IGC rischia di creare record duplicati che sballano ore totali e statistiche di currency.
- **Causa Radice**: Affidamento allo storage volatile predefinito del browser e generazione di ID di volo puramente casuali (`crypto.randomUUID()`).
- **Pattern Vincolante**:
  1. **Richiesta Persistenza Esplicita**: Inizializzare `core/logbookDb.js` invocando `navigator.storage.persist?.()` e monitorando `navigator.storage.persisted()`.
  2. **Deduplicazione Idempotente tramite Fingerprint**: Calcolare una chiave univoca deterministica del volo basata su data UTC, ora di decollo, durata e coordinate del primo fix GPS. Se un volo con fingerprint identico esiste giÃ , l'operazione di inserimento aggiorna il record esistente anzichÃ© duplicarlo.
  3. **Risoluzione Conflitti nel Ripristino**: Includere in `flights_meta` il campo `updatedAt` (ISO UTC) per governare il merge non distruttivo secondo la regola deterministica Last-Write-Wins.

---

## 28. Pattern Stale-While-Revalidate e Disaccoppiamento Rete nei Controller UI (Zero Spinner Bloccanti Outdoor)
- **Problema**: L'inserimento di fetch di rete bloccanti all'apertura delle viste (con spinner o schermate di attesa a tutto schermo in attesa della risposta di Open-Meteo) paralizza l'interfaccia utente in presenza di connessioni montane degradate o assenti (2G/3G/EDGE o decolli isolati), e rischia di rompere la suite di test in Node.js per dipendenza da endpoint esterni.
- **Causa Radice**: Trattare la rete come pre-condizione sincrona di rendering anzichÃ© come stream asincrono opzionale di idratazione dello stato.
- **Pattern Vincolante**:
  1. **Rendering Ottimistico Istantaneo a 0ms**: All'apertura della vista o al cambio spot/data, renderizzare immediatamente a schermo il contenuto utilizzando i dati in cache locale (`cachedWeatherMap` o `store.weatherData`) o, in assenza di cache, il fallback sintetico deterministico.
  2. **Fetch Asincrono non Bloccante in Background**: Nel runtime del browser (`typeof window !== 'undefined'`), lanciare la promessa di rete `fetchWeatherData` in background. Quando la risposta HTTP arriva con successo, aggiornare `store.weatherData` e re-renderizzare il controller in modo trasparente.
  3. **Feedback di Rete Non Intrusivo**: Vietati spinner modali bloccanti a tutto schermo. Utilizzare un badge discreto nella barra superiore (ð¢ Live Open-Meteo â¢ aggiornato ${min} fa / ð¡ In aggiornamento... / âª Offline / Stime).
  4. **Isolamento Rigido per Headless Test**: In ambiente Node.js puro (`typeof window === 'undefined'`), nessuna chiamata di rete esterna viene eseguita in automatico, preservando l'esecuzione deterministica dei test a 0ms senza dipendenza da internet.

---

## 29. Pipeline Ibrida per Ingestione e Validazione Spot: Isolamento Staging e Pre-filtro Deterministico
- **Problema**: L'affidamento a un LLM per la validazione geografica degli spot (decolli e atterraggi) introduce allucinazioni numeriche su coordinate, distanze e quote altimetriche. Inoltre, l'aggiornamento diretto del file `data/locations.json` durante lo sviluppo rischia di rompere la sincronizzazione con i controller UI (`HomeDashboardView`, `ForecastView`) e i relativi test.
- **Causa Radice**: Assunzione errata che i modelli linguistici possano sostituire calcoli trigonometrici e topografici deterministici, unitamente alla mancanza di un buffer di staging per i dati territoriali grezzi.
- **Pattern Vincolante**:
  1. **Separazione Rigida tra Calcolo Deterministico e Audit Semantico**: Il clustering geografico (Haversine $\Delta d \le 100\text{ m}$), il controllo di plausibilitÃ  altimetrica DEM Copernicus ($|\Delta h| \le 30\text{ m}$) e il calcolo dell'efficienza di planata al decollo ($E \le 7$) sono eseguiti esclusivamente da funzioni pure in Node.js (`core/geoSpatialMath.js`). L'agente o subagent AI interviene solo a valle sui dati pre-filtrati per risolvere ambiguitÃ  di toponimi, normalizzare i pericoli (`hazards`) e identificare revoche di concessioni atterraggi da testo libero.
  2. **Isolamento Completo dello Staging (`data/staging-locations.json`)**: Lo script di harvesting e l'agente validatore operano come tooling offline (`scripts/`) senza toccare a runtime il catalogo master. Le modifiche vengono esportate in staging e confluite in `data/locations.json` solo previa verifica manuale o soglia di attendibilitÃ  $\ge 80\%$, garantendo zero interferenze con le altre viste dell'applicazione.

---

## 30. Separazione Rigida tra Dati Descrittivi e Metadati di AttendibilitÃ  (Anti-Inquinamento Microcopy)
- **Problema**: L'inserimento di tag tecnici tipo `[attendibilitÃ  XX%]` all'interno del testo libero delle descrizioni (`description`, `hazards`, `rules`, `shuttle`, `access`) inquina la UI outdoor, vÃ¬ola i principi del microcopy aeronautico e costringe la logica di business a ricorrere a parsing regex su stringhe.
- **Causa Radice**: Confluenza di note di audit e punteggi di confidenza all'interno dei campi di testo libero durante l'importazione.
- **Pattern Vincolante**: Le metriche di attendibilitÃ  e provenienza devono risiedere esclusivamente in campi numerici strutturati (`reliability: number`, `audit: object`). Tutti i campi testuali destinati all'utente devono essere purificati preventivamente tramite `cleanUserText(text)`, eliminando categoricamente qualsiasi tag di attendibilitÃ  dal rendering della UI.

---

## 31. Vincolo Mobile Portrait-Only & Salvaguardia Ergonomica con Media Query ad Altezza Minima
- **Problema**: Consentire l'orientamento orizzontale (landscape) su smartphone riduce l'altezza utile netta a soli 240-320px (a causa delle barre del browser e OS). Con la media query desktop classica `@media (min-width: 768px)`, uno smartphone ruotato (es. 844x390px) supera 768px attivando la shell desktop (`#desktop-nav-bar`), nascondendo la bottom bar e facendo collassare timeline sticky, card comprensori e bottom sheets (`SheetManager`). Inoltre, sul decollo i piloti operano il dispositivo a una sola mano (Thumb Zone).
- **Causa Radice**: Breakpoint responsive basati unicamente sulla larghezza (`min-width`) e mancato allineamento tra ergonomia fisica outdoor e modalitÃ  di visualizzazione dello schermo.
- **Pattern Vincolante**:
  1. **PWA Manifest Orientation**: Dichiarare obbligatoriamente `"orientation": "portrait-primary"` in `manifest.webmanifest` per vincolare la visualizzazione verticale quando installata su mobile.
  2. **Media Query Desktop con Guardia di Altezza**: Tutti i breakpoint desktop (`#desktop-nav-bar`, `#bottom-nav-bar`, `#main-view`, dialoghi, scrubber) devono richiedere contestualmente larghezza e altezza minime: `@media (min-width: 768px) and (min-height: 550px)`. Questo impedisce a qualsiasi smartphone ruotato di attivare erroneamente l'interfaccia desktop.
  3. **Guardia Visiva Mobile Landscape**: Includere in `index.html` e `theme.css` un overlay ergonomico (`#gm-landscape-guard`) attivo unicamente su touch device con altezza ridotta: `@media (orientation: landscape) and (max-height: 520px) and (max-width: 1000px) and (pointer: coarse)`, che invita il pilota a ruotare il dispositivo in verticale per una consultazione ottimale.

---

## 32. Architettura del Doppio Tema Outdoor: Dark Cockpit & Sunlight Light Mode (Anti-Riverbero Zenitale)
- **Problema**: L'adozione esclusiva di un tema scuro, pur ideale per display OLED e risparmio energetico, genera un forte "effetto specchio" sotto la luce solare zenitale diretta a mezzogiorno sul decollo: il fondo nero riflette il cielo o il volto del pilota anzichÃ© emettere luce, rendendo illeggibili testi a basso contrasto. Viceversa, un tema chiaro generico da ufficio (con grigi sfumati e card pastello) sbiadisce completamente all'aperto e non soddisfa i ratio di contrasto WCAG 2.1 AA.
- **Causa Radice**: Assunzione che la leggibilitÃ  outdoor dipenda solo dalla polaritÃ  dello sfondo (scuro vs chiaro) anzichÃ© dalla luminanza differenziale e dal contrasto tra testo e superficie.
- **Pattern Vincolante**:
  1. **Dual High-Contrast Theme Engine**: L'applicazione supporta due temi nativi ad alto contrasto governati da CSS Custom Properties: `dark` (predefinito, cockpit e luce moderata) e `light` ("Sunlight Mode", ad altissima luminanza per luce solare battente), oltre alla modalitÃ  `system` (media query OS).
  2. **Palette Sunlight Mode a Contrasto Estremo**: Nel tema chiaro, il fondo primario Ã¨ bianco ottico/slate ultra-chiaro (`#f8fafc` / `#ffffff`) con testo quasi nero puro (`#0a0c10` / `#0f172a`), garantendo un contrasto $\ge 12:1$ (ben oltre la soglia minima WCAG AA di $4.5:1$).
  3. **UniformitÃ  Cromatica dei Codici di Stato tra Dark e Light Mode**: I codici di stato di volabilitÃ  e gravitÃ  (ð¢ Verde #22c55e, ð¡ Giallo #eab308, ð´ Rosso #ef4444, â« Severo #09090b / #f87171, ð  Allerta #f97316) mantengono rigorosamente le stesse colorazioni sature e vivaci sia in modalitÃ  scura che in modalitÃ  chiara per tutti gli elementi semantici (barre della timeline, pillole spot, badge orari, dot variometrici, card parametri e indicatori di severitÃ ), eliminando varianti eccessivamente scure o fangose (#15803d, #b45309, #b91c1c) che compromettevano l'immediatezza visiva e la coerenza percettiva tra i temi.
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
  1. **Annidamento sulla Baseline Tipografica**: Quando un'etichetta accessoria (versione, unitÃ  di misura) deve seguire il testo del titolo, annidare il tag `<span class="...-version">` direttamente all'interno dell'`<h1>` (`<h1 class="gm-title">Titolo <span class="gm-version">vX.Y</span></h1>`) con `display: flex; align-items: baseline; gap: 6px; margin: 0; padding: 0;`.
  2. **Classi CSS Esplicite**: Vietato introdurre classi di utility nel markup senza la corrispondente definizione esplicita e verificata in `css/theme.css`.
  3. **Visual Verification Loop con Chrome DevTools**: Prima di dichiarare completato qualsiasi task che impatti il layout, la tipografia o la resa grafica, Ã¨ obbligatorio innescare un ciclo di verifica visiva tramite `chrome-devtools` (ispezione geometrica `getBoundingClientRect()` o cattura screenshot a diverse risoluzioni 375px/412px), evitando di fidarsi esclusivamente di controlli testuali `html.includes(...)`.

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
- **Problema**: L'inserimento di un valore numerico scalare isolato (es. la velocitÃ  del vento in km/h senza unitÃ ) alla base delle 13 colonne dello scrubber orario ha generato ambiguitÃ  cognitiva nell'utente ("cosa indicano i numeri in basso?").
- **Causa Radice**: Violazione della separazione delle responsabilitÃ  nei componenti UI e della regola di Shneiderman (*Overview first, details on demand*). Lo scrubber Ã¨ un controllore temporale di panoramica rapida a colpo d'occhio, non un cruscotto di dettaglio multi-scalare. In colonne da 25px di larghezza, un numero nudo manca di affordance, omette informazioni critiche di sicurezza (raffiche, disallineamento, pioggia) e induce in errore se disallineato dal semaforo di volabilitÃ .
- **Pattern Vincolante**:
  1. **Livello 0 (Scrubber / Timeline)**: Esclusivamente Navigazione + Stato Qualitativo. Lo slot compresso contiene unicamente l'Ora, la Barra di VolabilitÃ  semaforica e l'orientamento vettoriale macro (freccia). Zero numeri nudi senza unitÃ .
  2. **Livello 1 (Card di Dettaglio Attiva)**: Tutte le grandezze fisiche quantitative (vento medio, raffica massima, direzione esatta in gradi e punti cardinali, quota, efficienza di planata) appartengono esclusivamente alla scheda di dettaglio sincronizzata (`renderSummaryCard`), dove sono esposte con unitÃ  di misura esplicite e contesto completo.
  3. **AccessibilitÃ  Completa nei Livelli Compressi**: Le informazioni quantitative omesse graficamente dalla colonna per ragioni di spazio visivo devono rimanere accessibili agli screen reader tramite attributi `aria-label` descrittivi completi (`aria-label="Ore 19:00, Volabile, Vento 9 km/h"`).

---

## 37. Event Delegation nei Componenti Portal / Modal Sheets (Separazione DOM Tra Main View e Dialoghi Sovrimpressi)
- **Problema**: La selezione di una localitÃ  dal picker comprensori o di una data dal calendario modale non sortiva alcun effetto (clic completamente silente, nessun aggiornamento dello store, mancata chiusura dello sheet).
- **Causa Radice**:
  1. I drawer e modali sono alloggiati in un contenitore dedicato `#sheet-container` collocato in `#app-root` (fratello di `#main-view`) per gestire correttamente z-index e accessibilitÃ  (`role="dialog"`).
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
  1. **Pointer Capture & Touch-Action**: Applicare sempre `touch-action: none` e `cursor: ew-resize` sul container dello scrubber. Utilizzare `setPointerCapture(evt.pointerId)` su `pointerdown` per garantire la continuitÃ  degli eventi `pointermove` anche se il dito devia verticalmente fuori dalla striscia.
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
  1. **Batch Ingestion Unificata**: Per dashboard con molteplici localitÃ  (`HomeDashboardView`), raggruppare tutte le coordinate in un'unica richiesta batch (`fetchBatchComprensoriWeather`), memorizzando i risultati per singolo comprensorio nella cache LRU in-memory.
  2. **Timestamp Prefix Resolution**: In qualsiasi funzione di arricchimento o valutazione (`evaluateComprensorio`), individuare l'indice dell'ora tramite matching esplicito del prefisso data ISO: `timePrefix = targetDate + 'T' + String(hourIndex).padStart(2, '0')`.
  3. **Stale-While-Revalidate & Guardie Offline**: Inizializzare la UI con render ottimistico a 0ms (dati in cache o sintetici). Quando la richiesta di rete fallisce, impostare `networkStatus = 'offline'` e `_networkFailed = true`, impedendo alle letture di fallback sincrone da cache di ripristinare indebitamente il badge 'live'.

---

## 40. Fitts's Law su Viewport Mobili Compatti: Stepper Orario Dedicato, Bonifica Emoji Decorative e Tema Sunlight Mode
- **Problema**:
  1. Su schermi smartphone da 390px, la divisione dello scrubber orario in 13 slot produce colonne larghe ~28px, rendendo il tocco discreto del singolo slot orario difficoltoso con dita fredde o guanti da volo (Fitts's Law).
  2. La presenza di emoji decorative nei controlli e nei titoli riduce la nitidezza e il contrasto visivo all'aperto, violando il principio di sobrietÃ  visiva.
  3. L'uso esclusivo della tavolozza scura genera riflessi speculari sotto la luce solare zenitale diretta in alta montagna.
- **Causa Radice**:
  1. Conflitto geometrico tra l'esigenza di mostrare l'intera finestra diurna a colpo d'occhio (08:00â20:00) senza scroll orizzontale e il target touch minimo ($\ge 44\text{px}$).
  2. Residui di formattazione non strutturata con emoji invece di icone vettoriali semantiche conformi agli standard outdoor.
- **Pattern Vincolante**:
  1. **Stepper Fitts-Compliant**: Mantenere la visualizzazione compressa a 13 colonne per il colpo d'occhio e il dragging continuo, ma affiancarla con due pulsanti stepper (`<` e `>`) con area cliccabile virtuale estesa via pseudo-elemento `::before` a $\ge 44\times 44\text{px}$.
  2. **Iconografia Monocromatica Semantica**: Eliminare emoji decorative da pulsanti e titoli; utilizzare esclusivamente SVG monocromatici scalabili con attributi ARIA corretti.
  3. **Tavolozza Sunlight Light Mode**: Definire le variabili `[data-theme="light"]` con contrasto WCAG AAA ($\ge 7:1$) e sincronizzare reattivamente `document.documentElement` e `<meta name="theme-color">` tramite lo store.

---

## 41. Preferiti Pilota come Filtro Primario della Home e Gestione Migrazione Seed
- **Problema**: Mostrare tutti i comprensori del catalogo nazionale (135 siti) nella Home Dashboard satura la vista con localitÃ  irrilevanti per il pilota locale (es. siti di altre regioni lontane centinaia di km), degradando la glanceable UI e moltiplicando inutilmente il traffico di rete batch verso Open-Meteo.
- **Causa Radice**: Assenza di un filtro sui preferiti (`pinnedSpotIds`) a livello di radice della vista Home, che delegava il filtraggio esclusivamente alla ricerca testuale anzichÃ© al set di siti selezionati dal pilota nella vista Previsioni.
- **Pattern Vincolante**:
  1. **Home Filtrata su Preferiti Pilota**: In assenza di ricerca testuale attiva, la vista Home Dashboard deve istanziare e valutare esclusivamente i comprensori contrassegnati come preferiti (`state.pinnedSpotIds`), mantenendo come default iniziale il set essenziale locale del pilota (Chialamberto, Martiniana Po, Monte Cavallaria).
  2. **Ricerca Espansa On-Demand**: Quando l'utente digita una query di ricerca nella Home, la scansione si espande sull'intero catalogo normalizzato per consentire la rapida consultazione di qualsiasi sito, tornando automaticamente ai soli preferiti una volta cancellata la query.
  3. **Migrazione Trasparente dei Seed Legacy**: In fase di idratazione dello store da `localStorage` (`loadPersistedState`), intercettare le configurazioni seed legacy e migrarle automaticamente ai nuovi default senza richiedere pulizie manuali della cache del browser.
  4. **Stato Vuoto Esplicito & Call-to-Action**: Se l'utente rimuove tutti i preferiti, la lista non deve rimanere vuota o rotta, ma deve renderizzare un feedback esplicito con pulsante di navigazione diretta alla pagina Previsioni per consentire la selezione di nuovi spot con l'icona stella.

---

## 42. In-Flow Flex Docking vs `position: fixed` Subpixel Leakage su Display Hi-DPI
- **Problema**: Su display ad alta densitÃ  di pixel (`devicePixelRatio != 1`, es. 1.25, 1.5, 2.0) o con altezze decimali del viewport (es. 669.6px), barre o scrubber posizionati con `position: fixed; bottom: 0;` generano fessure subpixel (0.4px - 1px) attraverso le quali traspaiono elementi della pagina in fase di scorrimento. Inoltre, attribuire un padding artificiale (`pb-48`) al contenitore della pagina consente ai nodi del DOM di scorrere fisicamente sotto i componenti dockati.
- **Causa Radice**: Discretizzazione numerica tra coordinate CSS logiche (floating point) e pixel hardware fisici nei motori di rendering, combinata con layout fixed overlay in cui il contenitore scorrevole non Ã¨ limitato all'altezza utile effettiva.
- **Pattern Vincolante**:
  1. **In-Flow Flex Shell (Zero Fixed Overlays per Dock Primari)**: `#app-root` deve essere un flexbox a colonna rigido (`display: flex; flex-direction: column; height: 100dvh; max-height: 100dvh; overflow: clip;`).
  2. **Contenitore Utile Scorrevole Autonomo**: I contenuti scorrevoli di ciascuna vista devono essere incapsulati in un contenitore interno (`flex: 1 1 0%; min-height: 0; overflow-y: auto;`), la cui altezza termina esattamente sopra il primo componente dockato.
  3. **Docked Footers come Fratelli Flex In-Flow**: Elementi dockati in basso (come lo scrubber orario `.gm-timeline-scrubber-sticky` e la barra di navigazione `#bottom-nav-bar`) devono essere posizionati in-flow nel flexbox (`position: relative; flex-shrink: 0; width: 100%;`), garantendo adiacenza geometrica perfetta (0px di gap) e assenza totale di elementi scorrevoli al di sotto.
  4. **Sigillo Anti-Leak**: Applicare `overflow: clip` ad `#app-root` e `overflow: hidden` ad `html, body` e `#sheet-container`.

---

## 44. Catalogo Modelli di Parapendio, Filtro per Costruttore e Deduzione Aerodinamica Automatica per Vele Custom (Postel's Law / Tesler's Law)
- **Problema**: Limitare la selezione dell'attrezzatura di volo alle sole 4 classi generiche EN-A..EN-D obbliga il pilota ad approssimare la propria ala reale e non permette di memorizzare marca e modello specifici (es. "Ozone Buzz Z7", "Advance Iota DLS"). Al contempo, forzare l'utente a inserire manualmente parametri fisici complessi (velocitÃ  di trim, velocitÃ  di affondo, efficienza massima, allungamento alare) introduce forte attrito operativo e rischio di errori manuali.
- **Causa Radice**:
  1. Assenza di una base dati di ali certificate e categorizzate per costruttore.
  2. Modelli di configurazione che scaricano la complessitÃ  dei parametri fisici sull'utente anzichÃ© risolverla via software (violazione della Tesler's Law).
- **Pattern Vincolante**:
  1. **Catalogo Modelli Certificato Headless (`core/gliders.js`)**: Mantenere un catalogo curato e verificato empiricamente di oltre 50 modelli iconici dei principali 14 costruttori mondiali, con attributi completi (`brand`, `model`, `category`, `vTrim`, `vMax`, `glideRatio`, `ar`).
  2. **Interfaccia a Selezione Rapida (Filtri a Chip & Ricerca Istantanea)**: Nel modal sheet di selezione della vela, offrire una riga orizzontale a scorrimento di chip per marca (`.gm-glider-brand-chips`) combinata con una casella di ricerca reattiva a testo libero (`#glider-search-input`), azzerando il tempo di selezione a meno di 2 tap.
  3. **Deduzione Aerodinamica Automatica (Tesler's Law)**: In caso di modelli non ancora a catalogo, permettere l'inserimento libero di marca e modello; i parametri aerodinamici fondamentali vengono calcolati e dedotti automaticamente dalla classe EN indicata (`getGliderClassDefaults(category)`).

---

## 45. WAI-ARIA Focus Retention su Modali Nascosti e Discrepanza Interfaccia Router (`navigate` vs `navigateTo`)
- **Problema**:
  1. Alla chiusura dei pannelli o fogli modali (`#sheet-container`), i browser Chromium bloccano l'attributo emettendo l'avviso/errore: `Blocked aria-hidden on an element because its descendant retained focus. Avoid using aria-hidden on a focused element or its ancestor.`
  2. Al click su una localitÃ /comprensorio nella Home Dashboard per aprire il meteo, l'applicazione si blocca con `Uncaught TypeError: this.router.navigateTo is not a function`.
- **Causa Radice**:
  1. In `ui/sheetManager.js`, `containerEl.setAttribute('aria-hidden', 'true')` veniva invocato prima che il focus venisse rimosso o ripristinato dall'elemento figlio cliccato (es. `<button class="gm-glider-option-card">`), violando le specifiche WAI-ARIA 1.2 che vietano `aria-hidden="true"` su un nodo che contiene `document.activeElement`. Inoltre, `#sheet-container` non impiegava l'attributo standard `inert`.
  2. In `ui/router.js`, il metodo canonico di instradamento Ã¨ sempre stato denominato `navigate`, mentre in `HomeDashboardView.js` e `ForecastView.js` veniva invocato `this.router.navigateTo`. Nei test unitari, mock ad-hoc implementavano `navigateTo`, mascherando il disallineamento rispetto al router reale singleton.
- **Pattern Vincolante**:
  1. **Focus Evacuation & Inert Marking**: Prima di applicare `aria-hidden="true"` ad un contenitore modale in fase di chiusura (`closeSheet`), verificare se `containerEl.contains(document.activeElement)`. Spostare immediatamente il focus sul trigger di apertura precedente (`previousActiveElement`) oppure invocare esplicitamente `document.activeElement.blur()`. Contestualmente, applicare l'attributo standard `inert` (`containerEl.setAttribute('inert', ''); containerEl.inert = true;`) quando chiuso e rimuoverlo all'apertura (`containerEl.removeAttribute('inert'); containerEl.inert = false;`).
  2. **Interfaccia Router Resiliente**: `createRouter` in `ui/router.js` deve esportare l'alias `navigateTo: navigate`. Contestualmente, i view controller devono disporre di un metodo proxy sicuro `navigateTo(route, params)` che invoca `this.router.navigate || this.router.navigateTo`, garantendo robustezza assoluta sia con il router reale che con qualsiasi mock di test.
  3. **Zero Faux-Testing sui Router Mock**: Nei test unitari, i contratti mockati devono riflettere l'API standard del router singleton (`navigate`), evitando asimmetrie tra ambiente di collaudo e runtime browser di produzione.

---

## 46. Collapsing Sticky Header per ContinuitÃ  Cognitiva su Scroll (Recognition over Recall) & Defensive DOM Guards
- **Problema**:
  1. Durante lo scorrimento verso il basso in `ForecastView` (per consultare diagrammi del vento, radiosondaggi e briefing di Guido), i selettori di comprensorio e decollo scorrono fuori dal viewport. Il pilota perde l'ancoraggio visivo su quale decollo e quota siano selezionati, rischiando errori di valutazione sull'allineamento anemometrico del pendio (violazione dell'euristica NN/G #6 *Recognition over Recall*).
  2. L'aggiunta di listener di scroll sul contenitore ha provocato fallimenti nei test unitari con mock container minimalistici: `TypeError: this.containerEl.querySelector is not a function`.
- **Causa Radice**:
  1. Header monolitico che scorre interamente con il corpo della pagina, in assenza di una testata contestuale collassabile.
  2. Assunzione indebita della presenza di `querySelector` in mock container headless privi di layout engine o API DOM complete.
- **Pattern Vincolante**:
  1. **Collapsing Sticky Header Monofila GPU-Accelerato (`.gm-forecast-sticky-bar`)**: Posizionato con `position: absolute; top: 0; left: 0; right: 0; z-index: 25;` all'interno della vista relativa. A riposo (`scrollTop <= 60px`) Ã¨ nascosto con `transform: translateY(-100%); opacity: 0; pointer-events: none`. Quando `scrollTop > 60px`, scivola in vista (`transform: translateY(0); opacity: 1; pointer-events: auto`) mantenendo visibili comprensorio, decollo attivo con quota e orientamento, badge di freschezza dati (`Live Open-Meteo` o `Offline`) e pulsante di scroll-to-top rapido (`data-action="scroll-to-top"`).
  2. **Zero Layout Thrashing & Zero CLS**: Nessun reflow del contenitore scorrevole (CLS = 0) e listener di scorrimento passivo (`{ passive: true }`).
  3. **Guardie Difensive su Metodi DOM (`typeof querySelector === 'function'`)**: In tutti i view controller e componenti, verificare sempre `typeof this.containerEl.querySelector === 'function'` prima di invocare selettori avanzati o manipolare listener su sotto-nodi, garantendo compatibilitÃ  al 100% sia con i browser reali sia con i mock semplificati dei test unitari.

---

## 47. Vocabolario Semantico Aeronautico vs Modello Struttura Fisica: VolabilitÃ  ('Volabile' / 'Non Volabile' vs 'Aperto' / 'Chiuso')
- **Problema**: L'adozione dei termini "Aperto" e "Chiuso" per indicare la volabilitÃ  nelle card dei comprensori provocava disorientamento cognitivo nel pilota, inducendolo a credere che il sito fosse interdetto fisicamente, recintato o chiuso da un'ordinanza amministrativa, anzichÃ© indicare una condizione meteorologica avversa (es. raffiche forti). Inoltre, creava asimmetria rispetto alla legenda del calendario che riportava giÃ  "Volabile".
- **Causa Radice**: Trasposizione acritica di convenzioni UI da stazioni sciistiche o strutture commerciali chiuse/aperte verso un'applicazione di volo libero in cui i decolli montani sono siti naturali governati esclusivamente da aerologia e micro-meteorologia.
- **Pattern Vincolante**:
  1. **Terminologia di Dominio Aeronautica**: Utilizzare sempre la scala semantica di volabilitÃ  espressa dal punto di vista dell'ala e del pilota:
     - ð¢ **`Volabile`** (al posto di *Aperto*)
     - ð¡ **`Cautela`** (condizioni impegnative o al limite operativo)
     - ð´ **`Non Volabile`** (al posto di *Chiuso*)
     - â« **`Severo`** (turbolenza estrema, temporali o NO-FLY)
  2. **Coerenza Orizzontale Trasversale**: Mantenere la stessa identica etichettatura testuale in tutti i layer: algoritmo di sintesi comprensorio ([`core/comprensorio.js`](file:///c:/github/GlideMind/core/comprensorio.js)), resolver giornaliero ([`core/flyability.js`](file:///c:/github/GlideMind/core/flyability.js)), preset date ([`core/datePresets.js`](file:///c:/github/GlideMind/core/datePresets.js)), legende del calendario e badge a colpo d'occhio ([`ui/views/HomeDashboardView.js`](file:///c:/github/GlideMind/ui/views/HomeDashboardView.js), [`ui/views/ForecastView.js`](file:///c:/github/GlideMind/ui/views/ForecastView.js)).

---

## 48. Lingua Inglese Esclusiva nel Codice Sorgente e Governance Regole Antigravity
- **Problema**: In assenza di una direttiva prescrittiva montata nel system prompt globale e di workspace, l'agente puÃ² introdurre commenti, identificatori, descrizioni di test o messaggi di errore in italiano o linguaggi misti, degradando la leggibilitÃ  e l'interoperabilitÃ  del codebase. Inoltre, se un workspace non possiede il file canonico `AGENTS.md` alla radice, le specifiche in `.agents/rules/` rimangono dormienti e non vengono iniettate all'avvio.
- **Causa Radice**: Mancata formalizzazione dello standard nel plugin globale `engineering-workflow` e assenza del file root `AGENTS.md` nel workspace per l'ingestion gerarchica di Antigravity.
- **Pattern Vincolante**:
  1. **Standard Globale (`engineering-workflow/rules/AGENTS.md`)**: Tutto il codice sorgente (nomi di variabili, funzioni, classi, file, commenti `//`, docstring JSDoc, test unitari `describe`/`it`, eccezioni e commit Git) deve essere redatto esclusivamente in lingua inglese. L'interfaccia utente (UI copy e file di localizzazione) segue la lingua target di prodotto, mantenendo chiavi e commenti in inglese.
  2. **Attivazione Workspace (`AGENTS.md`)**: La radice del repository deve sempre ospitare `AGENTS.md` con l'inclusione attiva dei vincoli architetturali (`@[...]`), garantendo il montaggio deterministico delle direttive in ogni sessione.

---

## 49. NeutralitÃ  del Selettore Temporale nelle Viste Multi-Sito vs Viste Dettaglio
- **Problema**: Mostrare badge o dot di volabilitÃ  (es. "Volabile", "Non Volabile") nel selettore di data della Home Dashboard induceva un grave bias cognitivo e di sicurezza per il pilota: mancando uno spot selezionato, il calcolo ripiegava silenziosamente sul primo comprensorio del catalogo (Monte Cornizzolo). Se a Cornizzolo c'era vento forte da Sud, il calendario indicava la giornata come "Non Volabile", inducendo il pilota a credere che l'intera regione non fosse volabile, mentre in altre vallate con diversa esposizione le condizioni erano ottimali.
- **Causa Radice**: Sovrapposizione indebita tra il selettore di navigazione temporale di una vista aggregata multi-sito (Home) e il calendario di valutazione micro-meteorologica di un singolo sito montano (`ForecastView`).
- **Pattern Vincolante**:
  1. **Selettore Date Neutro nelle Viste Globali/Catalogo (`HomeDashboardView`)**: Quando il contesto operativo comprende molteplici comprensori orograficamente diversi, il selettore date (quick tabs e bottom sheet calendario) deve rimanere **neutro** (date, giorni, mesi, indicatore di orizzonte sinottico per > 7gg), senza dot o badge di volabilitÃ  ancorati a spot sentinella arbitrari e senza legende semantiche per singolo sito. Il suo scopo esclusivo Ã¨ consentire il cambio di data per filtrare e riordinare la classifica dei comprensori.
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
  5. **Event Delegation su Container Persistente (`input`)**: I listener per campi di input di ricerca non devono essere agganciati direttamente al singolo elemento `input` (che viene ricreato a ogni re-render asincrono della vista indotto da store o caricamento catalogo), bensÃ¬ delegati sul contenitore principale persistente (`this.containerEl.addEventListener('input', ...)`), garantendo che l'interazione da parte dell'utente non si disattivi mai.
  6. **Soppressione Controlli Nativi Duplicati nei Campi `type="search"`**: Quando si implementa un pulsante custom di cancellazione (per garantire target touch outdoor $\ge 44\text{px}$ conforme a Fitts), Ã¨ obbligatorio sopprimere via CSS i bottoni nativi del browser (`.gm-search-input::-webkit-search-cancel-button { -webkit-appearance: none; display: none; }`) per prevenire la comparsa di due icone 'X' affiancate.

---

## 51. Governance UX Dati Meteo Offline & Gestione Dati Non Disponibili (Zero Mock Mascherati)
- **Problema**: In assenza di connessione o selezionando una data futura non presente in cache, le card degli spot mostravano parametri meteo concreti (es. "15 km/h da SW", "Raffiche Moderate") e verdetti di volo ("CAUTELA", "NON VOLABILE") calcolati su costanti di fallback o su cache di giorni precedenti, mentre il badge di stato rimaneva bloccato in "AGGIORNAMENTO...". Questo induceva nel pilota la convinzione ingannevole e pericolosa che esistesse una reale previsione per quella data.
- **Causa Radice**: 
  1. `evaluateComprensorio` nel Core iniettava valori sintetici arbitrari (`windSpeed = 12`, `windDir = 180`) quando `weatherData` era `null`.
  2. La mappa cache della Home indicizzava i payload unicamente per `spotId` anzichÃ© per `spotId_targetDate`.
  3. Il fallimento o l'assenza di dati nella chiamata batch non commutava lo stato di loading allo stato terminale offline.
  4. `fetchBatchComprensoriWeather` richiedeva staticamente solo 2 giorni di previsione (`forecast_days = 2`).
- **Pattern Vincolante**:
  1. **Divieto di Dati Mascherati (Zero Placebo)**: Se non esistono dati orari reali in cache per la data attiva, la card DEVE mostrare lo stato neutro `Dati N/D` (`.gm-badge-nd`), sostituire il vento con `-- km/h` ed esplicitare `Previsione non disponibile offline`. Ã vietato calcolare verdetti o visualizzare direzioni/raffiche stimate.
  2. **Preservazione Geometria Orogrorafica**: L'efficienza geometrica di planata tra decollo e atterraggio primari (`1:X.X`) e le quote devono essere sempre visualizzate poichÃ© sono costanti geografiche certe e non dipendono dalla rete.
  3. **Tassonomia dei 3 Stati**: Distinguere rigorosamente tra Cache Valida (`Offline / Stima`), Assenza Dati (`Dati N/D`) e Transitorio di Caricamento (Skeleton screen a struttura fissa anti-CLS se privi di cache).
  4. **Chiusura Deterministica del Loading**: Qualsiasi operazione asincrona di fetch deve ripulire la guardia `isLoading` in blocco `finally` e commutare il badge su `'offline'` in caso di insuccesso.

---

## 52. Ergonomia Date Picker Mobile (Scroll-Snap Orizzontale), Contrasto Sunlight WCAG AA e WAI-ARIA Tablist Compliance
- **Problema**:
  1. Su viewport mobile stretti ($\le 390\text{px}$, es. iPhone SE o schermi Android da 360px), i pulsanti preset data (4 preset + calendario + eventuale data custom attiva) superano la larghezza orizzontale utile, causando a capo irregolari o inducendo lo scorrimento orizzontale accidentale dell'intero viewport applicativo, violando il vincolo *Zero Horizontal Scrollbar*.
  2. Nei contenitori con semantica `role="tablist"`, la presenza di controlli privi di `role="tab"` e `aria-selected` corrompe l'albero di accessibilitÃ  WAI-ARIA.
  3. Nella modalitÃ  ad alta luminanza (*Sunlight Mode* / `[data-theme="light"]`), il testo bianco `#ffffff` sui pulsanti e tab attivi color ambra (`--gm-accent: #d97706`) presenta un contrasto di appena 3.2:1, fallendo il requisito WCAG AA ($\ge 4.5:1$) e compromettendo la leggibilitÃ  sotto la luce solare diretta.
  4. Nei controller delle viste, eseguire `store.setState({ activeDate })` e contestualmente invocare manualmente `render()` e chiamate asincrone di rete genera doppi rendering e doppie query di rete, poichÃ© il listener reattivo dello store scatta sincronicamente alla mutazione dello stato.
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

## 53. VisibilitÃ  dei Modal Sheet e Coerenza di Transizione Scale/Opacity in ModalitÃ  Desktop
- **Problema**: In modalitÃ  desktop (`min-width: 768px` e `min-height: 550px`), cliccando sul pulsante del date picker (o su qualsiasi altro drawer/sheet gestito da `openSheet()`, come il selettore comprensori o il selettore delle vele), lo schermo si oscurava con il backdrop, ma la finestra modale non appariva, risultando completamente invisibile.
- **Causa Radice**:
  1. Nella media query desktop, `.gm-sheet` Ã¨ configurato come dialogo modale centrato a transizione di scala (`transform: scale(0.95); opacity: 0;`).
  2. All'attivazione dello sheet (aggiunta della classe `.active` a `#sheet-container`), la regola CSS base a livello globale impostava solo `transform: translateY(0);` senza specificare `opacity: 1;`.
  3. Nella media query desktop mancava la dichiarazione per `#sheet-container.active .gm-sheet`, lasciando l'opacitÃ  bloccata a zero (`opacity: 0`). Di conseguenza, il pannello veniva renderizzato a schermo ma con il 100% di trasparenza.
- **Pattern Vincolante**:
  1. **Garanzia di OpacitÃ  Attiva**: Qualsiasi stato attivo di un contenitore di overlay deve forzare esplicitamente `opacity: 1;` sia nella dichiarazione di default mobile (`#sheet-container.active .gm-sheet { transform: translateY(0); opacity: 1; }`) sia nelle varianti desktop centrate (`#sheet-container.active .gm-sheet { transform: scale(1); opacity: 1; }`).
  2. **Soppressione Controlli Touch Mobile su Desktop**: Nelle viste modali desktop, nascondere sempre elementi di trascinamento touch concepiti esclusivamente per smartphone (`.gm-sheet-handle-bar { display: none; }`).
---

## 54. Ergonomia dello Scrubber Orario: Profilo Continuo Ultracompatto, Indicatore 'ORA' Situazionale e Contrasto WCAG 2.1 Non-Text
- **Problema**:
  1. Nello scrubber orario sticky di `ForecastView`, la presenza dell'header superiore con il testo "Scrubber Orario" e il controllo stepper `< ORE SELEZIONATE: 10:00 >` introduceva gergo tecnico interno, duplicava l'informazione giÃ  visibile nella colonna selezionata e consumava ~36-40px verticali preziosi su schermi smartphone a `100dvh`.
  2. Quando l'utente consulta le previsioni del giorno stesso ("oggi"), mancava qualsiasi indicatore per distinguere l'ora reale corrente (`now`) dalle ore passate o future, degradando la *situational awareness*.
  3. L'indicatore di volabilitÃ  era una barretta sottile (9px) a riempimento parziale (30% per non volabile = appena 9.6px di altezza), risultando invisibile all'aperto a distanza di braccio.
  4. In modalitÃ  chiara (`[data-theme="light"]`), lo slot della capsula (`#e2e8f0`) su sfondo bianco card (`#ffffff`) aveva un contrasto di appena 1.27:1 (fallimento del requisito WCAG 2.1 SC 1.4.11 $\ge 3:1$ per componenti grafici/UI), scomparendo sotto luce solare diretta.
- **Causa Radice**:
  1. I controlli stepper erano stati concepiti come mitigazione per target discreti stretti prima che venisse implementato lo scorrimento continuo orizzontale a trascinamento (*drag/slide gesture* con pointer capture).
  2. Mancanza di correlazione tra `this.activeDate` e l'orologio di sistema locale.
  3. Approccio a colonnina di mercurio percentuale inadatto a comunicare un segnale qualitativo semaforico.
  4. Assenza di bordo di contrasto e sfondo definito per lo slot della barra in tema chiaro.
- **Pattern Vincolante**:
  1. **Scrubber a Profilo Singolo Puro**: Rimuovere gli header tecnici e i controlli duplicati. La timeline oraria Ã¨ un carosello continuo a 13 slot (08..20) interattivo via tocco e scorrimento a trascinamento orizzontale continuo, con supporto tastiera (frecce sinistra/destra).
  2. **Marcatore Situazionale 'ORA' (Today)**: Quando `this.activeDate === formatDateIso(new Date())`, la colonna corrispondente a `currentHour` riceve la classe `.is-now` con badge assoluto `.compact-now-badge` ("ORA") posizionato a zero displacement flex, mentre le ore passate (`h < currentHour`) ricevono attenuazione visiva (`.is-past` a opacitÃ  0.6 quando non attive).
  3. **VisibilitÃ  Semaforica Potenziata**: Larghezza della capsula estesa da 9px a **14px**, con sfondo colorato abbinato allo stato (`var(--gm-status-*-bg)`) e riempimento solido ad alto contrasto (100% per volabile, 65% per cautela, 35% per non volabile).
---

## 55. Prevenzione Artefatti Sticky Hover & Focus su Scrubbers e Slider Touch (Pointer Capture)
- **Problema**: Eseguendo lo swipe con il dito sullo scrubber orario (es. toccando l'ora 12 e trascinando fino all'ora 17), l'ora iniziale (12) manteneva uno sfondo evidenziato bluastro (`#2e3549`), facendo apparire contemporaneamente due colonne selezionate.
- **Causa Radice**:
  1. **Sticky Hover su Schermi Touch**: I browser mobile (WebKit/Blink) emulano gli eventi mouse al tocco. La regola `.gm-timeline-col-compact:hover { background-color: var(--gm-bg-hover); }` priva di media query faceva sÃ¬ che l'elemento inizialmente toccato conservasse permanentemente la pseudo-classe `:hover` (`#2e3549`) anche dopo che il dito si era spostato su un'altra colonna.
  2. **Stale Focus**: L'elemento iniziale con `tabindex="0"` riceveva il focus DOM al `pointerdown`, mantenendo lo stato `:focus` fino a un successivo tocco esterno.
  3. **Rischio Synthetic Click**: Al rilascio del dito dopo il trascinamento (`pointerup`), il browser poteva emettere un evento sintetico `click` sull'elemento originario.
- **Pattern Vincolante**:
  1. **Hover Confinato a Dispositivi con Mouse**: Includere sempre qualsiasi regola `:hover` per elementi di scrubber/slider all'interno di `@media (hover: hover) and (pointer: fine)`. Su dispositivi touch (`hover: none`), l'hover Ã¨ disattivato alla radice.
  2. **Roving Tabindex**: Impostare `tabindex="0"` esclusivamente sulla colonna attiva (`isActive`), e `tabindex="-1"` su tutte le altre.
  3. **Blur Deterministico al Pointer Interaction**: Invocare `document.activeElement.blur()` su `handlePointerDown` e `handlePointerUp` se il focus risiede all'interno del container della timeline.
  4. **Guardia Anti-Trailing Click**: Tracciare lo spostamento orizzontale durante il pointer move (`hasDraggedPointer = true` se $\Delta x > 4\text{px}$) e sopprimere l'azione `select-hour` nei gestori di `click` sintetici successivi.

---

## 56. Indicatori Qualitativi a 4 Stati (Verde, Giallo, Rosso, Nero) nella Triage Home e Prevenzione Starvation Flexbox nei Nomi dei Decolli
- **Problema**: Includere numeri grezzi (km/h, gradi, rapporto 1:X) incapsulati in capsule pesanti con sfondi colorati e bordi (`.gm-ind-pill`) nella riga decollo/atterraggio della Home Dashboard creava un sovraccarico visivo anti-Gestalt (violazione della **Legge di PrÃ¤gnanz** con badge multipli in competizione nella stessa card). Inoltre, la larghezza combinata delle due capsule a destra (>240px) affamava il contenitore flessibile di sinistra, provocando il troncamento severo del nome del decollo (es. `Ciavanis` troncato in `(1780`).
- **Causa Radice**:
  1. Utilizzo improprio di contenitori stile badge (`border`, `background`, `padding`) per indicatori semaforici secondari all'interno di una card che possiede giÃ  un badge primario di verdetto (`VOLABILE`).
  2. Violazione del principio di progressive disclosure: esposizione obbligatoria dei numeri fisici inline invece di delegarli a tooltip/progressive disclosure o schermi larghi.
  3. Gestione flexbox asimmetrica: `.gm-flight-data` aveva `white-space: nowrap; flex-shrink: 0;` mentre `.gm-flight-target` veniva compresso a larghezza zero prima dell'altitudine.
- **Pattern Vincolante**:
  1. **Indicatori Semaforici Senza Bordo e Senza Sfondo (`background: transparent; border: none; padding: 0;`)**: I sub-indicatori di riga devono consistere unicamente in un dot circolare semaforico da 6.5px (`.gm-ind-dot`) con bagliore coerente allo stato e label testuale ad alta leggibilitÃ  (`0.72rem`, `font-weight: 600`).
  2. **Quattro Stati Aereonautici Vincolati al Calcolo di Dominio (SSOT Vela)**:
     - 0 (Verde / Volabile / Ottimale): `Vento OK`, `In asse`, `Rientro agevole`.
     - 1 (Giallo / Cautela / Marginale): `Sostenuto`/`Raffiche mod.`, `Traverso`, `Nel cono`.
     - 2 (Rosso / Non Volabile / Critico): `Vento forte`/`Raffiche forti`, `In coda`, `Rientro critico`.
     - 3 (Nero / Pericoloso / NO FLY): `NO FLY`, `Sottovento`, `Fuori cono`. (In dark mode: dot nero bordato in rosso pericolo `1.5px solid #ef4444`).
  3. **Progressive Disclosure dei Numeri Fisici**: I numeri di dettaglio (`15 km/h`, `da SW 212Â°`, `1:2.5`) risiedono nell'attributo `title` per l'ispezione/hover e in una classe `.gm-ind-micro` nascosta di default su mobile (`display: none`), preservando il budget di larghezza degli indicatori a $\le 110\text{px}$.
  4. **Protezione Layout Flexbox con Altitudine Inviolabile**: Nel contenitore `.gm-flight-label`, impostare `min-width: 0; flex: 1 1 auto;`, su `.gm-flight-target` impostare `min-width: 0; flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis;` e su `.gm-flight-alt` impostare tassativamente `flex-shrink: 0;`. CiÃ² garantisce che i nomi dei decolli/atterraggi dispongano sempre di oltre 180px di respiro, eliminando ogni rischio di troncamento.





---

## 57. Shift-Left Quality Gate vs ReattivitÃ  Post-Hoc: Dai Controlli Successivi ai Vincoli Generativi
- **Problema**: Il processo di sviluppo ricorreva a cicli iterativi di rework: (1) richiesta utente $\to$ (2) implementazione del flusso principale $\to$ (3) riscontro utente di difetti grafici, acronimi crudi o violazioni ergonomiche $\to$ (4) invocazione manuale degli audit (`laws-of-ux-audit`, `novice-pilot-auditor`, regression testing) $\to$ (5) reiterazione correttiva.
- **Causa Radice**: Trattare i vincoli ergonomici, le leggi UX e le specifiche di vocabolario aeronautico come *controlli diagnostici ex-post* invocati su richiesta anzichÃ© come *vincoli generativi obbligatori ex-ante* (Shift-Left).
- **Pattern Vincolante**:
  1. **Adozione del Protocollo Shift-Left**: Prima di presentare qualsiasi codice all'utente, l'agente deve applicare autonomamente la matrice a 5 Gate (`.agents/rules/shift_left_quality_gate.md`).
  2. **Automated Governance Gate (`shiftLeftGovernance.test.mjs`)**: La suite `npm test` include asserzioni automatiche su isolamento headless, traduzione fenomenologica obbligatoria (divieto di acronimi crudi isolati come CAPE o LCL), divieto di numeri nudi (`compact-wind`), floor Fitts $\ge 48\text{px}$, protezione landscape mobile e conformitÃ  al tema chiaro Sunlight Mode.
  3. **Zero Turn Yielding su Codice Non Conforme**: Vietato restituire il turno con la sola implementazione logica delegando all'utente la verifica visiva ed ergonomica. Il codice consegnato deve giÃ  incorporare tutte le protezioni di layout, vocabolario e accessibilitÃ .

---

## 58. Badge di Stato a Simbolo Geometrico Avionico (WCAG 1.4.1), Chip di Filtro Rapido VolabilitÃ  (Hick's Law) ed Explainability Multi-Rischio
- **Problema**:
  1. Le scritte di testo estese ("NON VOLABILE", "CAUTELA", "VOLABILE") nelle pillole dei comprensori consumavano 75-90px di spazio orizzontale su schermi mobile da 390px, aumentando il rischio di troncamento dei nomi dei siti o competendo visivamente con la freccia di espansione. Rimuovere completamente il testo affidandosi solo al colore viola il requisito WCAG 2.1 SC 1.4.1 (Use of Color), rendendo l'interfaccia inaccessibile a piloti con deficit visivi (daltonismo) o con lenti da sole polarizzate in pieno giorno.
  2. In giornate meteorologiche marginali o avverse, scorrere decine di comprensori senza poter filtrare a colpo d'occhio solo i siti volabili rallentava drasticamente il processo decisionale pre-volo (violazione della Hick's Law).
  3. Quando un comprensorio presentava sia un decollo sfavorevole (es. vento forte) sia un rientro critico/fuori cono all'atterraggio, l'algoritmo di sintesi riportava solo il primo fattore, mascherando il pericolo geometrico d'atterraggio (violazione di Explainability e Tesler's Law).
- **Causa Radice**:
  1. Conflitto tra brevitÃ  di layout orizzontale su mobile ed eliminazione imprudente dei canali non cromatici.
  2. Assenza di un filtro di stato di 1Â° livello nella Home Dashboard.
  3. Branching condizionale `if-else` esclusivo nella composizione della motivazione nel Core (`core/comprensorio.js`).
- **Pattern Vincolante**:
  1. **Simboli Geometrici Avionici Compatti (Standard ForeFlight/SkyDemon)**: I badge di stato nella testata della card adottano una geometria quadrata/circolare compatta da $26\times 26\text{ px}$ con riempimento solido ad alto contrasto (WCAG AA/AAA $\ge 4.5:1$ fino a $7.9:1$) e simbolo geometrico esplicito:
     - `â` (Verde solido): Volabile
     - `â²` (Ambra solido): Cautela
     - `â` (Rosso rubino solido): Non Volabile
     - `â¡` (Rosso/Nero pericolo): Severe / Condizioni proibitive
     - `â` (Grigio ardesia solido): Dati meteo non disponibili (N/D)
     La conformitÃ  WCAG Ã¨ garantita dalla combinazione quadrivalente: **Colore + Forma + Simbolo geometrico + `aria-label` / `title`**.
  2. **Chip di Filtro Rapido VolabilitÃ  (`Tutti (N)` vs `Volabili / Cautela (M)`)**: Sotto la barra di ricerca, offrire due chip a tocco rapido (touch target visivo $\ge 36\text{px}$, area di tocco estesa) con contatore dinamico (`this.flyabilityFilter`). Gestire l'empty state dedicato con un'azione di reset rapido a 1 tap.
  3. **Explainability Multi-Rischio nel Core Headless**: Quando sia il decollo sia l'atterraggio presentano allerte concorrenti (`takeoffSeverity >= 2` o `= 1` e `!glideMetrics.isSafe`), la stringa `reason` deve obbligatoriamente combinare entrambi i fattori separati da un bullet centrale (`â¢`), prevenendo il mascheramento del rischio d'atterraggio.

---

## 59. Riprogettazione UI/UX Previsioni: Parametri Glanceable a 4 Stati, Accordion con Consigli Pilota e Vista Sincronizzata Multi-Grafico (Nowcast Integration)
- **Problema**:
  1. La visualizzazione meteorologica oraria era frammentata in pannelli isolati (vento e radiosondaggi) privi di una sintesi organica a colpo d'occhio sui fattori determinanti del volo libero (vento, raffiche, base cumulo, CAPE, turbolenza, insolazione, rientro in atterraggio).
  2. Mancava un pattern di progressive disclosure omogeneo per approfondire i singoli parametri con dati analitici, consigli pratici di sicurezza (Novice Pilot Spec) e grafici di tendenza oraria.
  3. L'utente non poteva confrontare simultaneamente i trend di tutti i parametri fisici su un unico asse orario per cogliere a colpo d'occhio l'evoluzione del ciclo diurno (innesco termico, rinforzo vento, rischio sovrasviluppi pomeridiani).
  4. L'etichetta "â¢ Live" nella testata delle previsioni induceva confusione facendo credere che i dati provenissero da un anemometro fisico reale sul decollo, mentre si trattava di modelli numerici (Open-Meteo). Inoltre, consultando la giornata odierna ("Oggi"), la vista si posizionava staticamente sulle 13:00 anzichÃ© mostrare immediatamente l'ora reale corrente.
- **Causa Radice**:
  1. Architettura UI a sezioni chiuse e prive di una matrice comune di valutazione dei parametri.
  2. Assenza di una vista multi-grafico aggregata sincronizzata sullo stesso intervallo diurno 08:00-20:00.
  3. Mancanza di disaccoppiamento tra stato di connettivitÃ  API e telemetria live sul campo, e mancata risoluzione automatica dell'ora odierna.
- **Pattern Vincolante**:
  1. **Triage Glanceable a 7 Parametri (`computeParamMetrics`)**: Modellare e presentare tutti i 7 fattori chiave (vento decollo, raffiche & delta, base cumulo LCL, instabilitÃ  CAPE, turbolenza EDR, copertura nuvolosa, atterraggio) con indicatori semaforici a 4 stati (verde, giallo, rosso, nero/severe), etichetta di testo e valore sintetico con unitÃ  esplicita.
  2. **Accordion a Svelamento Progressivo**: Tocco sul parametro con touch target $\ge 48\text{px}$ per mostrare griglia analitica a 2 colonne, box "Consiglio Pilota" con raccomandazioni per piloti principianti ed EN-A, e grafico orario di tendenza vettoriale SVG.
  3. **ModalitÃ  Alternativa "Solo Grafici" (`forecastMode === 'charts'`)**: Barra di switch `Schede` vs `Solo Grafici` (zero emoji decorative) con stack compatto di 6 curve diurne sincronizzate con cursore verticale coordinato sull'ora attiva.
  4. **Nowcast Context & Pulizia Badge**: Risoluzione automatica dell'ora iniziale (`_resolveInitialHour`: ora locale corrente per oggi, 13:00 per date future); eliminazione del badge ingannevole "Live" nella testata previsionale numerica.

---

## 60. Mappa Comprensori con Headless Adapter, Progressive Scaling a 3 Livelli e Cono di Planata Corretto per Vento
- **Problema**: L'integrazione di una cartografia mobile ad alta densitÃ  per 134 comprensori alpini e appenninici rischiava di incorrere in:
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
     - *Zoom >= 9.0 (Micro)*: Vettori ad alta fedeltÃ  con azimut decollo, freccia del vento reale calcolata a quota decollo (`XX km/h DIR (quota slm)`), e linea geodetica colorata in base all'efficienza con vento.
  3. **Cono di Planata con Correzione Vento (`calculateWindCorrectedGlideRatio`)**: Calcolare la velocitÃ  al suolo effettiva $v_{\text{ground}} = \max(5, v_{\text{trim}} - v_{\text{headwind}})$ e l'efficienza richiesta sul terreno ($E_{\text{richiesta\_vento}} = E_{\text{still}} \cdot \frac{v_{\text{trim}}}{v_{\text{ground}}}$), segnalando rientri critici o impossibili in caso di forte vento contrario.
  4. **Pulsante 1-Tap "Top Spot" & Scrubber Dockato (Thumb Zone)**: Barra superiore con raccomandazione immediata del miglior comprensorio volabile della macro-regione attiva all'ora selezionata, e timeline oraria dockata a filo sopra la navbar con clearance $\ge 24\text{px}$ e `touch-action: pan-x`.
  5. **Dual Theme Tile Switching**: Commutazione trasparente tra CartoDB Dark Matter e CartoDB Positron/Sunlight Mode all'evento `themeChange` senza ricaricamento di pagina.

---

## 61. Smussamento Vettoriale dei Grafici Meteo tramite Spline Monotona (Fritsch-Carlson) e Zero Overshoot
- **Problema**: Il rendering delle serie orarie meteorologiche (vento, raffiche, base cumulo LCL, CAPE, turbolenza EDR, copertura nuvolosa e brezza di valle) tramite polilinee spezzate (`<polyline points="...">` o sequenze lineari `L x y`) produceva curve angolari con spigoli vivi a ogni marcatore orario. Questo approccio generava affaticamento visivo all'aperto sotto forte contrasto solare e travisava visivamente l'evoluzione continua dei gradienti termodinamici e fluidodinamici dell'atmosfera.
- **Causa Radice**: Connessione diretta punto-punto senza interpolazione di forma. L'applicazione di spline BÃ©zier cubiche convenzionali prive di controllo di monotonicitÃ  causa tipicamente overshooting (creste che superano i massimi fisici o scendono sotto zero generando valori impossibili di CAPE o vento negativo).
- **Pattern Vincolante**:
  1. **Interpolazione Spline Monotona Cubica (`buildSmoothPath`)**: Implementare l'algoritmo di Fritsch-Carlson per calcolare i punti di controllo BÃ©zier cubici (`C cp1x,cp1y cp2x,cp2y x,y`). Quando due segmenti consecutivi cambiano pendenza ($s_{i-1} \cdot s_i \le 0$), la tangente viene forzata orizzontale ($m_i = 0$), garantendo zero overshooting ed eliminando cuspidi sia sui picchi che sulle valli. Nei tratti monotoni, il gradiente Ã¨ calcolato tramite media armonica ponderata.
  2. **Tracciamento Coordinato dell'Area Sottesa (`buildSmoothAreaPath`)**: Le campiture ombreggiate (fill delle raffiche, instabilitÃ  CAPE, turbolenza ed insolazione) devono seguire la medesima curva cubica della linea superiore (`M x0,baselineY L x0,y0 C ... L xN,baselineY Z`), evitando qualsiasi disallineamento geometrico tra bordo e campitura.
  3. **Attributi SVG di FluiditÃ  Visiva**: Configurare sempre `stroke-linecap="round"` e `stroke-linejoin="round"` sui tracciati vettoriali per garantire una resa grafica priva di artefatti ad alta risoluzione su display retina e smartphone outdoor.

---

## 62. Stato Iniziale Collassato delle Sezioni Parametri nelle Previsioni (Hick's Law & Glanceable Overview)
- **Problema**: L'apertura predefinita forzata della prima sezione/scheda ("Vento in Decollo") al montaggio della vista Previsioni espandeva immediatamente il corpo dell'accordion (dettagli analitici, consiglio pilota e grafico orario SVG), occupando gran parte della vista verticale e costringendo il pilota a scorrere la pagina per scoprire lo stato degli altri 6 parametri critici (raffiche, base cumulo, instabilitÃ  CAPE, ecc.).
- **Causa Radice**: Inizializzazione arbitraria di `this.expandedCardId = 'vento-decollo'` anzichÃ© `null` nel costruttore del controller.
- **Pattern Vincolante**:
  1. **Inizializzazione Neutra Collassata**: Impostare `this.expandedCardId = null;` nel costruttore, nel metodo di montaggio vista (`mount`) e in qualsiasi selezione o cambio di comprensorio (`pick-spot`, `forecast-spot-select`).
  2. **Panoramica a Colpo d'Occhio (Glanceable Triage)**: All'ingresso nella vista, tutte le schede dei parametri devono mostrarsi nella loro forma sintetica chiusa (titolo, semaforo a 4 stati, etichetta e valore chiave con unitÃ ), permettendo al pilota una scansione cognitiva completa in meno di 2 secondi, riservando l'espansione e i dettagli analitici al tocco esplicito.




---

## 63. Preservazione del DOM Cartografico nello Scrubbing Temporale ad Alta Frequenza & Igiene di Gate 1
- **Problema**:
  1. Durante lo scorrimento continuo dello scrubber orario in `ForecastView.js` (08:00 - 20:00), l'aggiornamento dell'intera scheda spot tramite `spotCardContainer.innerHTML = ...` distrugge e ricrea il nodo DOM del canvas Leaflet a ogni tick (13 volte al secondo), azzerando le istanze di mappa, innescando layout thrashing, provocando flickering visibile dei tile e riducendo il framerate a <10 FPS.
  2. Nei test di Shift-Left Quality Gate (`tests/ui/shiftLeftGovernance.test.mjs`), la presenza della parola `HTMLElement` all'interno di un commento in un file `core/*.js` fa fallire il Gate 1 (Headless Core) a causa della scansione testuale statica del file.
  3. L'uso dell'operatore modulo `%` in JavaScript su angoli negativi multipli di 360 (es. `-360 % 360`) restituisce il valore `-0`, che in `node:assert/strict` fallisce contro `0` (`AssertionError: + -0, - 0`).
- **Causa Radice**:
  1. Mancata separazione fisica tra i contenitori delle metriche testuali effimere e il contenitore persistente del componente cartografico.
  2. Scansione statica per stringhe vietate senza parsing AST nel test di governance.
  3. Comportamento floating-point IEEE 754 con segno sui numeri reali.
- **Pattern Vincolante**:
  1. **Disaccoppiamento dei Sub-Contenitori DOM**: La scheda dello spot deve essere strutturata con due sub-container separati: `#forecast-spot-metrics-container` (aggiornato chirurgicamente via `innerHTML` su `setHour`) e `#forecast-mini-map-container` (persistente, non toccato da `setHour`). L'aggiornamento del marker manica a vento avviene esclusivamente a livello di stile/proprietÃ  tramite l'adapter cartografico (`updateWindsockMarker`), mantenendo il canvas Leaflet intatto a 60 FPS.
  2. **Igiene del Core Headless**: Nei moduli `core/*.js`, evitare categoricamente l'uso di qualsiasi token DOM (`HTMLElement`, `window`, `document`, `querySelector`) persino nei commenti o JSDoc.
  3. **Normalizzazione Sicura Angoli**: Utilizzare sempre la formula `const a = ((num % 360) + 360) % 360; return a === 0 ? 0 : a;` per garantire che qualsiasi angolo risulti strettamente in `[0, 360)` con valore zero privo di segno.

---

## 64. Deprecazione Accesso Anonimo ai Tile CartoDB/Stadia e Adozione Tile Server Keyless Esri (Dark Gray & World Topo)
- **Problema**: Le mappe interattive (sia Mini Mappa orografica in Previsioni sia Mappa Decolli globale) mostravano tile con watermark diagonale "API KEY REQUIRED carto.com/basemaps/apikey", degradando la visibilitÃ  della cartografia di sfondo e dell'orografia.
- **Causa Radice**: CARTO ha introdotto l'obbligo di API key sugli endpoint raster `basemaps.cartocdn.com` (`dark_all`, `rastertiles/voyager`), restituendo tile degradate con filigrana per richieste prive di credenziali.
- **Pattern Vincolante**:
  1. **Provider Esri ArcGIS Online Keyless**: Adottare i server globali Esri ArcGIS Online ad alta disponibilitÃ  distribuiti su CDN Akamai, privi di vincoli di API key per visualizzazione pubblica:
     - Tema Scuro (Cockpit): `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}` (`maxZoom: 19`, `maxNativeZoom: 16`).
     - Tema Chiaro (Sunlight Topo): `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}` (`maxZoom: 19`, `maxNativeZoom: 19`).
  2. **Configurazione `maxNativeZoom`**: Per i layer raster la cui risoluzione nativa termina prima del massimo consentito (es. Esri Dark Gray a zoom 16), impostare `maxNativeZoom: 16` con `maxZoom: 19` in Leaflet `L.tileLayer` per abilitare l'auto-scaling vettoriale/CSS trasparente senza richieste a vuoto.
  3. **Ordine Parametri Tile ArcGIS `{z}/{y}/{x}`**: Nei servizi REST ArcGIS l'ordine dei parametri di path Ã¨ `{z}/{y}/{x}` (zoom, riga/latitudine Y, colonna/longitudine X), a differenza del formato standard Slippy Map OSM (`{z}/{x}/{y}`).
  4. **Colore Base Sincrono del Canvas**: Dichiarare `.leaflet-container { background-color: var(--gm-bg-card, #12161f); }` in `css/theme.css` per azzerare sfarfallii o lampi chiari durante il caricamento asincrono iniziale dei tile in modalitÃ  scura.

---

## 65. Progressive Disclosure Cartografica a Macro-Zoom, Tracking Beacon dello Spot Attivo e Isolamento Ottico dello Scrubber
- **Problema**:
  1. A zoom macro (< 7.5), la mappa nazionale dei comprensori renderizzava per ciascuno dei 135 siti una pillola orizzontale da 120px con etichetta testuale. A livello nazionale, le pillole collassavano l'una sull'altra in un ammasso illeggibile (*pill pileup*), coprendo l'orografia e nascondendo completamente lo spot/comprensorio che il pilota stava osservando (es. Castaldia).
  2. Al variare dello zoom o al tocco dei marker, non c'era alcuna evidenziazione ottica persistente dello spot selezionato rispetto agli altri spot circostanti.
  3. Lo scrubber orario dockato in basso soffriva di traslucenza ottica (`backdrop-filter: blur(10px)` con background semitrasparente e `z-index: 500`), lasciando intravedere marker sottostanti ("ca" di "Castaldia") che creavano frammenti testuali sovrapposti al titolo orario; inoltre, mancavano comandi stepper orari diretti e un'indicazione chiara dello stato di volabilitÃ  dello spot osservato all'ora selezionata.
- **Causa Radice**:
  1. Mancanza di discriminazione tra spot attivo e spot passivi nel livello di zoom macro: tutti gli elementi venivano renderizzati con la medesima etichetta espansa da 120px.
  2. Assenza di un marcatore avionico a fascio d'attenzione (*beacon*) ad elevato z-index per lo spot attivo.
  3. Elevazione z-index insufficiente dello scrubber (`500` contro i marker Leaflet che salgono a `600+`) e trasparenza dello sfondo.
- **Pattern Vincolante**:
  1. **Progressive Disclosure a Zoom Macro (< 7.5)**:
     - *Spot Passivi*: dot circolari compatti da 18px (`.gm-map-dot-marker`) con simbolo geometrico semaforico (`â`, `â²`, `â`, `â`), bordo colorato e sfondo scuro, privi di etichetta testuale.
     - *Spot Attivo/Osservato (`activeSpotId`)*: anello pulsante avionico (`.gm-focused-beacon-pulse`) con animazione `@keyframes gm-beacon-pulse` a scansione radiale, card fluttuante del nome ad alto contrasto posizionata sopra il dot e `zIndexOffset: 1000`.
  2. **Isolamento e Rilievo a Zoom Intermedio (7.5 - 8.9)**:
     - L'aureola di bacino orografico da 8 km viene renderizzata **esclusivamente per lo spot attivo/osservato**, eliminando la saturazione del display causata da decine di cerchi concentrici sovrapposti.
  3. **Isolamento Ottico e Stepper Scrubber Orario**:
     - Lo scrubber container adotta `z-index: 600`, sfondo card solido (`var(--gm-bg-card, #12161f)`) e ombra netta (`box-shadow: 0 8px 30px rgba(0,0,0,0.55)`), azzerando qualsiasi sanguinamento ottico dei marker sottostanti.
     - Header orario dotato di stepper touch $\ge 44\times 44\text{px}$ (`â¹` e `âº`) per scorrimento rapido dell'ora e pillola contestuale (`#gm-map-scrubber-spot-pill`) con nome del comprensorio osservato e verdetto di volabilitÃ  sincrono.
  4. **Multi-Layer Raster Switcher Keyless**:
     - Integrazione di `MAP_LAYERS` con 4 profili ad alta disponibilitÃ : Rilievo Topo (Esri World Topo), Foto Satellite (Esri World Imagery), Cockpit Scuro (Esri Dark Gray Canvas) e Stradale (OpenStreetMap).

---

## 66. Centratura Geometrica Pivot Marker SVG (Windsock Leaflet Offset Guard), Cono di Esposizione Pendio ed Eliminazione Ridondanze nei Marker Cartografici
- **Problema**:
  1. Nella Mini Mappa di `ForecastView`, la manica a vento risultava invisibile o dislocata fuori coordinate, spuntando con la sola punta dietro l'atterraggio anzichÃ© sul decollo.
  2. Mancava la visualizzazione dell'angolo di esposizione del pendio di decollo (azimut del pendio montano), impedendo al pilota di valutare se il vento fosse frontale, traverso o sottovento rispetto al fronte di decollo.
  3. I marker nella mini-mappa includevano per esteso i nomi testuali delle localitÃ  (es. "Ufficiale Suello", "Decollo Risparmio") all'interno di capsule da 120px, ingombrando il canvas di appena 170px e coprendo l'orografia, nonostante il nome fosse giÃ  visibile nell'header della scheda subito sopra.
  4. Al montaggio o selezione di un sub-spot atterraggio, il decollo veniva escluso o tagliato fuori dal bordo superiore della mini-mappa a causa di un'incompleta calibrazione del layout Leaflet (`fitBounds` privo di `invalidateSize`).
- **Causa Radice**:
  1. L'icona SVG della manica a vento (generata con viewBox 240x240 scalata con `transform: scale(0.38)` intorno al centro `120, 120`) veniva incapsulata in un `divIcon` Leaflet con `iconSize: [92, 92]` e `iconAnchor: [46, 46]`. L'elemento interno da 240x240 partiva da `(0, 0)` del div e manteneva il suo centro visivo a `(120, 120)`, generando un disallineamento sistematico di `+74px` verso destra e `+74px` verso il basso rispetto alle coordinate geografiche reali.
  2. Assenza di un layer geometrico dedicato all'orientamento orografico del decollo (`takeoff.heading`).
  3. Duplicazione d'informazione testuale tra la card contenitore e i marker cartografici interni.
- **Pattern Vincolante**:
  1. **Allineamento Geometrico Invariante dei Div Scalati (`iconSize: [240, 240]`, `iconAnchor: [120, 120]`)**: Quando un componente SVG 240x240 viene scalato tramite CSS `transform: scale(S)` con `transform-origin: 120px 120px`, il centro di scala (120, 120) rimane fisso rispetto all'origine del box unscaled. AffinchÃ© Leaflet ancori tale centro esattamente alle coordinate geografiche `(lat, lon)`, il `divIcon` DEVE dichiarare `iconSize: [240, 240]` e `iconAnchor: [120, 120]`, con `pointer-events: none` per non ostacolare l'interattivitÃ  del canvas.
  2. **Cono di Esposizione del Decollo (`generateTakeoffSectorSvg`)**: Il decollo visualizza un settore di lancio a $70^\circ$ ($\text{heading} \pm 35^\circ$), la freccia dell'asse di pendio, il badge angolare con i gradi (es. `170Â°`) e il mozzo centrale di decollo con quota `â² 1060m`. Il colore del settore si aggiorna reattivamente ad ogni tick orario: verde (frontale $\le 35^\circ$), ambra (traverso $36^\circ-75^\circ$), rosso (sottovento $> 75^\circ$).
  3. **Zero Location Name Clutter (Pin Aeronautici Compatti)**: Eliminare i nomi testuali ridondanti all'interno dei marker della mini-mappa. Utilizzare pin aeronautici compatti ($54\times 22\text{ px}$): `â 260m` per l'atterraggio e `â² 1060m` per il decollo, preservando il 100% della leggibilitÃ  orografica.
  4. **Preservazione del Binomio di Volo e Layout Invalidation**: Anche quando Ã¨ selezionato un singolo decollo o atterraggio, la mini-mappa mantiene visibile l'intero binomio di volo (decollo con manica e cono, linea di planata, atterraggio), invocando `map.invalidateSize()` e `fitBounds` con padding di sicurezza di 35px su tick differito (`setTimeout(..., 50)`).

---

## 67. Switcher dei Layer Cartografici Sincronizzato (Mini-Mappa Previsioni & Mappa Comprensori)
- **Problema**: Nella vista Previsioni (`ForecastView`), la mini-mappa orografica adottava lo stile fisso derivato unicamente dal tema dell'app (dark/light), impedendo al pilota di visualizzare il rilievo topografico (contour orografici) o le foto satellitari ortofoto per studiare ostacoli, linee di cresta e zone d'atterraggio durante la consultazione del meteo.
- **Causa Radice**: Assenza di un controllo di selezione layer dedicato nella mini-mappa e mancata propagazione reattiva di `store.ui.mapLayer` nel controller `ForecastView`.
- **Pattern Vincolante**:
  1. **Layer Select Compatto Sovraimpresso (`.gm-mini-map-layer-select`)**: Posizionare un elemento `<select>` compatto ad alto contrasto con backdrop glassmorphism in `top: 8px; left: 8px; z-index: 10` direttamente sopra il canvas della mini-mappa, con 4 layer keyless: Rilievo Topo (`topo`), Foto Satellite (`satellite`), Cockpit Scuro (`dark`) e Stradale OSM (`streets`).
  2. **Sincronizzazione Reattiva Bi-Direzionale con lo Store**:
     - Al cambio di selezione (`change` su `#forecast-minimap-layer-select`), aggiornare immediatamente `miniMapEngine.setLayer(newLayer)` e persistere su `store.setState({ ui: { ...ui, mapLayer: newLayer } })`.
     - Nel listener di stato del controller (`store.subscribe`), intercettare le mutazioni di `nextState.ui.mapLayer` per allineare sincronicamente l'istanza `miniMapEngine` e il controllo select senza richiedere la distruzione del DOM della vista.
  3. **Inizializzazione con Fallback Coerente**: Metodo `getActiveMapLayer()` che recupera la preferenza persistita `state.ui.mapLayer` o applica il fallback semantico coerente con il tema attivo (`theme === 'light' ? 'topo' : 'dark'`), passato direttamente come opzione `layer` al factory `createMapEngine`.

---

## 68. Cartografia Outdoor Specialistica per Parapendio: OpenTopoMap, CyclOSM e Gestione maxNativeZoom
- **Problema**: Le mappe convenzionali (World Topo generica ed OSM standard) mancano del dettaglio orografico indispensabile per il volo libero e l'Hike & Fly: curve di livello ad alta densitÃ  (20m), sentieri CAI, rilievo ombreggiato alpino e pendenze. Inoltre, interrogando server topografici a zoom elevati (>17/18), si rischiavano errori HTTP 404 dovuti all'assenza di tile oltre il limite nativo del provider.
- **Causa Radice**: OpenTopoMap genera tile raster fino a zoom 17, mentre CyclOSM genera fino a zoom 18. Richieste a zoom 18 o 19 senza configurazione di sovracampionamento falliscono sui server pubblici con tile mancanti o errori 404.
- **Pattern Vincolante**:
  1. **Layer Topografico Montano (`OpenTopoMap`)**:
     - Endpoint: `https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png`, subdomains `'abc'`, `maxZoom: 19`, `maxNativeZoom: 17`.
     - Permette a Leaflet di interpolare (upscale) i tile di zoom 17 a zoom 18 e 19 senza generare richieste 404, fornendo curve di livello a 20m, rilievo SRTM ombreggiato e toponomastica in stile alpino Tabacco/IGM.
  2. **Layer Escursionistico e Tracce (`CyclOSM`)**:
     - Endpoint: `https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png`, subdomains `'abc'`, `maxZoom: 19`, `maxNativeZoom: 18`.
     - Cartografia outdoor con risalto di sentieri, mulattiere, tracce sterrate, rifugi e dislivelli, ideale per pianificazione atterraggi alternativi ed escursioni Hike & Fly.
  3. **Etichette Selettore Monovocali**: Le opzioni del selettore layer in tutta l'applicazione sono standardizzate in denominazioni brevi e immediate: `OpenTopo`, `Satellite`, `Scuro`, `CyclOSM`.
  4. **InterattivitÃ  Touch sui Pin della Mini-Mappa**: I marker di decollo e atterraggio nella mini-mappa sono configurati con handler click `onSelectSubSpot(subSpotId)` per commutare istantaneamente il sub-spot attivo tramite tocco diretto sulla mappa.






---

## 69. Coerenza Visuale dei Marker su Mappa Cartografica e Fumetto Informativo al Tap (Zero Clutter)
- **Problema**: La logica a tre livelli di zoom nella mappa comprensori mutava la forma dei marker da punti circolari a rettangoli di aureola (140px) e infine a striscioni micro-vettoriali di decollo e atterraggio (160px). CiÃ² provocava occlusione della cartografia all'avvicinarsi dello zoom, perdita di riconoscibilitÃ  dei comprensori e l'apertura automatica e invasiva della scheda modale (bottom sheet) al tap di qualsiasi punto, coprendo la mappa.
- **Causa Radice**: Sovraccarico di dettagli informativi innestati direttamente nel canvas cartografico anzichÃ© sfruttare la divulgazione progressiva su richiesta dell'utente (fumetto/popup Leaflet).
- **Pattern Vincolante**:
  1. **Marker Circolari Semantici Invarianti a Tutti i Livelli di Zoom**: Tutti i comprensori visualizzano stabilmente il marker circolare ad anello avionico (disco visivo da 26px, bordo 2px, sfondo semitrasparente al 32% e glifo geometrico al centro: â per Volabile verde, â² per Cautela ambra, â per Chiuso rosso, â¡ per Severo, â per Dati N/D).
  2. **Pavimento di Tocco a 46px (Fitts's Law & Outdoor HMI)**: Espansione invisibile dell'area di tocco del marker tramite pseudo-elemento CSS `::before` a `top: -10px; bottom: -10px; left: -10px; right: -10px`, garantendo massima accuratezza tattile outdoor su display da 26px.
  3. **Apertura Contestuale del Fumetto (`L.popup`) al Tap**: Al tap o click sul marker, non forzare la scomparsa della mappa con la bottom sheet. Aprire un fumetto a bolla aeronautica (`gm-leaflet-popup`) ancorato sopra il marker, contenente:
     - Nome dello spot in grassetto ad alta visibilitÃ .
     - Badge di stato volabilitÃ  con colore e glifo.
     - Dati altimetrici e localizzazione/provincia.
     - Pulsante d'azione discreto ("Scheda Spot âº") per consentire all'utente di aprire la scheda dettagliata solo se desiderato.
  4. **StabilitÃ  DOM e Preservazione del Fumetto su Pan e Zoom**: Nel metodo `renderOverlays` di `LeafletMapEngine`, verificare la firma dello stato (`signature`) per evitare la distruzione ciclica dei layer e la chiusura involontaria del popup aperto durante il panning o lo zoom dell'utente.

---

## 70. Sincronizzazione Vettoriale della Manica a Vento nello Scrubber Orario e Disallineamento Chiavi `weatherSnapshot`
- **Problema**: Muovendo lo scrubber orario delle previsioni (08:00 - 20:00), la manica a vento sulla mini-mappa orografica rimaneva immobile sempre orientata verso Sud (180Â°), e il settore di lancio del decollo manteneva l'orientamento/colorazione per vento da Nord (0Â°).
- **Causa Radice**: Disallineamento di contratto: `core/comprensorio.js` esponeva `windDir` ma non `windDirection`. L'adapter cartografico (`updateWindsockMarker` e `renderSpotMiniMap`) leggeva unicamente `weatherSnapshot.windDirection ?? 0`, ricadendo costantemente su `0` e producendo una rotazione fissa `(0 + 180) % 360 = 180Â°`. Inoltre, l'aggiornamento si limitava a ruotare il wrapper senza aggiornare il markup SVG interno dei 12 segmenti per riflettere le variazioni di intensitÃ  del vento.
- **Pattern Vincolante**:
  1. **Doppia Esposizione delle Chiavi di Direzione (`windDir` & `windDirection`)**: Sia `core/comprensorio.js` che i consumer UI devono supportare indifferentemente `windDir` e `windDirection` (`const dir = weatherSnapshot.windDirection ?? weatherSnapshot.windDir ?? 0;`), prevenendo regressioni e garantendo piena compatibilitÃ  con test e viste preesistenti.
  2. **Rotazione Elastica + Aggiornamento SVG Segmenti (`updateWindsockMarker`)**: Mantenere intatto l'elemento genitore `#miniws-wrapper` per consentire alla transizione CSS elastica (`transition: transform 0.4s`) di ruotare fluidamente la manica a ogni tocco dello scrubber, aggiornando contestualmente l'interno del wrapper con `generateWindsockSvg(speed, gust, dir, turb, { includeWrapper: false })` per aggiornare lunghezze, sbandieramento e keyframe.
  3. **Aggiornamento Sincrono del Settore di Lancio (`generateTakeoffSectorSvg`)**: Ricalcolare il settore e la freccia di pendio con la direzione effettiva oraria e passare il decollo attivo (`currentTakeoff`) a `updateWindsockMarker`.

---

## 71. Comandi Cartografici Non Invasivi: Micro-Capsule Frosted Glass Adattive vs Sfumature Radiali Macchianti
- **Problema**: L'adozione di un'ampia sfumatura radiale scura (`radial-gradient`) priva di bordi geometrici definiti dietro ai controlli mappa ("OpenTopo" ed icona espansione), pur pensata per ridurre l'ingombro, su cartografie orografiche chiare ad alto dettaglio (come OpenTopoMap con curve di livello, isoipse e fondovalle verdi) produceva un artefatto visivo sgradevole simile a una macchia di fumo, alone sporco o bruciatura sull'ottica (evidenziato nel feedback utente e screenshot reale).
- **Causa Radice**:
  1. I gradienti radiali sfumati a zero trasparenza su fondi cartografici ad alta frequenza visiva (curve topografiche e ombreggiature di rilievo) mancano di chiusura Gestalt (*Law of Closure*), venendo percepiti dal cervello umano come difetti dell'immagine o aloni di sporcizia anzichÃ© controlli interattivi puliti.
  2. Un elemento di 40-44px con gradiente esteso copre visivamente un raggio eccessivo rispetto alla parola o icona contenuta.
- **Pattern Vincolante**:
  1. **Micro-Capsule Frosted Glass a Profilo Sottile (28px di altezza)**: Sostituire le sfumature radiali con micro-capsule pill-shaped a profilo compatto (`height: 28px`, `border-radius: var(--gm-radius-full)` per il selettore; cerchio $28 \times 28\text{px}$ per il pulsante espansione con icona SVG da $14\text{px}$).
  2. **Contenitore Etereo con Bordo Capillare e Sfocatura (`backdrop-filter`)**: Utilizzare `backdrop-filter: blur(8px)` abbinato a un sottilissimo bordo perimetrale da 1px semitrasparente e micro-ombra morbida (`box-shadow: 0 1px 4px rgba(0,0,0,0.15)`). Questo conferisce confini geometrici impeccabili senza mai appesantire la mappa.
  3. **Adattamento Dinamico alla Luminanza del Basemap (`data-map-layer`)**:
     - *Basemap Chiari (OpenTopo, CyclOSM)*: Vetro smerigliato bianco luminoso (`rgba(255, 255, 255, 0.88)`), bordo sottile scuro (`rgba(15, 23, 42, 0.14)`), tipografia e freccia deep slate (`#0f172a`).
     - *Basemap Fotografici e Scuri (Satellite, Scuro)*: Vetro avionico scuro (`rgba(15, 23, 42, 0.78)`), bordo chiaro (`rgba(255, 255, 255, 0.18)`), tipografia e freccia bianco nitido (`#f8fafc`).
  4. **Pavimento Tattile Fitts Invisibile (`::before` a 44px)**: Preservare la conformitÃ  ergonomica outdoor ($\ge 44\text{px}$ per uso con dita fredde o guanti) espandendo l'area di tocco interattiva tramite pseudo-elemento invisibile:
     ```css
     .gm-mini-map-layer-select::before,
     .gm-mini-map-expand-btn::before {
       content: '';
       position: absolute;
       top: -8px;
       bottom: -8px;
       left: -8px;
       right: -8px;
     }
     ```
     La capsula visiva resta ultra-snella a 28px, mentre il touch target effettivo misura $44 \times 44\text{px}$.

---

## 72. Persistenza e Sincronizzazione Cross-View del Layer Cartografico (`SettingsView`)
- **Problema**: La scelta del layer cartografico effettuata dall'utente in una vista (es. mini-mappa o mappa comprensori) rischiava di andare perduta al refresh o di non essere reperibile/gestibile nella schermata delle preferenze generali dell'app.
- **Causa Radice**: La proprietÃ  `mapLayer` non era dichiarata nel `DEFAULT_INITIAL_STATE.ui` del core reattivo (`core/store.js`), e la vista Impostazioni (`#settings`) non era montata e registrata nel router.
- **Pattern Vincolante**:
  1. **Dichiarazione Esplicita nel Core (`DEFAULT_INITIAL_STATE.ui.mapLayer`)**: La chiave `mapLayer: 'dark'` deve essere sempre dichiarata nello stato iniziale del core per garantire determinismo e type safety.
  2. **Idratazione Resiliente (`loadPersistedState`)**: Durante il caricamento da `storageAdapter` (LocalStorage), i raggruppamenti compositi come `ui` devono essere sempre uniti (`deepClone(DEFAULT_INITIAL_STATE.ui) + loadedSlice.ui`), proteggendo le chiavi da cancellazioni accidentali di snapshot datati.
  3. **Sincronizzazione Tri-Direzionale Reattiva**: `ForecastView` (mini-mappa), `SpotMapView` (mappa a tutto schermo) e `SettingsView` (pannello impostazioni) condividono l'unica sorgente di veritÃ  `store.ui.mapLayer`. La modifica in qualunque delle 3 interfacce invoca `store.setState({ ui: { ...ui, mapLayer } })` e propaga sincronicamente il valore alle altre due, persistendo automaticamente sul disco locale.

---

## 73. Montaggio Esplicito dell'Adapter LocalStorage nella UI Shell ed Effetto Vetro Cristallino (Glassmorphism)
- **Problema**: 
  1. Al ricaricamento della pagina nel browser (F5), il layer cartografico ritornava sempre al valore predefinito `'dark'`, ignorando l'ultima preferenza selezionata dall'utente (es. OpenTopo o Satellite).
  2. I controlli sopra la mappa apparivano con sfondi scuri o bianchi opachi/piatti, privi della naturale trasparenza e rifrazione ottica tipica del vetro (effetto vetro / glassmorphism).
- **Causa Radice**:
  1. **Mancato Montaggio dell'Adapter Browser**: Il singleton `store` in `core/store.js` viene istanziato con `createStore()`, che di default assegna un `createInMemoryStorageAdapter()` per consentire i test in Node.js senza crash. Tuttavia, nella UI shell (`ui/app.js`), l'adapter `createLocalStorageAdapter(window.localStorage)` non veniva montato sul singleton, facendo sÃ¬ che tutti i salvataggi rimanessero confinati nella memoria volatile della scheda browser e andassero persi al reload.
  2. **OpacitÃ  Piatta dei Controlli Mappa**: Sia i pulsanti della barra mappa (`.gm-map-pill-btn`) che i selettori mini-mappa impiegavano colori solidi opachi (`var(--gm-bg-card)` o `rgba(15,23,42,0.78)`), bloccando la visione del terreno sottostante e annullando il rendering ottico del `backdrop-filter`.
- **Pattern Vincolante**:
  1. **Metodo `setStorageAdapter` e Montaggio Diretto nella Shell**: `createStore` espone `setStorageAdapter(adapter)`; il modulo di avvio `ui/app.js` esegue all'avvio:
     ```javascript
     if (typeof window !== 'undefined' && window.localStorage && typeof store.setStorageAdapter === 'function') {
       store.setStorageAdapter(createLocalStorageAdapter(window.localStorage));
       store.loadPersistedState();
     }
     ```
     CiÃ² garantisce che `store.setState({ ui: { ...ui, mapLayer } })` scriva sul reale `localStorage` del browser e venga ricaricato fedelmente al boot.
  2. **Effetto Vetro Cristallino (Specular Glassmorphism)**:
     - Sfondo a gradiente angolare semitrasparente (`linear-gradient(135deg, rgba(255,255,255,0.16) 0%, rgba(15,23,42,0.62) 100%)`).
     - Sfocatura ottica e saturazione potenziata: `backdrop-filter: blur(12px) saturate(180%)`.
     - Smussatura speculare interna e bisellatura: `box-shadow: inset 0 1px 1px 0 rgba(255, 255, 255, 0.35), 0 2px 8px rgba(0, 0, 0, 0.35)`.
     - Bordo sottile lucido: `border: 1px solid rgba(255, 255, 255, 0.28)`.
     I controlli lasciano intravedere l'orografia sottostante con una piacevole rifrazione luminosa sia su temi scuri che chiari.

---

## 74. Insidia Shorthand CSS `background:` e Tiling Indesiderato di Icone SVG su Elementi `<select>` Multi-Layer
- **Problema**: All'interno del dropdown della mini-mappa (`.gm-mini-map-layer-select`), l'icona a freccia SVG verso il basso si replicava a matrice orizzontale e verticale lungo l'intero pulsante, coprendo la scritta con decine di chevrons ripetuti (`v v v v v v`).
- **Causa Radice**: Nei selettori condizionali del layer (`[data-map-layer="topo"]`, `[data-map-layer="streets"]`, o `[data-theme="light"]`), la dichiarazione shorthand `background: linear-gradient(...)` sovrascriveva e reimpostava implicitamente tutte le proprietÃ  di background correlate ai loro valori predefiniti del browser: `background-repeat: repeat`, `background-position: 0 0` e `background-size: auto`. Di conseguenza, quando `background-image: url("...svg")` veniva applicata a cascata, il chevron SVG da 9px veniva ripetuto a tappeto su tutta la superficie del controllo.
- **Pattern Vincolante**:
  1. **Accorpamento Multi-Layer Esplicito (`background-image`)**: Quando un elemento interattivo unisce un'icona vettoriale di controllo (Layer 1) a una sfumatura o effetto vetro (Layer 2), **NON** utilizzare mai la shorthand `background:` nei modificatori. Dichiarare entrambi i livelli in `background-image`:
     ```css
     background-image: 
       url("data:image/svg+xml,..."),
       linear-gradient(135deg, rgba(255, 255, 255, 0.76) 0%, rgba(240, 244, 248, 0.44) 100%);
     ```
  2. **Guardia Rigida Anti-Tiling (`background-repeat`)**: Definire esplicitamente la matrice di ripetizione e posizionamento per tutti i livelli, blindando `no-repeat` con `!important` sul selettore base per prevenire regressioni da sovrascritture di terze parti:
     ```css
     background-repeat: no-repeat, no-repeat !important;
     background-position: right 6px center, 0 0 !important;
     background-size: 9px 9px, 100% 100% !important;
     ```
  3. **Shift-Left Test Automation**: Inserire nella suite di governance (`tests/ui/shiftLeftGovernance.test.mjs`) una verifica automatica che controlla la presenza della direttiva `background-repeat: no-repeat, no-repeat !important;` per i selettori ad effetto vetro con icone vettoriali incorporate.

---

## 75. Architettura Modale Full-Screen a 100dvh per Analisi del Comprensorio, Isolamento Concorrente e Gestione del Ciclo di Vita (Pause/Resume)
- **Problema**: Navigare verso la mappa globale (`#map?spot=...`) quando l'utente espande la mini-mappa strappava il pilota dal flusso previsionale orario, costringendolo a ripartire dalla selezione dello spot. Inoltre, mantenere due istanze Leaflet attive contemporaneamente (mini-mappa di sfondo e mappa a schermo intero) raddoppiava il carico computazionale, e il tasto nativo "indietro" su mobile faceva uscire l'utente dall'applicazione.
- **Causa Radice**: Mancanza di una modalitÃ  ispettiva contestuale isolata a schermo intero (`100dvh`) integrata nel controller della vista previsionale con sincronizzazione dello stato, ciclo di vita pause/resume e gestione dello stack di navigazione browser (`history.pushState` / `popstate`).
- **Pattern Vincolante**:
  1. **Overlay Contestuale a 100dvh**: Invece di un cambio di rotta globale, aprire un overlay modale full-screen (`position: fixed`, `z-index: 1050`, `height: 100dvh`, `role="dialog"`, `aria-modal="true"`) che condivide lo stesso store e il medesimo orario selezionato.
  2. **Isolamento Concorrente con Ciclo di Vita Pause/Resume**: All'apertura dell'overlay, sospendere esplicitamente l'animazione della mini-mappa sottostante (`this.miniMapEngine.pause()`) per azzerare cicli CPU/GPU; alla chiusura, riprendere le animazioni e ricalibrare i layout (`this.miniMapEngine.resume()`).
  3. **Trappola di Navigazione Mobile Risolta con `popstate`**: Pushare uno stato sintetico nell'history del browser (`history.pushState({ overlay: 'flight-analysis' }, '')`) all'apertura e intercettare l'evento `popstate` per chiudere l'overlay su gesture o pulsante indietro fisico senza uscire dall'app.
  4. **Doppio Tracciato Casing/Core per Polilinee di Volo (WCAG AA)**: Le polilinee delle procedure di volo devono sempre impiegare un doppio tracciato sovrapposto: casing a contrasto ($6\text{px}$) e core semantico colorato ($3\text{px}$) per garantire piena leggibilitÃ  su qualsiasi basemap (satellite, topo, dark, streets).

---

## 76. Sharding Geografico del Catalogo Comprensori, Macro-Regioni Alpine e Clustering a Zoom Macro
- **Problema**: All'avvio della mappa o selezionando macro-aree transfrontaliere, apparivano solo 11 comprensori in Corsica senza alcuna localitÃ  sulle Alpi francesi continentali o svizzere. Inoltre, caricare e renderizzare centinaia di marker DOM su una vista europea causava degrado di frame rate (<30 FPS) e affollamento visivo.
- **Causa Radice**: Il catalogo legacy `locations.json` conteneva esclusivamente spot italiani e corsi (0 spot in Svizzera, Austria o Francia continentale). Inoltre, `DEFAULT_MACRO_REGION` era ancorato a `north-west` (51 spot) e non esisteva una logica di clustering a zoom continentale.
- **Pattern Vincolante**:
  1. **Enrichment Curato con Dual Launch/Landing**: Ogni comprensorio aggiunto deve includere obbligatoriamente il binomio decollo principale ($T_{\text{best}}$) e atterraggio di sicurezza ($L_{\text{safe}}$) con dislivello e orientamenti validati (es. Annecy, Chamonix, Saint-Hilaire, Interlaken, Verbier).
  2. **Sharding Geografico Modulare**: Mantenere un indice leggero `locations-index.json` (coordinate, quote, nome, codice paese) e partizionare i dettagli completi per nazione in `data/locations/{it,fr,ch,at,de,si,hr}.json`.
  3. **Centratura Baricentrica nelle Macro-Regioni**: Per macro-regioni estese come `ALPS_WEST` (43 spot), impostare il centro geografico sul baricentro alpino (`lat: 46.2, lon: 7.2`) e zoom 7, evitando che la mappa si posizioni al largo nel Mediterraneo.
  4. **Clustering Headless a Zoom Macro (< 7.5)**: A scale continentali aggregare i punti in cluster semantici che sintetizzano il conteggio e la miglior volabilitÃ , con animazione fluida al tap (`map.fitBounds(cluster.bounds)`).

---

## 77. Controlli Mappa Esterni al Canvas in Flusso Naturale e Sincronizzazione Bi-Direzionale del Selettore LocalitÃ 
- **Problema**: Posizionare la barra di controllo e i filtri territoriali/localitÃ  in sovrimpressione assoluta sopra il canvas Leaflet (`position: absolute; top: ...`) provocava l'occlusione delle tile settentrionali della mappa (in particolare le vallate alpine del Nord Italia, Svizzera e Francia) e collisioni visive con i marker sottostanti. Inoltre, l'assenza di un selettore esplicito delle singole localitÃ  nella barra superiore costringeva il pilota a fare pan e zoom manuale continuo per cercare un decollo specifico.
- **Causa Radice**: Adozione di un layout HUD "overlay-first" fluttuante sul canvas anzichÃ© una gerarchia a blocchi in flusso naturale (*in-flow header*), unita alla mancanza di una sincronizzazione bi-direzionale tra mappa e lista delle localitÃ .
- **Pattern Vincolante**:
  1. **Testata Esterna in Flusso Naturale (`.gm-map-top-bar`)**: La barra comandi Ã¨ un elemento solido posizionato al di sopra del canvas nel naturale flusso del DOM (`position: relative; width: 100%; flex-shrink: 0; pointer-events: auto`), con sfondo a contrasto dual-theme e bordo/ombra di stacco.
  2. **Contenitore Canvas Flessibile e Disaccoppiato (`.gm-map-canvas-wrapper`)**: Il canvas Leaflet Ã¨ incapsulato in un wrapper dedicato a `flex: 1 1 0%; min-height: 0; width: 100%; overflow: hidden;`. La mappa inizia geometricamente al di sotto della barra superiore, garantendo visibilitÃ  integrale al 100% dell'orografia e delle etichette cartografiche settentrionali.
  3. **Ricalcolo Geometrico Obbligatorio (`invalidateSize`)**: Nel ciclo di montaggio del controller, invocare `invalidateSize()` sul motore cartografico tramite microtask/timeout per garantire che Leaflet acquisisca le dimensioni corrette e centrate rispetto al nuovo bounding box netto.
  4. **Selettore di LocalitÃ  a Due Vie (`#gm-map-spot-select`)**:
     - *Dalla Barra alla Mappa*: Selezionando un comprensorio dal menu a tendina, la mappa esegue un volo/pan animato verso le coordinate del decollo, seleziona lo spot e apre il fumetto aeronautico (`L.popup`).
     - *Dalla Mappa alla Barra*: Toccando un qualsiasi marker o cluster sulla mappa, il menu a tendina aggiorna automaticamente il proprio valore visivo per riflettere lo spot focalizzato.
     - *Ripartizione Dinamica*: Al cambio di macro-regione, le opzioni del dropdown vengono rigenerate dinamicamente per mostrare esclusivamente i comprensori dell'area attiva, ordinati per nome con indicatore di quota e provincia.

---

## 78. Integrazione Ibrida tra Convenzioni Fisiche di Aeroclub e Generazione Procedurale Meteo Live
- **Problema**:
  1. La generazione algoritmica automatica del circuito di atterraggio basata unicamente sull'anemometria oraria (`core/flightProcedures.js`) rischia di calcolare tratti di sottovento o base che sorvolano proprietÃ  private vietate (aree rosse da bacheca club), rotori locali non mappati o ostacoli fisici (linee elettriche, fiumi con forre).
  2. Al contrario, un disegno o tracciato puramente statico disegnato su mappa non adatta l'asse del finale alle rotazioni stagionali o pomeridiane della brezza, inducendo il pilota a tentare atterraggi col vento in coda o con lunghezza di planata inadeguata.
- **Causa Radice**: Trattare la procedura di atterraggio o come problema puramente matematico-vettoriale istantaneo o come disegno statico immutabile, senza un layer di composizione che distingua i vincoli fisici permanenti dalle variabili micro-meteorologiche orarie.
- **Pattern Vincolante**:
  1. **Architettura Ibrida a Due Livelli (Hybrid Procedural Engine)**:
     - *Layer A (Vincoli Fissi di Comprensorio / Club)*: perimetro ufficiale dell'atterraggio (zona verde), bersaglio/touchdown, zone rosse interdette (proprietÃ  private, campi coltivati, rotori), zona piegaggio arancione e senso di virata obbligatorio (`mandatoryHand: 'left' | 'right'`).
     - *Layer B (Adattamento Dinamico al Vento Live)*: orientamento del rettifilo finale controvento e dimensionamento della distanza in base a $v_{\text{ground}} = v_{\text{trim}} - v_{\text{wind}}$, vincolati e confinati rigidamente all'interno dello spazio consentito dal club.
  2. **Tracciati Didattici Scuole di Volo (EN-A)**:
     - Disaccoppiare la navigazione di volo in 3 segmenti distinti: corridoio di uscita in valle dal decollo (con quote minime MSL sui rilievi), box esercizi in aria calma (>300m AGL), e circuito di traffico di atterraggio con smaltimento quota.
  3. **Touch Ergonomics per Editor di Disegno Outdoor**:
     - I controlli di tracciamento e i vertici/waypoint interattivi devono garantire touch target minimi di $\ge 48\times 48\text{px}$, con stack reversibile Undo/Redo (fino a 50 stati) e smoothing delle polilinee tramite algoritmo di Chaikin headless puro.

---

## 79. FedeltÃ  Aeronautica Cartografica e Normalizzazione Touch Swipe su Scrubber Orari
- **Problema**:
  1. La renderizzazione diretta sulla cartografia topografica/satellitare di traiettorie geometriche sintetiche (polilinee per sottovento, base, finale a 8, cerchi di attesa, linee tratteggiate di planata) occludeva l'orografia e le curve di livello reali, generando confusione visiva ("invenzione di disegni") e inducendo una falsa percezione di rotte GPS pre-registrate.
  2. Il gesto di swipe/trascinamento continuo con il dito sullo scrubber orario (da 08:00 a 20:00) non rispondeva su touch screen, bloccando l'aggiornamento dell'ora o perdendo il trascinamento al minimo movimento verticale.
- **Causa Radice**:
  1. Eccesso di renderizzazione vettoriale invasiva sulla mappa anzichÃ© limitarsi ai riferimenti fisici autentici di volo (decolli e atterraggi) con telemetria anemometrica orientata in tempo reale.
  2. Nei `TouchEvent`, la coordinata orizzontale risiede in `evt.touches[0].clientX` (o `changedTouches`) anzichÃ© `evt.clientX`. Inoltre, il gestore puntatore era cablato esclusivamente su `#forecast-timeline-strip` (ignorando `#flight-analysis-timeline-strip` nell'overlay) e la strip non dichiarava `touch-action: none;`, consentendo al browser mobile di intercettare il gesto per lo scorrimento verticale della pagina.
- **Pattern Vincolante**:
  1. **FedeltÃ  Aeronautica a Zero InvasivitÃ **: Mantenere la mappa libera da disegni sintetici. Renderizzare unicamente i pin fisici autentici (`â² [Nome] [Quota]m` e `â [Nome] [Quota]m`) affiancati dalle maniche a vento vettoriali orientate dinamicamente dal vento live (`updateFlightProcedures`), lasciando il fondo cartografico completamente leggibile.
  2. **Risoluzione Polimorfica della Strip (`findActiveTimelineStrip`)**: Cercare la strip attiva dinamicamente dall'evento (`target.closest('.gm-timeline-grid-13')`) o verificare la visibilitÃ  dei drawer aperti prima di ripiegare sulla vista principale.
  3. **Normalizzazione Coordinate Multi-Input (`getClientX`)**: Estrarre la coordinata orizzontale tramite funzione unificata capace di discriminare tra `PointerEvent`, `TouchEvent` e `MouseEvent`.
  4. **Aggancio Finestra e Disattivazione Gesti Nativi**: Dichiarare tassativamente `touch-action: none;` sui selettori orari continui e agganciare listener `window.addEventListener('pointermove' / 'touchmove')` con `{ passive: false }` durante la fase attiva di drag, invocando `preventDefault()` per prevenire il rimbalzo o lo scroll della pagina.

---

## 80. Consolidamento dei Piani di Lavoro, Governance della Roadmap e Prevenzione della Frammentazione dello Scope
- **Problema**: Con il procedere dello sviluppo, si Ã¨ verificata una frammentazione della documentazione di progetto:
  1. I piani di dettaglio sono stati sparsi tra la radice di `docs/` e `docs/plans/` con convenzioni eterogenee.
  2. `MASTER_PLAN.md` Ã¨ rimasto disallineato rispetto all'avanzamento effettivo (omettendo le sotto-fasi 2-bis, 3-bis, 5-bis, 5-ter, 5-quater, 5-quinquies e lasciando desincronizzati i checkbox di completamento).
  3. Alcuni piani operativi hanno introdotto sovrapposizioni e rischi di regressione: riapertura di debiti didattici scolastici precedentemente bonificati (Syllabus allievi), pianificazione di storage IndexedDB paralleli e inversione di prioritÃ  tra editor CAD interattivi di disegno e funzionalitÃ  primarie di volo (Logbook IGC e Replay 3D).
- **Causa Radice**: Assenza di un repository centralizzato e normalizzato dei piani in `docs/plans/` e mancata riconciliazione periodica del Master Plan rispetto alla matrice granulare di `DESIDERATA.md`.
- **Pattern Vincolante**:
  1. **Cartella Canonica dei Piani (`docs/plans/`)**: Tutti i documenti architetturali e di fase risiedono esclusivamente in `docs/plans/` con prefisso di fase normalizzato (`phase-<N>-<topic>.md` o `future-<topic>.md`).
  2. **Riconciliazione Bidirezionale Master Plan & Desiderata**: Ogni sotto-fase completata nel codice deve essere tempestivamente riflessa sia nella matrice operativa (`DESIDERATA.md`) sia nel documento di visione generale (`MASTER_PLAN.md`).
  3. **Disaccoppiamento tra Dati Territoriali e Motori CAD**: I vincoli di sicurezza dei club di volo devono essere integrati come arricchimento dati statico nel catalogo (`data/locations/*.json`) con visualizzazione passiva, senza subordinare la sicurezza del comprensorio alla complessitÃ  di un editor di disegno interattivo.
  4. **Tutela della PrioritÃ  del Core Domain**: L'implementazione delle funzionalitÃ  cardine di volo (Fase 6: Flight Logbook e Fase 7: Replay 3D) mantiene la precedenza assoluta rispetto a tooling CAD o editor grafici opzionali, che vanno posticipati come estensioni future.

---

## 81. Unificazione Architetturale dei Controlli Temporali (Cross-View Timeline Scrubber)
- **Problema**: `SpotMapView` manteneva una barra stepper oraria discreta su 10 ore (9 - 18) con bottoni di navigazione `â¹` e `âº`, mentre `ForecastView` e il pannello di analisi comprensorio adottavano una strip continua a 13 ore (08:00 - 20:00) con swipe gestures e istogramma di volabilitÃ  colorato. La discrepanza frammentava l'esperienza d'uso e obbligava a mantenere stili e logiche di interazione divergenti.
- **Causa Radice**: Evoluzione asincrona delle viste in cui `ForecastView` era stata aggiornata alle nuove specifiche di design system senza propagare immediatamente il componente continuo a `SpotMapView`.
- **Pattern Vincolante**:
  1. **SSOT del Componente Temporale**: Lo scrubber orario in tutte le viste che gestiscono la dimensione temporale di volo deve adottare lo standard a 13 ore (08:00 - 20:00) con le stesse classi semantiche (`.gm-timeline-grid-13`, `.gm-timeline-col-compact`, `.compact-now-badge`, `.compact-bar-fill`).
  2. **Interazione Universale Multi-Input**: Supportare sia il tocco singolo sullo slot, sia lo scorrimento continuo pointer/touch con `touch-action: none;` per aggiornamento reattivo istantaneo a 60 FPS in RAM senza re-render distruttivo del DOM.
  3. **Aggiornamento In-Place**: Al cambio di ora, aggiornare solo lo stato delle classi `.active` e i nodi di rendering minimi (overlay mappa Leaflet) in <15ms.

---

## 82. Top Bar Esterna Rigida (50px) e Separazione dei Controlli di Mappa Flottanti
- **Problema**: Il posizionamento di controlli eterogenei (filtro territoriale, selettore layer, stato di rete, raccomandazione top-spot) in un unico blocco con `flex-wrap: wrap` sopra la mappa produceva un header scuro disordinato di ~160px su 3 righe, consumando il 40% del viewport mobile e soffocando la mappa. Inoltre, l'idratazione asincrona del catalogo senza assegnazione deterministica di `selectedIndex` rendeva il selettore localitÃ  visivamente vuoto.
- **Causa Radice**: Aggregazione promiscua di controlli applicativi esterni (navigazione territorio) con controlli specifici della cartografia (layer, centratura canvas) in un layout elastico non dimensionato rigidamente.
- **Pattern Vincolante**:
  1. **Top Bar a Riga Singola Rigida (50px)**: La barra superiore esterna al canvas deve avere altezza immutabile di 50px e contenere rigorosamente solo filtri territoriali (`#gm-map-macro-region-select`, `#gm-map-spot-select`) e indicatore di stato compatto (`Live` / `Sync...` / `Offline`). Nessun wrapping a capo consentito.
  2. **Controlli di Canvas Flottanti**: I comandi che modificano la sola visualizzazione cartografica (selettore layer, 1-tap top spot) devono risiedere come micro-capsule flottanti in vetro satinato (`backdrop-filter: blur(12px)`) sovresse agli angoli del canvas, con touch floor di 44px garantito via pseudo-elemento `::before`.
  3. **Inizializzazione Deterministica dei Select**: Alla rigenerazione dinamica di `select.innerHTML`, impostare sempre esplicitamente `select.value` e verificare `if (select.selectedIndex === -1 && select.options.length > 0) select.selectedIndex = 0;` per prevenire lo stato non selezionato (`-1`) nei motori di rendering Blink/WebKit.

---

## 83. Standardizzazione dei Controlli Flottanti su Mappa con l'Overlay a Schermo Intero
- **Problema**: La schermata mappa principale (`SpotMapView`) presentava controlli flottanti disallineati (pillole ad hoc, pulsanti zoom quadrati di Leaflet visibili, assenza del pulsante GPS di geolocalizzazione) rispetto alla mini-mappa espansa a tutto schermo (`ForecastView.js` / `.gm-flight-analysis-map-controls`), producendo un'esperienza visiva e operativa incoerente tra le viste.
- **Causa Radice**: Mancata adozione trasversale del pattern dei controlli cartografici giÃ  ingegnerizzato e collaudato per l'overlay di analisi volo.
- **Pattern Vincolante**:
  1. **Layout Flottante Unificato**: Barra dei controlli posizionata in testa al canvas a `top: 12px; left: 12px; right: 12px;` con `display: flex; justify-content: space-between; align-items: center; pointer-events: none;`.
  2. **Sinistra - Selettore Layer Cartografico**: Card in vetro satinato scuro (`.gm-map-ctrl-select` / `.gm-flight-analysis-layer-select`, `rgba(15, 23, 42, 0.85)` / `blur(12px)`), raggio 8px, altezza touch 44px, chevron SVG integrato `no-repeat`.
  3. **Destra - Gruppo Azioni Flottanti**: Card raggruppate (`.gm-map-ctrl-btn`) per Top Spot (icona target SVG + nome comprensorio) e centratura GPS utente (icona mirino GPS SVG + geolocalizzazione istantanea `navigator.geolocation` / `mapEngine.showUserLocation`).
  4. **Occam's Razor & Clean Canvas**: Soppressione rigorosa dei pulsanti quadrati di zoom Leaflet `+` e `-` (`.gm-map-view .leaflet-control-zoom { display: none !important; }`), affidando interamente l'ingrandimento ai gesti touch fluidi nativi (pinch-to-zoom).

---

## 84. Accorpamento dei Controlli di Puntamento in Sottomenu Mirino e Unificazione Header Scrubber (Ergonomia Mobile & UniformitÃ  Cross-View)
- **Problema**: La presenza di due pulsanti affiancati per la centratura cartografica ("Comprensorio" e "GPS") occupava spazio orizzontale prezioso sulle testate della mappa, riducendo l'area visuale utile e rischiando tap accidentali sui piccoli schermi mobili (360px-390px). Inoltre, l'header della timeline scrubber presentava variazioni tra viste (discrepanze di layout, badge assenti o posizionamenti eterogenei dell'orario).
- **Causa Radice**: Mancata applicazione della Legge di Hick (Choice Overload) e di Occam's Razor sull'interfaccia di puntamento mappa, unita all'evoluzione disgiunta delle viste `SpotMapView` e `ForecastView`.
- **Pattern Vincolante**:
  1. **Sottomenu di Puntamento Mirino (`.gm-aim-menu-wrap`)**: Accorpare le azioni di centratura in un unico trigger visivo rappresentato da un'icona a mirino (`crosshair`) SVG con chevron indicatore (`.gm-aim-menu-trigger`). Al tocco, espande un menu a tendina in vetro satinato (`.gm-aim-dropdown`) con le opzioni "Comprensorio" e "Posizione GPS", ciascuna con target $\ge 44\text{px}$.
  2. **Dismissal Ergonomico & AccessibilitÃ **: Il menu deve supportare `aria-haspopup="menu"`, `aria-expanded`, chiusura automatica al click esterno, su tasto `Escape` e all'attivazione di qualsiasi voce del sottomenu.
  3. **Header Scrubber Unificato (`.gm-map-scrubber-header`)**: Su tutte le viste (`SpotMapView`, scrubber ancorato di `ForecastView`, modal di analisi volo), l'header deve presentare tassativamente:
     - Gruppo titolo: `<span class="gm-map-scrubber-title">Timeline VolabilitÃ </span>` affiancato dalla pillola spot (`.gm-map-scrubber-spot-pill`) con colore e badge reattivi alla volabilitÃ  oraria calcolata.
     - Display orario: `<div class="gm-map-scrubber-hour-display"><span class="gm-flight-alt">Ore XX:00</span></div>`.



---

## 85. Disaccoppiamento tra Tema Visivo e Layer Cartografico Reattivo (Anti-Reset del Layer Mappa)
- **Problema**: Alla selezione di un layer cartografico alternativo (es. OpenTopo, Satellite, CyclOSM) dal selettore a tendina su mappa, l'aggiornamento dello store (`store.setState({ ui: { ...ui, mapLayer: newLayer } })`) innescava il subscriber di vista che invocava incondizionatamente `mapEngine.setTheme(store.theme)`. `setTheme` reimpostava forzatamente il layer predefinito del tema (es. CartoDB Dark per tema scuro), sovrascrivendo la scelta dell'utente e lasciando il selettore disallineato rispetto alle tile renderizzate.
- **Causa Radice**:
  1. Assenza di una guardia sullo stato del tema corrente (`s.ui.theme !== this.activeTheme`), causando l'esecuzione di `setTheme()` a fronte di QUALSIASI mutazione dello store.
  2. Implementazione cieca di `setTheme(theme)` in `LeafletMapEngine` e `HeadlessMockMapEngine` priva di controllo sull'invarianza del tema (`if (this.theme === newTheme) return;`), che forzava la riassegnazione di `this.setLayer(theme === 'light' ? 'topo' : 'dark')`.
- **Pattern Vincolante**:
  1. **Guardia sull'Invarianza del Tema nei Subscriber**: Non invocare mai `mapEngine.setTheme()` a meno che `s.ui.theme` non sia effettivamente cambiato rispetto a `this.activeTheme`.
  2. **Idempotenza di `setTheme` nel Map Adapter**: `setTheme(newTheme)` deve verificare se `this.theme === newTheme` e uscire immediatamente se il tema Ã¨ immutato, preservando il layer cartografico esplicitamente scelto dall'utente (`this.currentLayerId`).
  3. **Sincronizzazione Bidirezionale**: All'effettivo cambio di tema applicativo (dark <-> light), riallineare sia il layer del motore di mappa sia il valore del `<select id="gm-map-layer-select">` e la proprietÃ  `this.activeLayer`.

---

## 86. Disaccoppiamento Fisico tra Canvas Cartografico e Controlli Temporali (External Bottom-Anchored Scrubber)
- **Problema**: L'annidamento del selettore temporale come elemento assoluto (`position: absolute`) sovrapposto al canvas cartografico causava l'occlusione visiva dei marker e dei comprensori situati nella porzione meridionale del viewport. Inoltre, i gesti di pan e zoom della mappa rischiavano collisioni di evento con lo swipe continuo dello scrubber orario.
- **Causa Radice**: Trattamento dello scrubber come card fluttuante sovrimpressa anzichÃ© come componente strutturale dell'interfaccia a 3 bande (`top-bar` -> `canvas` -> `bottom-bar`).
- **Pattern Vincolante**:
  1. **Architettura a 3 Bande di Vista Mappa**: La vista cartografica (`.gm-map-view`) deve articolarsi in un flex layout a colonna con 3 figli diretti non sovrapposti:
     - `header.gm-map-top-bar`: altezza fissa 50px, comandi territoriali esterni.
     - `div.gm-map-canvas-wrapper`: `flex: 1 1 0%; min-height: 0;`, canvas interamente visibile e privo di elementi fluttuanti che coprono i punti cardinali inferiori.
     - `footer.gm-map-scrubber-container`: `position: relative; flex-shrink: 0;`, barra solida ancorata in basso con `border-top` ed elevazione discreta, contenente la timeline oraria.
  2. **Zero Occlusioni Cartografiche**: L'ingombro del canvas Leaflet calcola l'`invalidateSize()` sull'effettiva altezza utile tra le due barre, garantendo che centratura, bounds ed estensione dei comprensori restino sempre al 100% visibili.

---

## 87. Salvaguardia da Storage Eviction Mobile & PWA Prompt (IndexedDB Defense)
- **Problema**: I motori browser mobili (WebKit ITP su iOS Safari e Android in low-storage) eliminano silenziosamente IndexedDB e LocalStorage dopo 7 giorni di mancata interazione o in caso di pressione sulla memoria di massa del dispositivo.
- **Causa Radice**: Trattare IndexedDB come archivio permanente di default, ignorando che sui sistemi operativi mobili viene classificato come storage best-effort revocabile.
- **Pattern Vincolante**:
  1. Invocare sistematicamente `navigator.storage.persist()` all'inizializzazione del database di volo.
  2. Se la richiesta restituisce `false`, esporre un avviso informativo non invasivo che raccomandi l'installazione come PWA ("Aggiungi a schermata Home", condizione che su iOS garantisce la persistenza a lungo termine).
  3. Collegare la salvaguardia al `syncDirtyTracker` (Fase 6-bis) per sollecitare il download del file `.json` di backup se trascorrono >14 giorni o risultano memorizzati $\ge 3$ nuovi voli.

---

## 88. Prevenzione Thread-Lock & OOM nel Parsing di Tracce IGC Grandi (Chunking & Decimazione Preventiva)
- **Problema**: L'importazione di file IGC estesi (>20.000 record B per voli di 4-6 ore) blocca il thread principale per oltre 1-2 secondi, superando la Doherty Threshold (<400ms) e rischiando freeze, crash da Out-Of-Memory (OOM) o avvisi di pagina non reattiva (ANR) su smartphone.
- **Causa Radice**: Parsing sincrono in un singolo blocco e calcolo immediato di virate/termiche (`flightManeuvers.js`) sull'array completo dei punti GPS non decimati.
- **Pattern Vincolante**:
  1. **Parsing Asincrono Chunkato**: Elaborazione a blocchi di 2.000 righe rilasciando il thread principale con `scheduler.yield()` / `setTimeout(..., 0)` aggiornando una barra di avanzamento lineare deterministica.
  2. **Pre-Decimazione LTTB**: Riduzione preventiva a 1.500 campioni significativi tramite `decimateLTTB` prima dell'esecuzione del rilevamento manovre e del guadagno termico, riducendo i tempi di calcolo da ~2s a <65ms.
  3. **Segregazione Immediata della Memoria**: Memorizzare il testo integrale IGC nello store isolato `flights_raw` e deallocare immediatamente l'array completo dalla memoria heap.

---

## 89. Injectable Storage Adapter Pattern per Database Headless (Node.js Test Isolation)
- **Problema**: L'uso diretto di riferimenti a `window.indexedDB` o `IDBKeyRange` nel modulo `core/logbookDb.js` provoca il fallimento a catena del test runner nativo Node.js (`node --test`), rompendo i 447 test della suite e violando il vincolo di Headless Core (Gate 2).
- **Causa Radice**: Mancata astrazione dello strato di persistenza rispetto al runtime di esecuzione.
- **Pattern Vincolante**:
  1. `core/logbookDb.js` deve accettare un adapter iniettabile conforme all'interfaccia `ILogbookDbAdapter`.
  2. Fornire come implementazione predefinita `createMemoryDbAdapter()` basata su `Map` JavaScript pura, utilizzata per tutti i test Node.js a 0ms senza polyfill.
  3. `createIndexedDbAdapter()` deve essere montato unicamente dall'ambiente browser reale della UI.

---

## 90. Gestione WebGL Context Loss & Degradazione Spaziale Vettoriale Offline (Replay 3D Resiliente)
- **Problema**: Sui dispositivi mobili, WebGL subisce frequenti perdite di contesto grafico (`webglcontextlost`) in condizioni di memoria GPU limitata o quando l'app va in background. Inoltre, l'assenza di connessione sui decolli impedisce il download di tile DEM raster remote, bloccando il Replay 3D.
- **Causa Radice**: Mancata gestione del ciclo di vita WebGL e accoppiamento rigido del rendering 3D alle sole mesh DEM esterne.
- **Pattern Vincolante**:
  1. Intercettare e gestire esplicitamente `webglcontextlost` e `webglcontextrestored` nell'adapter `IReplay3dEngine`.
  2. Disaccoppiare la telemetria 2D (variometro, profilo, quote FAI) su un elemento `Canvas` 2D autonomo renderizzato a 60 FPS, totalmente svincolato da WebGL.
  3. Prevedere una modalitÃ  di degradazione spaziale vettoriale 3D su griglia cartesiana piana calibrata sulle quote barometriche IGC in caso di offline o crash GPU.

---

## 91. Politica Network-Only Categorica nel Service Worker per Tile Cartografiche (Anti-QuotaExceededError)
- **Problema**: La memorizzazione automatica delle tile cartografiche esterne nella Cache Storage del Service Worker esaurisce rapidamente la quota massima consentita dal browser (50-100MB su WebKit), scatenando l'eccezione `QuotaExceededError` che blocca qualsiasi successiva scrittura su IndexedDB, impedendo di salvare nuovi voli o impostazioni.
- **Causa Radice**: Mancato isolamento tra asset statici applicativi locali e stream di tile raster remote ad alto volume.
- **Pattern Vincolante**:
  1. Il Service Worker deve applicare una strategia `Network-Only` (pass-through trasparente non intercettato) per tutti i domini di tile cartografiche esterne (OpenTopoMap, Esri Satellite, CyclOSM, OpenStreetMap, DEM Terrarium).
  2. Solo gli asset statici locali dell'applicazione (`index.html`, bundle CSS, icone, file JS e catalogo JSON delle localitÃ ) possono risiedere nella Cache Storage con strategia `Cache-First`.

---

## 92. ParitÃ  Dati Cartografici tra Mini-Mappa e Vista Schermo Intero (Settore Decollo & Linea di Planata)
- **Problema**: L'ispezione della mappa comprensorio a schermo intero (`renderComprensorioFlightMap`) ometteva il settore di esposizione del decollo e la linea geodesica di planata con codice colore di sicurezza, provocando asimmetria informativa rispetto alla mini-mappa contestuale e disorientando il pilota.
- **Causa Radice**: Mancata unificazione dei layer cartografici informativi tra la vista riassuntiva (`renderSpotMiniMap`) e l'overlay a schermo intero (`renderComprensorioFlightMap`).
- **Pattern Vincolante**:
  1. **Settore di Esposizione Decollo Unificato**: Sostituire il generico pin rettangolare con il marker SVG integrato (`generateTakeoffSectorSvg`) che fonde hub centrale quota, freccia azimutale del pendio, cono di apertura a 70Â° e badge numerico dei gradi orientati.
  2. **Tracciamento Geodesico di Planata**: Rendere sempre visibile la polilinea geodesica tratteggiata (`dashArray: '5, 7'`, peso 3px, opacitÃ  0.85-0.9) tra decollo e atterraggio, colorata in base alla volabilitÃ  dell'efficienza (`isSafe`, `severity`).
  3. **Aggiornamento Reattivo In-Place allo Scrubbing**: In `updateFlightProcedures()`, aggiornare sia la manica a vento sia il settore di decollo (`fl-to-sector-`) e il colore della linea di planata senza ricreare il layer nÃ© provocare flicker o distruzione del DOM Leaflet.

---

## 93. Architettura Storage a Due Livelli per Tracciati IGC: Duale Raw/Decimato e Timing della Decimazione LTTB
- **Problema**:
  1. Eseguire la decimazione LTTB prima di invocare il rilevamento manovre e virate (`detectThermals`, `detectFlightManeuvers`) altera e distrugge i delta angolari orizzontali a quota costante (i punti a quota costante hanno area altimetrica quasi nulla e vengono scartati da LTTB), azzerando la rilevazione di 360Â°, virate e termiche.
  2. Memorizzare unicamente la versione decimata impedisce l'esportazione di file IGC originali validi per omologazioni FAI (perdita della firma digitale G-record e dei record H completi).
  3. Al contrario, ricalcolare LTTB da capo ogni volta che l'utente apre il Replay 3D genera latenze di 100-300ms e battery drain su smartphone.
- **Causa Radice**: Confusione tra il momento computazionale della cinematica di volo (che richiede campioni sequenziali a 1Hz) e la visualizzazione grafica, unitamente alla mancata segregazione tra archivio di autenticitÃ  (raw) e cache di rendering (decimated).
- **Pattern Vincolante**:
  1. **Timing della Decimazione LTTB a Valle**: Eseguire l'analisi telemetrica, cinematica e il rilevamento termiche (`analyzeFlightTelemetry`) esclusivamente sulla sequenza continua a 1Hz dopo il trimming dei punti a terra. LTTB viene invocato a valle esclusivamente per: (a) `sparklineSvgPoints` (60-80 campioni) in `flights_meta`, (b) `decimatedPoints` (1.500 campioni) in `flights_raw`.
  2. **Duale Raw/Decimato in `flights_raw`**: Lo store `flights_raw` memorizza contestualmente sia il testo ASCII originale bit-for-bit `rawIgc` sia l'array pre-calcolato `decimatedPoints`. In questo modo:
     - L'esportazione e il backup scaricano il file IGC autentico con firma FAI integra.
     - L'avvio del Replay 3D (Fase 7) o della canvas 2D recupera direttamente i 1.500 punti pronti all'uso in <10ms senza ricalcolo su mobile.
  3. **Fingerprinting Deterministico Sincrono (FNV-1a 64-bit)**: Calcolare l'hash univoco del volo con algoritmo matematico puro in JS sincrono (senza `crypto.subtle`), garantendo funzionamento universale a 0ms anche su LAN/HTTP non protetti.
  4. **IndexedDB come SSOT & Store Reattivo in RAM**: IndexedDB Ã¨ l'unica sorgente di veritÃ  persistente. `store.flights` risiede in RAM e non serializza su `localStorage`, prevenendo `QuotaExceededError`.

---

## 94. Selezione Esplicita di Decolli e Atterraggi Multipli nel Comprensorio (Unico Binomio Dinamico & Fallback Conservativo)
- **Problema**: Nei comprensori dotati di piÃ¹ decolli o atterraggi (es. Monte Cornizzolo, Meduno, Monte Cuarnan), il calcolo orario selezionava esclusivamente l'accoppiata automatica $T_{\text{best}}$ e $L_{\text{safe}}$. Il pilota non poteva nÃ© simulare condizioni su un decollo alternativo (es. decollo alto vs basso, decollo esposto ad est) nÃ© vincolare un atterraggio specifico (es. campetto scuola vs atterraggio ufficiale) direttamente dalla selezione spot o dalla vista previsioni.
- **Causa Radice**: La funzione `evaluateComprensorio` nel core non accettava identificatori espliciti `takeoffId` e `landingId`, imponendo sempre la selezione euristica automatica, e l'interfaccia non esponeva selettori touch ad alto contrasto per le opzioni multiple.
- **Pattern Vincolante**:
  1. **Supporto Parametri Espliciti nel Core (`core/comprensorio.js`)**: `evaluateComprensorio({ comprensorio, weatherData, hourIndex, glider, targetDate, allowSynthetic, takeoffId, landingId })` accetta identificatori opzionali. Se specificati, calcola orientamento, severitÃ  e cono di planata per l'esatta coppia indicata (`isTakeoffOverridden: true`, `isLandingOverridden: true`). In caso di parametro nullo, indefinito o inesistente, scatta il fallback automatico conservativo su $T_{\text{best}}$ e $L_{\text{safe}}$ senza eccezioni sia in modalitÃ  online che offline.
  2. **Persistenza SSOT nello Store (`core/store.js`)**: Le chiavi `activeTakeoffId` e `activeLandingId` sono parte integrante dello stato reattivo e del set `persistedKeys`.
  3. **Zero Clutter UI & Standard Ergonomico Outdoor**: Nello sheet di ricerca spot e nell'header delle previsioni, i controlli di sub-selezione appaiono esclusivamente se `takeoffs.length > 1` o `landings.length > 1` (zero controlli ridondanti per spot singoli). Tutte le chip e pill interattive rispettano il floor touch $\ge 48\times 48\text{px}$, adottano `touch-action: pan-x` per scorrimento orizzontale a riga singola senza sovrapposizioni verticali e dichiarano semantica WAI-ARIA (`aria-checked="true"` / `aria-pressed="true"`).

---

## 95. Sincronizzazione Rigorosa della Scheda Overview Comprensorio con la Selezione di Decolli e Atterraggi Multipli
- **Problema**: Selezionando un decollo o atterraggio specifico (dallo sheet del picker, dalle pill nell'header delle previsioni, dal dropdown di Livello 2 o dai pin della mini-mappa), la scheda principale dell'overview del comprensorio (`#forecast-summary-card`) non rifletteva la selezione oppure veniva rimpiazzata da una vista a punto singolo (`#forecast-specific-spot-card`) che oscurava l'atterraggio, l'efficienza del cono di planata 1:G e la sintesi aerologica complessiva. Inoltre, l'istruzione inline `onclick="event.stopPropagation();"` nello sheet bloccava la propagazione dell'evento tap al contenitore del foglio modale nei browser mobili reali.
- **Causa Radice**: Disallineamento tra il dispatch degli eventi UI, la mancata idratazione di `activeTakeoffId`/`activeLandingId` nel ciclo di vita `mount()`/`store.subscribe`, e la frammentazione del contenitore della card `#forecast-spot-card-container` tra overview e specific subspot.
- **Pattern Vincolante**:
  1. **La Scheda Overview (`#forecast-summary-card`) Ã¨ il Cardine Invariante del Comprensorio**: Il contenitore `#forecast-spot-card-container` renderizza sempre la card riassuntiva (`renderSummaryCard(evaluated)`). Quando un decollo o un atterraggio viene selezionato (o modificato dall'utente), viene passato a `evaluateComprensorio({ takeoffId, landingId })`, garantendo che quota, nome decollo, azimut pendio, scostamento del vento, atterraggio prescelto ed efficienza di planata 1:G siano sempre calcolati e visualizzati all'istante (<400ms) nella scheda principale dell'overview.
  2. **Disaccoppiamento della RiferibilitÃ  Touch & Zero stopPropagation Inline**: Nello sheet dei comprensori, la riga principale del comprensorio (`.gm-picker-item-main` con `data-action="pick-spot"`) e il container delle chip (`.gm-picker-subselection`) devono essere elementi fratelli separati all'interno della card, eliminando categoricamente qualsiasi `stopPropagation()` inline.
  3. **Sincronizzazione Reattiva Globale**: Qualsiasi modifica di decollo o atterraggio (pill, sheet, dropdown Livello 2 o mini-mappa) aggiorna `activeTakeoffId`/`activeLandingId` e mantiene la modalitÃ  overview (`selectedSubSpot = 'overview'`), persistendo nello store SSOT ed effettuando il refresh in background dei dati meteo per le coordinate e la quota del decollo specifico.

---

## 96. PrioritÃ  Metadati Vela nei Tracciati IGC, Catalogo Storico e Derivazione Classi Badge UI
- **Problema**:
  1. Durante l'importazione di una traccia IGC, sovrascrivere il modello della vela con quello della sessione attiva del pilota corrompe la veridicitÃ  storica del tracciato di volo (il volo Ã¨ stato effettuato con la vela specificata nel log IGC).
  2. Molti file IGC registrano la vela senza indicare esplicitamente la classe di certificazione (es. `Axis Compact 4`), provocando la ricaduta forzata su classe `Custom` e privando il pilota del badge semantico colorato (EN-A..EN-D).
  3. Nel componente UI di rendering della card (`LogbookView.js`), l'omissione della derivazione della classe CSS per il badge (`classBadgeStyle`) scatena eccezioni `ReferenceError` a runtime.
- **Causa Radice**: Mancata prioritÃ  dei record H IGC (`HFGTY`) rispetto allo stato di sessione, assenza di interrogazione del catalogo storico `POPULAR_GLIDERS` per i modelli senza suffisso di classe, e mancata definizione della variabile di stile CSS.
- **Pattern Vincolante**:
  1. **PrioritÃ  Vela IGC**: In `parseIgc()` e `importIgcTrack()`, la vela estratta dai record H (`parsed.gliderType`) ha la prioritÃ  assoluta; il glider attivo (`options.activeGlider`) interviene unicamente se il campo nel file IGC Ã¨ assente o vuoto.
  2. **Deduzione Istintiva da Catalogo (`deduceGliderClass`)**: Se il nome della vela non contiene un match regex esplicito (`EN-[A-D]`, `DHV [1-3]`, `CCC`), la funzione deve eseguire una scansione normalizzata su `POPULAR_GLIDERS` (`core/gliders.js`), mappando modelli noti alla rispettiva classe certificata.
  3. **Normalizzazione Deterministica Classi CSS**: Nel controller UI, generare sempre `const classBadgeStyle = (gliderClass || '').toLowerCase().trim().replace(/[^a-z0-9-]/g, '')`, garantendo che valori come `EN-A` o `EN-B` si colleghino direttamente alle classi `.en-a`, `.en-b` con palette WCAG 2.1 AA dichiarate nel design system (`css/theme.css`).

---

## 97. Gestione dell'Esposizione del Decollo e dei Casi con Azimut Ignoto (Null Heading) nel Calcolo di VolabilitÃ 
- **Problema**:
  1. Nei comprensori o decolli in cui l'orientamento del pendio non Ã¨ censito nel catalogo (`heading == null` o `undefined`), il sistema ricorreva a fallback arbitrari (es. `heading || 180` o coercizione a 0Â° Nord), introducendo azimut fittizi, alterando artificiosamente la volabilitÃ  e mostrando settori e notifiche di allineamento fuorvianti nella UI.
  2. In `ForecastView.js`, la card del parametro "Vento in Decollo" calcolava lo stato in modo disaccoppiato dal motore di volabilitÃ  del comprensorio: con brezza calma (es. 2 km/h a Ciavanis da 101Â° con pendio 180Â°), etichettava il vento con un pallino rosso "Non Favorevole" a causa dello scostamento angolare $\Delta\theta = 79^\circ$, mentre la timeline in basso e l'algoritmo centrale lo valutavano correttamente verde "Volabile".
- **Causa Radice**:
  - Mancanza di gestione esplicita per decolli a esposizione non definita (`heading == null`).
  - Calcolo privato e non armonizzato di `windStatus` in `ForecastView.js` privo della soglia di brezza debole ($\le 4\text{ km/h}$).
- **Pattern Vincolante**:
  1. **Preservazione Rigorosa di `heading == null` (Zero Fallback Fittizi)**: Non assumere mai 180Â° Sud o 0Â° Nord per decolli privi di orientamento noto. Se `heading == null`, `evaluateDirectionFlyability` restituisce `null` e il motore imposta `indicators.direction = { hasExposure: false, label: 'Esposiz. N/D', diffDegrees: null, severity: 0 }`. La volabilitÃ  complessiva del decollo viene determinata unicamente dall'intensitÃ  del vento, dalle raffiche e dai limiti di sicurezza della vela.
  2. **Trasparenza Semantica e Grafica nella UI**: Quando `heading == null`:
     - Visualizzare chiaramente `Esposizione N/D` / `Azimut Pendio: N/D` e `Scostamento Decollo: N/D (Esposizione non nota)`.
     - Nel compasso SVG e nella mini-mappa, sopprimere il cono verde di apertura a 70Â° e la freccia azimutale di decollo, sostituendoli con un badge neutro o marker circolare neutro senza claim ingannevoli di allineamento.
  3. **Armonizzazione del Vento Calmo ($\le 4\text{ km/h}$)**: Sia nel core (`core/flyability.js`, `core/comprensorio.js`) sia nella UI (`ForecastView.js`), venti $\le 4\text{ km/h}$ non devono mai essere penalizzati come "Non Favorevole" o "Traverso Marcato": la brezza debole e il gradiente sinottico trascurabile sono valutati `flyable` ("Vento Calmo"), con decollo dominato dalle brezze locali di pendio. Solo venti da dietro con $\Delta\theta > 90^\circ$ ad intensitÃ  moderata sollevano attenzione `caution` ("Brezza da Dietro").










---

## 98. Aggiornamento In-Place degli Accordion UI e Preservazione dello Scorrimento
- **Problema**: Quando l'utente espandeva una card parametrica dell'accordion nelle previsioni (es. "Vento in Decollo", "Raffiche & Delta Vento", "Base Cumulo"), la pagina scattava tornando all'inizio (`scrollTop: 0`), disorientando il pilota e allontanando il contenuto appena svelato dal campo visivo.
- **Causa Radice**: L'azione `toggle-param-card` invocava `this.render()`, che distruggeva l'intero albero DOM della vista (`this.containerEl.innerHTML = this.renderHtml()`). Il nuovo elemento `#forecast-scroll-container` veniva inserito con `scrollTop = 0` e la mini-mappa Leaflet veniva inutilmente distrutta e ricreata.
- **Pattern Vincolante**:
  1. **Mutazione Selettiva In-Place per Componenti Locali**: Le interazioni di svelamento progressivo (accordion, tab locali, toggle) non devono mai distruggere il contenitore di scorrimento principale. Se `#forecast-params-container` Ã¨ presente nel DOM, aggiornare unicamente il markup dei parametri (`paramsContainer.innerHTML = this.renderParameterCards(...)`).
  2. **Doppia Guardia di Preservazione `scrollTop` in `render()`**:
     - Nel metodo generale `render({ resetScroll = false } = {})`, rilevare `prevScrollTop` prima di riassegnare `innerHTML`.
     - Dopo `setupScrollListener()`, ripristinare `scrollTop = prevScrollTop` se `prevScrollTop > 0` e non Ã¨ stato richiesto un reset esplicito.
     - L'azzeramento dello scorrimento (`resetScroll: true`) Ã¨ riservato esclusivamente a transizioni di cambio radicale del contesto (es. selezione di un comprensorio differente dallo sheet).


---

## 99. Separazione Computazionale tra Scheda di Dettaglio Telemetrico (0ms GPU) e Replay 3D della Traiettoria
- **Problema**: Accorpare l'analisi telemetrica analitica (elenco termiche agganciate, rateo medio di salita, quote ingresso/uscita, deriva del vento, note personali e debriefing didattico) esclusivamente all'interno del motore di Replay 3D costringe il dispositivo mobile ad avviare un pesante contesto grafico WebGL/GPU anche solo per consultare dati numerici o prendere appunti, provocando latenze (>1-3s), battery drain e impossibilitÃ  di consultazione fluida su smartphone non recenti.
- **Causa Radice**: Confusione tra consultazione statica/analitica post-volo (ispezione tabellare e debriefing) e rendering spaziale continuo ad alta frequenza (Replay 3D a 60 FPS).
- **Pattern Vincolante**:
  1. **Disaccoppiamento della Scheda Dettaglio (`FlightDetailSheet.js`)**: Realizzare la scheda analitica come Bottom Sheet a piena altezza (`100dvh`) montata tramite `sheetManager`. I dati telemetrici analitici (`analyzeFlightTelemetry`) vengono recuperati dal database a due livelli e renderizzati istantaneamente a 0ms GPU con grafici SVG leggeri e tabelle HTML sobrie.
  2. **Persistenza Note in Background**: Le annotazioni personali del pilota vengono aggiornate e salvate direttamente nel record `flights_meta` su IndexedDB senza ricaricare la pagina o distruggere il DOM dello sheet.
  3. **Ponte Ergonomico Verso il Replay 3D**: La scheda di dettaglio funge da trampolino verso il Replay 3D: il pulsante primario imposta `store.activeReplayFlightId` e naviga verso `#replay`, permettendo all'utente di passare al 3D solo su esplicita richiesta.

---

## 100. Ingestione Schemi Eterogenei ParaMeteo (V1/V2/Array) e Strategia Smart Merge Last-Write-Wins
- **Problema**: L'importazione di backup storici da ParaMeteo (generati come Full Backup Package V2, vecchi export Logbook V1 o semplici array JSON di voli) presenta strutture disomogenee: tracce memorizzate in store dedicati `flightTracks` o incorporate in `flight.trackPoints`/`flight.track`, formati di data ISO o stringhe timestamp, e campi vela strutturati come `{ glider: '...' }` anzichÃ© `{ name: '...' }`. Inoltre, re-importare un backup identico non deve duplicare o sovrascrivere inutilmente i voli esistenti, ma deve consentire l'arricchimento incrementale (es. aggiungere la traccia GPS a un volo precedentemente registrato solo con metadati).
- **Causa Radice**: Evoluzione dello schema di persistenza tra versioni applicative e disallineamento tra il formato di backup monolitico e l'architettura a 2 livelli (`flights_meta` + `flights_raw`) di GlideMind.
- **Pattern Vincolante**:
  1. **Parsing Polimorfico Deterministico (`core/parameteoImporter.js`)**: Riconoscere i 3 formati (V2 con `database`, V1 con `flights` e array grezzo), riconciliando le tracce in una mappa unificata `tracksMap` indicizzata per `flightId`.
  2. **Normalizzazione verso Storage a 2 Livelli**: Generare sempre `{ meta, raw }`, derivando la classe vela da `gliderName` normalizzato (evitando fallimenti su oggetti `{ glider: '...' }`), generando sparkline SVG a 60 punti e decimazione LTTB a 1.500 punti per il Replay 3D.
  3. **Smart Merge Last-Write-Wins**: In modalitÃ  `merge` (default), un volo esistente viene aggiornato se e solo se l'elemento in arrivo ha un timestamp `updatedAt` strettamente maggiore (`incomingUpdated > existingUpdated`) oppure se l'elemento in arrivo fornisce una traccia GPS che nel database locale era assente (`!existingHasTrack && incomingHasTrack`). Altrimenti, il record identico viene ignorato senza scritture ridondanti.
  4. **Dropzone Polimorfa & Banner Informativo**: Estendere il file input e il drag & drop a `.igc,.json,application/json`, identificando il tipo dal contenuto o dall'estensione, con avanzamento deterministico e banner di riepilogo (`gm-import-summary-banner`).

---

## 101. Standard di Presentazione dei Report di Fine Task (Contenitori Collassati e Ultimo Aperto)
- **Problema**: I report finali dettagliati inviati in chat possono risultare prolissi da scorrere se l'utente vuole verificare immediatamente le modifiche operative e le istruzioni di test senza dover scorrere decine di righe di specifiche architetturali e log di test.
- **Causa Radice**: Assenza di una gerarchia di disclosure progressiva nella sintesi di consegna in chat.
- **Pattern Vincolante**: Nei report finali di consegna, strutturare le sezioni analitiche (Architettura, Dettagli Tecnici, Evidenze Gate Shift-Left, File Modificati) all'interno di contenitori collassati (`<details><summary>...</summary>`), lasciando categoricamente aperto **solo ed esclusivamente l'ultimo contenitore** (`<details open><summary>Lavori Effettuati e Istruzioni di Test</summary>`), che riassume in modo operativo i lavori svolti e le modalitÃ  puntuali per collaudarli.

---

## 102. Disaccoppiamento tra ContinuitÃ  di Volo Recente (Pilot Currency) e Scadenze Legali/Burocratiche
- **Problema**: L'adozione del termine "Da rinnovare" per descrivere un pilota senza voli recenti o con libretto vuoto generava grave disorientamento ed errata percezione di scadenza burocratica (es. visita medica VDS, attestato AeCI, assicurazione). Inoltre, un modello binario a scatto di 30 giorni non riflette la realtÃ  del volo libero, dove la continuitÃ  operativa si degrada gradualmente.
- **Causa Radice**: Traduzione acritica del concetto anglosassone di *pilot currency* (recency di volo) e assenza di distinzione tra adempimenti legali e allenamento pratico ai comandi.
- **Pattern Vincolante**:
  1. **Separazione Documenti vs Allenamento**: Le scadenze burocratiche e legali (visita medica, assicurazione) appartengono esclusivamente al Profilo/Impostazioni (`SettingsView`). Il blocco Home Dashboard "AttivitÃ  Pilota" misura unicamente la **continuitÃ  di volo operativa**.
  2. **Modello a 4 Stati di ContinuitÃ  (`core/logbook.js`)**:
     - `no_flights`: libretto vuoto (`0 ore`, `0 voli`) -> `'Nessun volo'`, badge grigio neutro (`gm-badge-nd`).
     - `active`: ultimo volo $\le 35\text{ gg}$ -> `'In attivitÃ '`, badge verde (`gm-badge-flyable`), continuitÃ  ottimale.
     - `reentry`: ultimo volo tra 36 e 90 gg -> `'Ripresa graduale'`, badge ambra (`gm-badge-caution`), raccomandata ripresa con condizioni tranquille.
     - `lapsed`: ultimo volo $> 90\text{ gg}$ -> `'Fermo prolungato'`, badge arancione (`gm-badge-alert`), raccomandata cautela, campetto di gonfiaggio o volo di ripresa.
  3. **Explainability Diretta sul Badge**: Il badge include sempre un attributo `title` con il numero esatto di giorni trascorsi dall'ultimo volo e un suggerimento pratico di sicurezza per orientare il pilota.

---

## 103. Separazione Tripartita della UX del Libretto di Volo (Logbook Puro, Dashboard Valuta e Ingestione Dedicata)
- **Problema**: Accorpare in un'unica pagina a scorrimento verticale la dropzone permanente di upload IGC ($200\text{px}$), i riquadri delle statistiche di carriera, la ricerca, i filtri e l'elenco dei voli con card pesanti ($320\text{px}$) crea grave sovraccarico tematico (3 compiti disomogenei), occupa metÃ  dello schermo con un'azione di upload episodica (1% del tempo d'uso) e costringe il pilota a scorrere a lungo per leggere anche un solo volo.
- **Causa Radice**: Mancata separazione architetturale tra le tre distinte intenzioni d'uso (Jobs To Be Done): consultazione rapida del feed cronologico, analisi retrospettiva della sicurezza/progressione e procedura transazionale di caricamento file.
- **Pattern Vincolante**:
  1. **Segmented Control Sub-Navigazione**: All'interno del tab Logbook della barra inferiore (mantenendo invariate le 5 tab primarie per non degradare i touch target su mobile), prevedere un selettore a due schede immediate: `[ Voli (N) ]` e `[ Statistiche & Valuta ]`.
  2. **Card Volo Snella & Card-as-Target (~110px)**: Nel feed `Voli`, eliminare le righe di bottoni testuali ridondanti (Replay 3D, Scarica IGC, Dettagli, Elimina); l'intera card diventa un unico touch target ergonomico ($\ge 48\text{px}$) che apre la `FlightDetailSheet`, mostrando `#NumeroVolo` come primissimo elemento, data/orario, 3 sole metriche glanceable (Tempo, Quota, Guadagno/Distanza), sparkline sottile e pulsante discreto di eliminazione rapida con finestra di grazia Undo 5s (NN/G #3).
  3. **Dashboard Statistiche & Valuta Separata (`LogbookStatsView.js`)**: Dedicare la seconda sub-vista alla valuta del pilota (giorni dall'ultimo volo, raccomandazione didattica EN-A), totali di carriera (ore, termiche, manovre), record personali e distribuzione per decolli e vele.
  4. **Ingestione On-Demand (`ImportFlightSheet.js`)**: L'upload di tracce IGC e backup ParaMeteo viene delegato a un modal sheet dedicato a piena altezza attivabile dal pulsante `+ Importa` in testata o in automatico se il libretto ha 0 voli, con dropzone touch, indicatore di avanzamento e report di deduplicazione, preservando la pulizia del feed principale.





---

## 103. Monitoraggio della Finestra di Contesto e Riavvio della Sessione (Session Longevity Guard)
- **Problema**: L'accumulo prolungato di turni utente-agente e grandi payload di tool (dump file, test log, diff estesi) all'interno di una singola sessione di chat provoca saturazione della finestra di contesto, con conseguente decadimento delle prestazioni del modello LLM.
- **Causa Radice**:
  1. *Lost in the Middle & Attention Drift*: Il modello fatica a mantenere la focalizzazione su vincoli specifici stabiliti nei primi turni, rischiando di reintrodurre antipattern o fare regressioni.
  2. *AmbiguitÃ  di Stato*: La presenza nel contesto di stati precedenti del codice, modifiche intermedie e log superati genera confusione rispetto allo stato corrente del filesystem.
  3. *Latenza e Consumo Token*: Ogni nuovo turno deve ri-processare l'intera cronologia accumulata, rallentando drasticamente il tempo di risposta (TTFT).
- **Pattern Vincolante**:
  1. **Monitoraggio dei Turni**:
     - *Soglia di Attenzione*: A $\ge 15-20$ turni utente (o con transcript densa di file dump), l'agente notifica l'avvicinamento al limite ottimale.
     - *Soglia Critica*: A $\ge 25$ turni, l'agente raccomanda esplicitamente di sincronizzare lo stato cognitivo (`memory-sync`), completare il task e aprire una nuova chat pulita.
  2. **Transizione Naturale su Confine di Task (Task Boundary)**: Il completamento di uno step di `DESIDERATA.md` o di un fix strutturale Ã¨ il momento architetturalmente ideale per chiudere la sessione ed eseguire il riavvio fresco con `/next-step`.
  3. **Alert Strutturato**: Inserimento a fine messaggio di un box di avviso esplicito con indicazione del comando `/next-step` per la sessione successiva.


---

## 104. Contrasto dei Marker Cartografici su Basemap Eterogenee e Zoom Dettagliato
- **Problema**: A zoom intermedio/dettagliato ($\ge 9.5$), i tile topografici (OpenTopoMap, Esri Topo) mostrano un fondo molto chiaro con curve di livello fitte, pendii verde chiaro e fondovalle bianchi. Marker dot con riempimento semitrasparente (`rgba(..., 0.32)`), bordi sottili omocromatici (2px) e glifi colorati si dissolvono completamente nell'orografia.
- **Causa Radice**: Assunzione implicita di operare su cartografia scura e uso di alfa-trasparenza non supportata da una maschera o casing di contrasto solido.
- **Pattern Vincolante**:
  1. **Autosufficienza di Contrasto (Dual-Boundary Casing)**: I marker cartografici non devono mai usare riempimenti trasparenti a bassa opacitÃ . Utilizzare sempre riempimento solido al 100% nel colore di stato, racchiuso da un bordo bianco puro ($\ge 2.5\text{px}$) e da un'ombra profonda con micro-chiave scura (`box-shadow: 0 3px 8px rgba(0,0,0,0.65), 0 0 0 1.5px rgba(0,0,0,0.35)`). In questo modo il marker stacca istantaneamente sia su sfondi bianchi/chiari sia su sfondi scuri/satellitari.
  2. **Contrasto Interno dei Glifi**: I simboli interni devono rispettare la legge del contrasto massimo (glifi bianchi su verde `#22c55e` e rosso `#ef4444`, glifo scuro antracite `#0f172a` su ambra `#eab308` per conformitÃ  WCAG AA $\ge 4.5:1$).
  3. **Scaling Progressivo per Livelli di Zoom**:
     - *Macro Zoom ($< 7.5$)*: cluster circolari solidi numerati da 38px.
     - *Standard Zoom ($7.5 - 9.4$)*: dot semaforici ad alto contrasto da 28px.
     - *Detailed Zoom ($\ge 9.5$)*: dot maggiorati da 34px (`.gm-map-dot-detailed`) con glifo a $0.95\text{rem}$ per visione rapida a colpo d'occhio.
  4. **Focalizzazione dello Spot Attivo**: Lo spot osservato riceve una corona beacon luminosa a doppio anello (`.gm-map-dot-focused`) e il popup descrittivo contestuale Leaflet (`.gm-map-spot-popup`), evitando rigorosamente l'iniezione di tag testuali fluttuanti statici nel marker per non generare duplicati grafici.
  5. **Nessun Indebolimento nel Tema Chiaro**: Evitare di depotenziare le ombre dei marker in `[data-theme="light"]`, poichÃ© la basemap raster ha le proprie luminanze indipendenti dal tema dell'applicazione.

---

## 105. Istogrammi Mensili SVG a Zero Dipendenze per la Dimensione Temporale nel Logbook
- **Problema**: Le dashboard di volo basate unicamente su totali numerici statici (ore di carriera, numero totale di voli, record di quota) appiattiscono la storia del pilota e non consentono di valutare la stagionalitÃ  termica, la regolaritÃ  delle sessioni o i periodi prolungati di inattivitÃ  durante l'anno. Tentare di usare librerie esterne (Chart.js, D3) viola i vincoli di performance mobile e offline-first PWA, mentre grafici a torta o a dispersione violano le Laws of UX per scarsa leggibilitÃ  outdoor.
- **Causa Radice**: Assenza di una funzione headless di aggregazione temporale mensile e mancata adozione di markup SVG inline matematico.
- **Pattern Vincolante**:
  1. **Generazione Matematica SVG a Zero Allocazione GPU**: L'istogramma mensile (12 mesi) viene generato come markup SVG inline leggero con coordinate normalizzate (`viewBox="0 0 360 148"`), griglia di riferimento a 3 quote con linee tratteggiate discrete, tick a baseline per i mesi a zero attivitÃ  e indicatore solare primario sul mese corrente.
  2. **Aggregazione Headless Core (`calculateMonthlyFlightActivity`)**: La logica temporale risiede nel core puramente matematico, calcolando max, scale ceiling adattivo (2, 4, 6, 10 o multipli di 5) e label brevi localizzate in italiano (`Gen`, `Feb`, ..., `Dic`), tollerando formati data ISO e stringhe parziali.
  3. **Toggle Ergonomico Ore / Voli**: Consentire il cambio metrica rapido tramite bottoni dedicati con touch target minimo $\ge 32\text{px} \times 44\text{px}$ e feedback semantico `aria-pressed`, senza mai nascondere le metriche assolute.

---

## 106. Grafici Misti a Doppio Asse e Donut Chart Matematiche SVG per la Dashboard Statistiche Logbook
- **Problema**: L'uso di toggle separati per passare tra ore di volo e numero di voli nasconde la correlazione tra le due grandezze (es. mesi con pochi voli ma ore elevate indicano voli di cross e termica, mentre mesi con molti voli ma poche ore indicano voli didattici, scuola o veleggiata locale). Inoltre, le tabelle di testo con sole barre di progresso per decolli e vele non offrono la percezione immediata della quota di mercato personale sul totale dei voli.
- **Causa Radice**: Limitazione dei layout univariati e assenza di visualizzazioni di proporzione radiale a colpo d'occhio.
- **Pattern Vincolante**:
  1. **Grafico Misto a Doppio Asse Y SVG**: Mantenere la linea temporale dei 12 mesi solari su un unico grafico compatto (`viewBox="0 0 360 160"`), combinando le barre verticali per le ore di volo (asse Y sinistro) e una spezzata polilinea (`<polyline>`) con nodi a punto ed etichette per il numero di voli (asse Y destro in ciano avionico `#38bdf8`). Legenda esplicita sdoppiata in testata.
  2. **Donut Chart SVG Parametriche**: Costruire la ciambella matematica con archi `<circle>` tramite `stroke-dasharray` e `stroke-dashoffset` ($r = 44$, $C \approx 276.46$, rotazione $-90^\circ$). Evitare il disordine visivo aggregando le voci minori oltre la 5Âª posizione in uno spicchio residuale "Altri" (`#64748b`), con foro centrale contenente il conteggio totale assoluto dei voli.
  3. **Zero Librerie Esterne**: Conservare sempre la renderizzazione SVG pura via stringhe template per garantire 0ms di latenza, zero bundle bloat e piena reattivitÃ  sia in dark cockpit che in sunlight light mode.

---

## 107. Single Source of Truth per Fumetti Cartografici e Sincronizzazione 1:1 del Focus Marker
- **Problema**: All'attivazione di uno spot sulla mappa compaiono due etichette/fumetti sovrapposti per lo stesso nome, e cambiando spot dalla tendina o toccando un marker l'alone luminoso (.gm-map-dot-focused) rimane ancorato al vecchio spot pur aprendosi il popup sul nuovo.
- **Causa Radice**:
  1. *Fumetti doppi*: Coesistenza di un elemento statico nel marker (`<span class="gm-map-focused-name-tag">`) con il popup nativo di Leaflet (`.gm-map-spot-popup`), entrambi agganciati alla medesima coordinata superiore del marker.
  2. *Desincronizzazione stato/marker*: `SpotMapView` memorizzava `focusedSpotId` prima di notificare lo store, provocando il bypass del subscriber reattivo. Inoltre il cambio spot da dropdown muoveva la vista (`flyTo`) e apriva il popup ma non invocava un metodo esplicito sul motore per trasferire la classe CSS `.gm-map-dot-focused` tra i layer DOM.
- **Pattern Vincolante**:
  1. **Unico Fumetto Ammesso (SSOT)**: Il popup interattivo di Leaflet Ã¨ l'unica etichetta consentita sopra il marker. Nessun elemento di testo ausiliario deve essere innestato permanentemente nel DOM del marker HTML (`L.divIcon`).
  2. **Metodo Esplicito `mapEngine.setActiveSpotId(spotId)`**: Il motore cartografico deve esporre un metodo atomico `setActiveSpotId` che rimuove la classe di focus dal vecchio marker e la applica al nuovo in un unico passaggio (sia per marker DOM che per marker Canvas).
  3. **Hooking Bidirezionale Completo**: `setActiveSpotId(spotId)` deve essere invocato obbligatoriamente da:
     - Apertura popup (`openSpotPopup` e evento `popupopen`).
     - Click diretto sul marker (`marker.on('click')`).
     - Cambio selezione dal dropdown (`#gm-map-spot-select`).
     - Gestore centralizzato `handleSpotFocus(spotEval)`.



  4. **Ponte di Navigazione Mappa-Previsioni (Cross-View Bridge)**: Il fumetto del marker cartografico deve includere un'azione primaria prominente per aprire le previsioni dettagliate dello spot (`Previsioni âº`) affiancata all'azione secondaria (`Scheda Spot`). Al tap su `Previsioni âº`, il controller deve sincronizzare nello store non solo `selectedSpotId` e `selectedSpot`, ma anche l'orario attivo dello scrubber (`activeHourIndex`) e la data selezionata (`activeDate`), consentendo a `ForecastView` di atterrare direttamente sul punto temporale esaminato senza attrito cognitivo.

---

## 108. Riduzione della Frizione nei Picker di Selezione (Direct Tap-to-View & Zero Pulsanti di Conferma Ridondanti)
- **Problema**: Negli sheet di selezione comprensorio (`openPickerSheet`), la presenza di un pulsante di conferma esplicito (`Visualizza Previsioni âº`) per i comprensori a decolli multipli creava una disomogeneitÃ  operativa rispetto ai siti a decollo singolo (che si aprono al singolo tap), imponendo un secondo tap superfluo e ritardando la visualizzazione dei dati meteo.
- **Causa Radice**: Adozione di un pattern "seleziona chip e poi applica con pulsante secondario" anzichÃ© "tap diretto per selezionare e visualizzare all'istante" (Doherty Threshold & Fitts's Law).
- **Pattern Vincolante**:
  1. **Tap Diretto per Comprensorio e Decollo/Atterraggio**: Eliminare i pulsanti di conferma/applicazione (`.gm-picker-apply-btn`). Assegnare `data-action="pick-spot"` all'intera card `.gm-picker-item` per azzerare dead zone.
  2. **Unificazione dell'Azione di Selezione**:
     - Il tap sulla card o sul titolo comprensorio apre immediatamente le previsioni per quel sito con il decollo e l'atterraggio attivi o primari.
     - Il tap su un chip di decollo specifico (`data-action="pick-spot-takeoff"`) o di atterraggio (`data-action="pick-spot-landing"`) seleziona istantaneamente il sub-spot associato, chiude lo sheet e renderizza la schermata previsioni senza passaggi intermedi.
     - Il pulsante stella preferiti (`data-action="toggle-pin-spot"`) rimane isolato e preserva l'apertura dello sheet.
  3. **Risoluzione Deterministica di `spotId`**: Il controller deve risolvere `spotId` primariamente dal target attivo (`actionEl.getAttribute('data-spot-id')`) con fallback trasparente sulla card padre (`card.getAttribute('data-spot-id')`).

---

## 109. Debriefing Analitico di Volo: Full-Screen Dedicated View vs Bottom Sheet Drawer (Anti-Pattern Flyer) & Allineamento di Schema Telemetrico
- **Problema**: L'adozione di un bottom sheet modale ("flyer") per la consultazione del debriefing di volo e della telemetria densa comprimeva l'area utile (`max-height: 88dvh`), generava collisioni di gesto (*drag-to-dismiss* vs scroll verticale di grafici SVG e textarea note), nascondeva la CTA primaria "Visualizza Replay 3D" in fondo a pagine di scorrimento e non supportava il tasto "Back" nativo dello smartphone. Inoltre, discrepanze tra i nomi di proprietÃ  nel core (`altGain`, `originDeg`, `turnCount`, `efficiencyPercent`) e nella UI (`netGain`, `bearingDeg`, `turns`, `efficiency`) producevano stringhe corrotte (`undefinedÂ°` nel vento, `+0 m` nelle termiche).
- **Causa Radice**: Confinamento di un'attivitÃ  di analisi complessa (post-flight debriefing) in un pattern concepito per azioni transitorie (picker/drawer) e mancata adozione di un test di contratto tra l'oggetto telemetrico del core e il template di rendering visuale.
- **Pattern Vincolante**:
  1. **Full-Screen View Dedicata (`100dvh`)**: Le viste analitiche dense devono occupare l'intero schermo (`.gm-flight-detail-fullscreen`, `fixed inset-0 z-1050 100vw 100dvh`), senza backdrop oscurato o drag handles di chiusura.
  2. **Top Bar con Touch Target Ampio ($\ge 48\times 48\text{px}$)**: Navigazione di ritorno prominente (`â Libretto`) agganciata all'Escape da tastiera e alla cronologia hash, con ripristino del focus per accessibilitÃ  WCAG.
  3. **Sticky Bottom Action Bar nella Thumb Zone**: La CTA primaria (Replay 3D) e secondaria (Export IGC) risiedono in una barra inferiore fissa facilmente raggiungibile dal pollice su schermi outdoor.
  4. **Gestalt Common Region per la Telemetria**: Le metriche cinematiche devono essere incapsulate in tessere responsive (`.gm-flight-metrics-grid`, 2 colonne mobile / 3 colonne desktop) con card a contrasto e unitÃ  esplicite.
  5. **Resilienza di Schema (Defensive Property Access)**: Nei template UI, accedere alle grandezze fisiche con fallback sicuri (`altGain ?? netGain`, `originDeg ?? bearingDeg`) e convalidare l'assenza di `undefined` o numeri privi di unitÃ  tramite test automatici dedicati.

---

## 110. Compressione Monofila dell'Header Previsioni & Rimozione dei Controlli di Sub-Selezione Ridondanti (Occam's Razor)
- **Problema**: Nella vista Previsioni (`ForecastView`), la selezione del comprensorio e dei suoi decolli/atterraggÃ® multipli era frammentata tra dropdown, chip orizzontali duplicate (`DECOLLO: (N)` e `ATTERRAGGIO: (N)`) e picker sheet. Le chip duplicate occupavano oltre 75px verticali, si avvolgevano disordinatamente o troncavano le label sui display mobile compatti (360px-390px), violando il principio del Rasoio di Occam (moltiplicazione inutile di controlli concorrenti per il medesimo scopo).
- **Causa Radice**: Stratificazione di controlli UI introdotti in fasi successive senza consolidamento sistemico (un controllo in-page e uno modale per la stessa identica funzione).
- **Pattern Vincolante**:
  1. **Barra Unificata Comprensorio & Sub-Spot (`.gm-unified-spot-bar`)**: Un solo target ergonomico $\ge 48\text{px}$ nell'header che espone il comprensorio e il punto/decollo attivo come badge contestuale (`.gm-unified-subspot-badge`).
  2. **Accesso Rapido Nello Sheet con Raggruppamento Semantico**: La selezione e il cambio di decollo/atterraggio risiedono unicamente all'interno della prima sezione dello sheet (`.gm-picker-current-spot-section`), strutturata in 3 gruppi chiari con icone dedicate: `Panoramica`, `Decolli (N)` e `Atterraggi (N)`.
  3. **Zero Controlli Duplicati In-Page**: Vietato inserire container di chip orizzontali o pillole di sub-selezione tra l'header e la barra delle date (`.gm-date-tabs`), massimizzando la vertical clearance per i dati meteorologici e i grafici orari.

---

## 111. Integrazione 3D MapLibre GL & Three.js CustomLayer: Allineamento Geodetico P0 a Singolo Scatto e Resilienza WebGL Context
- **Problema**: L'integrazione di scene Three.js su cartografia MapLibre GL 3D puÃ² causare jitter o sfarfallio delle geometrie ad alto zoom se le coordinate locali Three.js vengono riproiettate a ogni frame o se l'origine viene spostata dinamicamente. Inoltre, la perdita del contesto grafico WebGL (`webglcontextlost`) sui dispositivi mobili congela l'applicazione se non intercettata.
- **Causa Radice**: Precisione limitata dei float a 32-bit nelle GPU su coordinate globali Mercator estese, e rilascio forzato del contesto WebGL da parte dei browser mobile in background.
- **Pattern Vincolante**:
  1. **Single-Shot Origin Alignment ($P_0$)**: Calcolare l'origine topocentrica Three.js $P_0 = (\text{lon}_0, \text{lat}_0, \text{alt}_0)$ una sola volta al caricamento della traccia (`loadTrack`). La matrice di trasformazione $\mathbf{M}_{\text{coordTransform}}$ converte le coordinate locali Three.js (X: Est, Y: Zenit, Z: Sud) nello spazio Mercator MapLibre (X: Est, Y: Sud, Z: Zenit) scambiando gli assi Y e Z, scalando per `meterScale` e traslando alle coordinate Mercatore di $P_0$.
  2. **Pipeline di Fallback e Resilienza WebGL**: Registrare sempre `webglcontextlost` (`event.preventDefault()`) e `webglcontextrestored` per ricreare la scena Three.js senza memory leak o crash. In assenza di WebGL o librerie esterne, garantire la degradazione automatica a motore headless.
  3. **Asset 3D Standardizzati & Fallback Procedurale**: Il caricamento degli avatar 3D (`loadParagliderModel`) deve tentare l'asset binario `data/models/paraglider.glb` e ricorrere immediatamente a mesh procedurale parametrica in Three.js in caso di errore di rete o offline, senza bloccare la riproduzione.

---

## 112. Resilienza di Apertura Dettaglio Volo: Fallback a Tre Livelli (IndexedDB â Store â Seed), Sintesi Altimetrica e Trasparenza Eventi Card
- **Problema**: Il tap su una card di volo nel Libretto (`LogbookView`) non apriva la vista di dettaglio a tutto schermo (`FlightDetailSheet`) nel caso di voli seed/demo iniziali (`fl-1` Monte Cornizzolo) o voli memorizzati unicamente nella cache reattiva dello store prima dell'importazione della traccia IGC in IndexedDB. Inoltre, i click su elementi interni alla card potevano essere intercettati da container SVG sparkline privi di trasparenza agli eventi puntatore.
- **Causa Radice**:
  1. `openFlightDetailView` interrogava esclusivamente `logbookManager.getFlightDetail(flightId)`. PoichÃ© i voli predefiniti risiedono nello store reattivo (`state.flights` / `DEFAULT_SEED_FLIGHTS`) e non nel database IndexedDB fino a importazione fisica, la chiamata restituiva `null`, interrompendo silenziosamente il flusso senza mostrare l'overlay.
  2. Mancava l'handler da tastiera per accessibilitÃ  WCAG (`handleKeyDown` su `article[tabindex="0"]` con tasti Enter/Space).
  3. L'istanza di store passata o iniettata nel controller non veniva propagata alla vista di dettaglio, causando il mancato aggiornamento di `activeReplayFlightId` in fase di avvio replay.
- **Pattern Vincolante**:
  1. **Fallback a Tre Livelli e Sintesi Altimetrica**: Le funzioni di apertura dettaglio (`openFlightDetailView`) devono risolvere il volo tramite catena gerarchica: IndexedDB $\to$ `store.getState().flights` $\to$ `DEFAULT_SEED_FLIGHTS`. Qualora i punti della traccia (`decimatedPoints`) siano assenti o inferiori a 2, sintetizzare dinamicamente un tracciato altimetrico e una telemetria plausibile, garantendo che il grafico SVG e le metriche si renderizzino sempre correttamente.
  2. **Trasparenza Eventi Card (`pointer-events`)**: Per consentire a `target.closest('[data-action]')` di intercettare affidabilmente l'evento tap/click su qualsiasi punto della card, assegnare `pointer-events: none` a tutti gli elementi decorativi e testuali interni (`.gm-flight-sparkline-wrap`, `.gm-flight-metrics-row`, `.gm-flight-title-group`, `.gm-flight-card-sub`), isolando con `pointer-events: auto` e `stopPropagation` solo i pulsanti di azione dedicati (es. `.gm-flight-delete-btn`).
  3. **AccessibilitÃ  Tastiera (WCAG 2.1 AA)**: Associare sempre un ascoltatore `keydown` per i tasti `Enter` e `Space` sulle card marcate `tabindex="0"`, aprendo la vista di dettaglio in modo simmetrico al tocco.
  4. **Test Headless d'Integrazione Completo**: Coprire il ciclo di vita dell'interazione con test headless che simulano il tap sulla card, sui child element, l'eliminazione, i tasti Enter/Space, il tasto Back, Escape e la navigazione a 3D Replay.

---

## 113. Eliminazione Watermark "API KEY REQUIRED" nel Rendering 3D: Migrazione a Basemap Keyless Esri/OpenTopo e Selettore Dinamico Multi-Layer
- **Problema**: Durante il rendering del terreno orografico nel Replay 3D (`FlightReplayView` e `MapLibreThreeEngine`), i tile del suolo mostravano una filigrana diagonale continua recante la dicitura *"API KEY REQUIRED carto.com/basemaps/apikey"*, degradando la visibilitÃ  della texture superficiale e dell'altimetria DEM. Inoltre, l'interfaccia 3D non permetteva al pilota di commutare la cartografia su ortofoto satellitare o rilievo topografico.
- **Causa Radice**:
  1. CARTO ha imposto l'obbligo di autenticazione API su tutti gli endpoint raster di `basemaps.cartocdn.com` (`dark_all`, `rastertiles/voyager`), restituendo tile degradate con filigrana impressa a qualsiasi richiesta non autenticata.
  2. Lo stile predefinito di `ui/3d/MapLibreThreeEngine.js` richiedeva in modo cablato `https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png`.
  3. Mancava un selettore di layer per il motore 3D e la sincronizzazione con `store.getState().ui.mapLayer`.
- **Pattern Vincolante**:
  1. **Bando Totale di Endpoint Raster CARTO Non Autenticati**: Vietare l'uso di `basemaps.cartocdn.com` in tutti i moduli cartografici 2D e 3D.
  2. **Adozione di Basemap Raster Keyless ad Alta AffidabilitÃ  (`BASEMAP_LAYERS_3D`)**:
     - *Dark Cockpit*: Esri World Dark Gray Base (`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`)
     - *Satellite Ortofoto*: Esri World Imagery (`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`)
     - *Rilievo Topografico*: OpenTopoMap (`https://a.tile.opentopomap.org/{z}/{x}/{y}.png`)
     - *Stradale OpenStreetMap*: OpenStreetMap (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`)
  3. **Preservazione dei CustomLayer Three.js al Cambio Layer (`setMapLayer`)**: Nel ricaricare la sorgente raster o lo stile di MapLibre, preservare i layer WebGL 3D custom (`threejs-flight-layer`) e la sorgente di elevazione Terrarium (`terrain-source`), evitando il teardown distruttivo del contesto Three.js.
  4. **Selettore Frosted Glass Uniforme nella Top-Bar 3D**: La vista `FlightReplayView` include un controllo `<select id="gm-replay-layer-select">` sincronizzato bidirezionalmente con `store.ui.mapLayer`, consentendo il passaggio immediato tra visualizzazione notturna, satellitare, topografica e stradale durante la navigazione della traccia.
  5. **Governance di Test Continua**: La suite `tests/ui/mapLibreThreeEngine.test.mjs` valida staticamente e a runtime l'assenza di URL CARTO e l'indipendenza da parametri chiave (`key=` o `token=`).

---

## 114. Persistenza delle Preferenze di Comunicazione e Confini di Sessione (Codificazione in AGENTS.md)
- **Problema**: Le preferenze di interazione e presentazione dei report (es. organizzazione in sezioni collassate `<details><summary>` con solo l'ultimo blocco di test aperto) concordate durante una conversazione decadono all'avvio di una nuova sessione di chat o a seguito del compattamento del contesto.
- **Causa Radice**: Le direttive impartite unicamente via chat risiedono nel buffer conversazionale effimero. L'avvio di una nuova chat resetta la finestra di contesto caricando unicamente il system prompt, i file di regola (`AGENTS.md`) e le memorie di progetto.
- **Pattern Vincolante**: Ogni accordo operativo o vincolo di presentazione dell'output deve essere codificato esplicitamente nel file `AGENTS.md` del repository (es. Sezione 3). L'iniezione deterministica a livello di system prompt garantisce la conservazione della direttiva attraverso tutti i turni e le future sessioni indipendenti. In particolare, il blocco aperto finale deve essere orientato all'esperienza dell'utente finale (lavori svolti e procedura di test passo-passo nell'interfaccia grafica), confinando dettagli implementativi, percorsi file e log di test nei blocchi collassati.

---

## 115. Spessore Volumetrico Traiettoria 3D (Diamond Tube) e Aderenza Altimetrica DEM nel Replay WebGL
- **Problema**: Nel Replay 3D dei voli (`FlightReplayView` e `MapLibreThreeEngine`), la traccia appariva "molto sottile" e "molto staccata dal terreno" (fluttuante nel vuoto a centinaia di metri dal rilievo orografico).
- **Causa Radice**:
  1. *Traccia Piatta 2D vista di taglio*: Un nastro planare puramente orizzontale ($\Delta y = 0$), osservato con l'inclinazione prospettica radente della telecamera MapLibre (pitch 62Â°â80Â°), collassa visivamente in una linea impercettibile priva di spessore verticale.
  2. *Dislocazione d'Innesco e Quota Eccessiva*: Il decollo di prova presentava un disallineamento trigonometrico iniziale di 350m a est della cresta, collocando il punto di riferimento sopra una gola e sollevando l'intera origine; inoltre il modello di salita allontanava il pilota dalla montagna mentre guadagnava quota, facendolo volare a 1500m sopra una valle di 250m (oltre 1200m di vuoto).
  3. *Mancata Calibrazione Altimetrica DEM*: Mancava la compensazione automatica del delta tra quota ellissoidica/barometrica GPS e altimetria del raster DEM Terrarium sul punto di decollo.
- **Pattern Vincolante**:
  1. *Tubo 3D Volumetrico Prismatico a 4 Vertici*: Sostituire il nastro piatto con un prisma romboidale tridimensionale (Top $+Y$, Right $+X/Z$, Bottom $-Y$, Left $-X/Z$) largo 20m e alto 14m. Questo garantisce uno spessore solido, bold e volumetricamente costante da qualsiasi angolazione o pitch della visuale.
  2. *Auto-Snapping Rigid-Origin al DEM*: Calcolare `terrainDelta = terrainElev - origin.alt` tramite `map.queryTerrainElevation([lon0, lat0])` e applicarlo rigidamente a `coordTransform` per ancorare millimetricamente il decollo $P_0$ alla mesh del terreno 3D.
  3. *Cinematica di Volo Aderente al Crinale*: La traiettoria simulata deve partire rigorosamente dalle coordinate esatte del decollo, veleggiare a ridosso del pendio montuoso ($50\text{--}150\text{m}$ sopra la cresta) durante la termica, e discendere in planata progressiva con efficienza 8:1 fino al contatto al suolo sull'atterraggio.

---

## 116. Compensazione della Quota del Perno Terreno DEM (map.transform.elevation) nei CustomLayer WebGL e Salvaguardie 3D
- **Problema**: Nel Replay 3D dei voli, la traccia appare disconnessa dal terreno montuoso. Avanzando verso una montagna (in salita) la traccia sembra sprofondare verso il suolo; avanzando verso fondovalle (in discesa) la traccia sembra salire e fluttuare in aria. Ruotando o zoomando a 360Â°, la traccia oscilla vistosamente. Su terreno piatto o a quota costante, il fenomeno non si verifica.
- **Causa Radice**:
  1. *Omissione di `this.elevation` in `customLayerMatrix()`*: In MapLibre GL JS v4 (`_calcMatrices()`), la matrice di proiezione interna del terreno (`modelViewProjectionMatrix`) applica una traslazione verticale `[0, 0, -this.elevation]` per posizionare il perno focale della vista alla quota del terreno al centro dello schermo (`H_center`). Tuttavia, il metodo `customLayerMatrix()` passato al `CustomLayer` restituisce `this.mercatorMatrix`, calcolata **prima** di applicare `-this.elevation`.
  2. *Disallineamento dei Sistemi di Riferimento*: PoichÃ© il secondo argomento di `render(gl, matrix)` ignora `this.elevation`, Three.js renderizza la traiettoria con il perno a livello del mare ($0\text{ m}$), mentre MapLibre renderizza le montagne con il perno alla quota reale del rilievo ($H_{\text{center}}$). Al variare della pendenza sotto il centro della vista, la prospettiva relativa tra montagna e traccia diverge.
- **Pattern Vincolante**:
  1. *Sincronizzazione della Quota del Perno*: Nel metodo `render(gl, matrix, args)` del CustomLayer, compensare obbligatoriamente l'elevazione del perno al centro:
     $$\Delta Z_{\text{render}} = (\text{alt}_{\text{effettiva}} - \text{map.transform.elevation}) \cdot \text{meterScale}$$
     oppure adottare direttamente `args.modelViewProjectionMatrix` fornito nel terzo parametro da MapLibre v4.
  2. *Prevenzione Z-Fighting a Terra*: Nei punti di decollo e atterraggio, configurare `polygonOffset: true, polygonOffsetFactor: -1.0, polygonOffsetUnits: -1.0` sui materiali Three.js della traccia e dei drop curtain per prevenire lo sfarfallio dei pixel a contatto con la superficie DEM.
  3. *Aggancio DEM Robusto al Decollo*: Non calcolare mai `terrainDelta` al frame iniziale; attendere l'evento `map.once('idle')` e validare che `queryTerrainElevation` restituisca una quota numerica strettamente positiva.
  4. *Protezione Pitch Estremo & Puntamento Orizzonte*: Se la visuale supera pitch $75^\circ$ o punta sopra l'orizzonte verso il cielo (`map.transform.elevation` non valida o $\le 0$), congelare il valore sull'ultima quota valida (*Last Known Good Elevation*).
  5. *LOD Smoothing*: Smussare le variazioni discrete di quota durante il caricamento di tile DEM ad alta risoluzione tramite filtro esponenziale (EMA, $\alpha \approx 0.2$).
  6. *Recupero del Contesto WebGL su Mobile*: Gestire `webglcontextlost` (invocando `event.preventDefault()`) e `webglcontextrestored`, ricreando renderer e scene senza crash o ricaricamento della PWA.
  7. *Zero Allocazioni nel Render Loop*: Nessuna allocazione di oggetti (`Vector3`, `Matrix4`, geometrie) a 60 FPS; preallocare buffer e aggiornare unicamente indici di disegno (`setDrawRange`) e pose matriciali.

---

## 117. Applicazione Sistematica delle Laws of UX, Pavimento Tattile a 48px e Feedback Tri-Modale di Sicurezza
- **Problema**: L'interfaccia mobile outdoor presentava diversi controlli compatti (selettori layer mini-mappa, pulsanti di espansione, filtri a chip, toggle di velocitÃ  replay, input e bottoni di cancellazione ricerca) con target di tocco compresi tra 28px e 44px o spaziatura adiacente $< 8\text{px}$, contravvenendo al pavimento tattile vincolante di $\ge 48\times 48\text{px}$ (Fitts's Law 2026 per uso all'aperto con dita fredde o guanti). Inoltre, i verdetti di volabilitÃ  su card e badge facevano affidamento su icone o colori isolati privi di testo esplicito (violazione WCAG 1.4.1 e del principio tri-modale), e persistevano emoji decorative non funzionali e termini gergali non ammessi (`Cockpit`).
- **Causa Radice**:
  1. EreditÃ  di stili con fallback storico a 44px o classi compatte a 28-36px non aggiornate alle nuove direttive.
  2. Test di governance statica focalizzati solo su un sottoinsieme ristretto di emoji (`['ð', 'ðï¸', 'â±ï¸', 'â¹ï¸', 'ð', 'â¨', 'ð¥', 'ð']`), permettendo a glifi come `âï¸`, `ð`, `âï¸`, `ð`, `â­`, `ð`, `ðºï¸` di superare i gate shift-left.
  3. Badge di sicurezza concepiti con sole icone per minimizzare lo spazio orizzontale, a discapito della chiarezza ergonomica.
- **Pattern Vincolante**:
  1. **Pavimento Tattile $\ge 48\times 48\text{px}$ Invariante (Fitts's Law)**: Tutti gli elementi interattivi touch devono garantire un'area di tocco effettiva $\ge 48\times 48\text{px}$. Per controlli visivamente compatti (es. micro-capsule mini-mappa), utilizzare pseudo-elementi `::before` con posizionamento centrato (`top: 50%; left: 50%; transform: translate(-50%, -50%); min-width: var(--gm-touch-min, 48px); min-height: var(--gm-touch-min, 48px);`) per non alterare la silhouette visiva espandendo al contempo l'area attiva di hit test.
  2. **Spaziatura Minima di 8px tra Target Adiacenti**: I pulsanti contigui (toggle viste, velocitÃ , stepper, bottoni popup) devono mantenere `gap: 8px` (o minimo 4px con confini touch non sovrapposti) per prevenire click accidentali in mobilitÃ .
  3. **Feedback Tri-Modale di Sicurezza Obbligatorio**: Qualsiasi indicazione di sicurezza o stato di volo (Volabile, Cautela, Non Volabile, Severo) deve combinare contestualmente **Colore Semantico + Icona Funzionale + Testo Esplicito** affiancato (`.gm-badge-pill`), azzerando l'ambiguitÃ  per utenti daltonici o sotto forte riverbero solare.
  4. **Zero Emoji Decorative & SobrietÃ  Terminologica**: Rimuovere categoricamente tutte le emoji decorative nei titoli e pulsanti ordinari in favore di SVG funzionali con `aria-label`; adottare denominazioni standard (es. `Pilota` anzichÃ© `Cockpit`).

---

## 118. Finestra Diurna di VolabilitÃ  (Alba-Tramonto) su Timeline Orarie e Serie Parametriche (Normativa VFR & Solar Ephemeris)
- **Problema**: Le timeline orarie (scrubber), i grafici temporali (vento, raffiche, LCL/base nube) e i parametri di volabilitÃ  mostravano un intervallo rigido e immutabile 08:00 - 20:00 (13 slot). In inverno (tramonto alle 16:40), mostrare ore serali buie (17:00-20:00) come "volabili" vÃ¬ola le regole del volo a vista VFR (che vietano il volo notturno in parapendio) e trae in inganno il pilota. In estate (alba alle 05:30), troncare le prime ore esclude finestre ottimali e calme per piloti ricreativi.
- **Causa Radice**: Assunzione semplificatoria di un range nominale fisso `[8..20]` nei loop di rendering e negli scrubber, disaccoppiato dall'effimero solare astronomico del sito e della data.
- **Pattern Vincolante**:
  1. **Modulo Canonico Headless Solar Ephemeris (`core/daylight.js`)**: Risolve la finestra solare reale secondo la gerarchia: (1) `weatherData.daily` (Open-Meteo live o sintetico), (2) `weatherData.daylight`, (3) `weatherData.meta`, (4) Calcolo astronomico NOAA standard basato su declinazione solare, equazione del tempo e coordinate geografiche, (5) Fallback nominale con guardie.
  2. **Bounding Dinamico Invariante**: Sia la timeline oraria (`renderTimelineGrid`, scrubber slider, step buttons), sia i grafici parametrici (`computeParamMetrics`, `renderSvgTrendChart`, `renderWindChart`, `renderSoundingChart`) e il briefing AI (`generateGuidoBriefing`) devono essere strettamente delimitati tra `sunriseHour` e `sunsetHour`.
  3. **CSS Grid Flessibile con CompatibilitÃ  Retroattiva**: La classe `.gm-timeline-grid-13` adotta `grid-template-columns: repeat(var(--gm-timeline-slots, 13), 1fr);`, permettendo un numero arbitrario di slot diurni (es. 9 in inverno, 15 in estate) senza rompere la delegazione eventi basata su classe nei test e nella UI.

---

## 119. Architettura di Trimming Non-Distruttivo dei Tracciati GPS (Original Points Retention & Telemetry Recalculation)
- **Problema**: Il trimming di decollo e atterraggio nei logbook di volo puÃ² corrompere permanentemente i dati GPS grezzi registrati dal GNSS, impedendo al pilota di annullare tagli accidentali o ripristinare il tracciato nativo (violazione NN/G #3 e Safe Autonomy / Reversibility). Inoltre, tagliare i punti senza ricalcolare le statistiche cinematiche, i dislivelli, i tempi, le termiche e le fasi genera discrepanze critiche tra la traccia e i record FAI.
- **Causa Radice**: Sovrascrittura distruttiva dell'array di punti GPS in memoria/storage e disaccoppiamento tra operazione di taglio e pipeline di ricalcolo telemetrico.
- **Pattern Vincolante**:
  1. **Conservazione Immutabile (`raw.originalPoints`)**: Preservare sempre l'array completo dei punti originali in `raw.originalPoints`. L'array di visualizzazione `raw.decimatedPoints` viene generato per affettamento non distruttivo (`slice(takeoffIndex, landingIndex + 1)`).
  2. **Ricalcolo Olistico della Telemetria (`recalculateFlightAfterTrim`)**: A ogni trimming, ricalcolare durata, velocitÃ  media/max, dislivello cumulato, salita/discesa max, guadagno netto dal decollo, termiche e manovre.
  3. **Ripristino Deterministico a Costo Zero (`restoreUntrimmedFlight`)**: Consentire in qualsiasi momento il ripristino istantaneo della traccia integrale a partire da `originalPoints`.

---

## 120. Ingestione Backup ParaMeteo V2/V1 con FAI IGC Incorporato (`_rawIgcText`) e Auto-Healing Tracciati
- **Problema**: I backup completi di ParaMeteo (es. `parameteo_backup_*.json`) serializzano i voli provvisti di traccia GPS memorizzando il testo FAI IGC originale sotto proprietÃ  private (`_rawIgcText`, `rawIgcText`, `rawIgc`, `igc`) all'interno dell'oggetto volo, lasciando talvolta non valorizzati gli array `trackPoints` o la collezione esterna `flightTracks`. Di conseguenza, l'importatore scartava silenziosamente la traccia (`decimatedPoints = []`), provocando: (1) messaggio "Tracciato altimetrico non disponibile" nella scheda volo, (2) omissione della sezione di trimming per tracciato insufficiente, (3) attivazione nel Replay 3D della traccia sintetica di fallback (volo simulato a Monte Cornizzolo) anzichÃ© del volo reale del pilota.
- **Causa Radice**:
  1. `parseParaMeteoBackup` e `convertParaMeteoFlight` cercavano esclusivamente array di punti (`flight.trackPoints`, `flight.track`) o l'array `flightTracks`, ignorando il testo IGC embedded in `_rawIgcText`.
  2. La strategia di merge non teneva conto dell'arricchimento retroattivo di tracce su record preesistenti privi di punti.
- **Pattern Vincolante**:
  1. **Risoluzione Esaustiva della Sorgente IGC**: In `extractEmbeddedTrack` e `convertParaMeteoFlight`, ispezionare ricorsivamente `_rawIgcText`, `rawIgcText`, `rawIgc`, `igc`, `points`, `decimatedPoints` e `trackData`.
  2. **Parsing IGC On-the-Fly**: Se i punti non sono strutturati in array ma Ã¨ presente il testo IGC ($> 30$ caratteri), invocare automaticamente `parseIgc()` per estrarre fix GNSS, derivare le quote MSL, generare la sparkline SVG e calcolare le fasi telemetriche.
  3. **Arricchimento Deterministico in Merge (`addsTrack`)**: Nel ripristino o sincronizzazione in modalitÃ  merge, verificare se il record in arrivo fornisce una traccia assente nel record locale (`addsTrack = !existingHasTrack && incomingHasTrack`). Se vero, procedere all'aggiornamento automatico senza richiedere eliminazioni manuali.
  4. **Auto-Healing Dinamico in `getFlightDetail`**: All'apertura del dettaglio volo, se `decimatedPoints` Ã¨ vuoto ma `rawIgc` Ã¨ presente nello storage, eseguire la riparazione trasparente al volo, aggiornando la cache in memoria e riallineando lo storage in background.
  5. **Feedback Esplicito su Tracce Simulate**: Nel Replay 3D, qualora non vi siano fix reali e venga impiegato il generatore topografico di fallback, applicare l'indicatore semantico esplicito `Traccia Simulata`.

---

## 121. Trimming Automatico Traccia, Safe Autonomy Anti-Oscillazione e Calibrazione Quote Barometriche Bi-Punto
- **Problema**: Richiedere all'utente di azionare manualmente cursori e selettori per eliminare la sosta a terra pre-decollo e post-atterraggio introduce attrito cognitivo non necessario (violazione Tesler's Law). D'altro canto, alloggiare gli slider di trimming direttamente nella vista principale di debriefing appesantisce lo scorrimento e confonde l'analisi del volo. Inoltre, l'errore QNH o la deriva barometrica dello strumento fa divergere le quote di decollo e atterraggio dalla realtÃ  topografica nota.
- **Causa Radice**:
  1. Assenza di una pipeline di auto-trimming in background all'atto dell'importazione o del primo caricamento della scheda volo.
  2. Rischio di oscillazione o loop di re-trimming qualora il pilota ripristini volontariamente il tracciato nativo e il sistema forzi nuovamente il taglio al caricamento successivo.
  3. Mancanza di un modello di correzione altimetrica a due punti per compensare la variazione di pressione atmosferica nel tempo durante voli prolungati.
- **Pattern Vincolante**:
  1. **Auto-Trimming Trasparente in Lettura (`autoTrimFlight`)**: All'accesso al dettaglio volo in `getFlightDetail`, se la traccia non Ã¨ trimmata e presenta stazionamento a terra, il sistema applica automaticamente il trimming e persiste lo stato in background.
  2. **Prevenzione Anti-Oscillazione (`meta.isExplicitlyUntrimmed`)**: Quando il pilota preme "Ripristina Originale", memorizzare `meta.isExplicitlyUntrimmed = true`. La pipeline di auto-trimming controlla preventivamente questo flag e non sovrascrive mai la decisione esplicita dell'utente.
  3. **Disaccoppiamento della Vista "Setup Traccia" (`TrackSetupSheet.js`)**: Spostare tutti i controlli manuali di trimming e correzione quote in una vista secondaria dedicata, raggiungibile da pulsante compatto nella top bar (`#btn-open-track-setup`) e nella bottom bar (`#btn-setup-from-detail`), mantenendo la schermata di debriefing pulita e focalizzata sui dati di volo.
  4. **Modello Altimetrico Bi-Punto (`two_point`)**: Correggere la quota a qualsiasi istante $t \in [0, T]$ interpolando linearmente la deriva tra scostamento di decollo e scostamento di atterraggio:
     $$\Delta Z(t) = \Delta Z_{\text{takeoff}} \cdot \left(1 - \frac{t}{T}\right) + \Delta Z_{\text{landing}} \cdot \frac{t}{T}$$
     preservando `raw.uncalibratedOriginalPoints` per garantire la piena reversibilitÃ .

---

## 122. Attribuzione del Numero di Volo nel Dettaglio (Flight Number Attribution), Chunking del Debriefing e Standardizzazione Lessicale 'Flight Log'
- **Problema**: L'assenza del numero progressivo del volo nella schermata di dettaglio (`FlightDetailSheet.js`) disorientava il pilota, privando la scheda del riferimento cronologico rispetto alla lista. Inoltre, la presenza disomogenea del termine colloquiale "Libretto" (es. nei pulsanti di ritorno e header) creava dissonanza con la terminologia aeronautica moderna ("Flight Log"). Infine, il debriefing didattico presentato come blocco continuo di testo non formattato provocava affaticamento visivo e violava i principi di chunking (Miller's Law).
- **Causa Radice**:
  1. Omissione del passaggio di `flightNumber` dal controller della lista (`LogbookView.js`) all'apertura del dettaglio e mancata risoluzione di fallback dallo store o dai seed.
  2. Uso promiscuo di etichette non allineate alla convenzione aeronautica internazionale.
  3. Formattazione del testo del debriefing affidata a un semplice `white-space: pre-line` anzichÃ© a componenti Gestalt strutturati.
- **Pattern Vincolante**:
  1. **Attribuzione Deterministica del Flight Number**: Risolvere `flightNumber` prioritizzando `options.flightNumber`, `bundle.meta.flightNumber`, o deducendolo dalla posizione inversa nello store (`state.flights.length - index`). Esporlo sia come pill badge `#N` nella topbar sia come blocco hero aeronautico `VOLO #N` nella card principale.
  2. **Standardizzazione Lessicale Globale ("Flight Log")**: Impiegare rigorosamente "Flight Log" in tutta l'applicazione (pulsanti "Torna al Flight Log", navigation tab, intestazioni di vista, empty states ed export summary).
  3. **Chunking Didattico (`gm-debrief-callout`)**: Segmentare il debriefing dell'Istruttore Guido per capoverso e racchiudere ogni consiglio tematico (efficienza termica, deriva vento/sottovento, margine classe vela, manovre) in card distinte `.gm-debrief-callout` provviste di bordo semantico ad alto contrasto.

---

## 123. Prevenzione del Collasso Orizzontale nella Topbar e Troncamento dei Pulsanti di Azione Mobile (Pure CSS Resilience & Responsive Text Chunking)
- **Problema**: Su schermi compatti o finestre ristrette, la topbar di `FlightDetailSheet.js` subiva una compressione orizzontale estrema: il pulsante "Flight Log" andava a capo su due righe ("Flight" / "Log") perdendo l'icona freccia, mentre il titolo del sito di decollo veniva schiacciato in una colonna di ~30px spezzandosi verticalmente in frammenti di tre lettere ("Dec" / "C..." / "2026"). Nella bottom bar, il pulsante primario "Visualizza Replay 3D" andava a capo su due righe e il terzo pulsante "Scarica Traccia IGC (FAI)" veniva spinto oltre il margine destro dello schermo risultando tagliato.
- **Causa Radice**:
  1. Assenza nel foglio di stile vanilla (`css/theme.css`) delle classi utility responsive di visibilitÃ  (`hidden`, `sm:inline`, `md:inline`, `lg:inline`, `xl:inline`, `sm:hidden`, `md:hidden`), causando la visualizzazione simultanea di tutti i testi lunghi su qualsiasi viewport.
  2. Mancanza di `white-space: nowrap; flex-shrink: 0;` su pulsanti e icone della topbar e della barra delle azioni.
  3. L'uso di `-webkit-line-clamp: 2` su `.gm-flight-detail-title-heading` senza `white-space: nowrap`, unito a un contenitore destro rigido (`flex-shrink: 0`) contenente Setup Traccia, badge classe e nome vela ("Axis Pluto 4"), che sottraeva oltre 320px di spazio orizzontale lasciando briciole al titolo.
- **Pattern Vincolante**:
  1. **Utilities di VisibilitÃ  Responsive in CSS Nativo**: Implementare esplicitamente in `css/theme.css` le classi `.hidden`, `.inline`, `.block`, `.inline-flex`, `.whitespace-nowrap` e le relative varianti `@media (min-width: ...)` (`sm:`, `md:`, `lg:`, `xl:`).
  2. **Topbar Resilience & PrioritÃ  del Titolo**:
     - Pulsante di ritorno provvisto di `white-space: nowrap; flex-shrink: 0;` e icona SVG con `flex-shrink: 0;`.
     - Intestazione del sito con `white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;` all'interno di contenitori `flex-1 min-w-0`.
     - Pulsante "Setup Traccia" compatto da 38x38px (solo icona su schermi `< 1024px`, testo visibile solo con `.hidden.lg:inline`), e nome del modello vela nascosto sotto schermi XL (`.hidden.xl:inline`).
  3. **Bottom Bar Action Chunking**:
     - Tutti i pulsanti di azione della bottom bar devono dichiarare `white-space: nowrap;` e altezza minima Fitts $\ge 48\text{px}$.
     - Adottare etichette responsive tramite due span semantici coesistenti nel DOM:
       - Primario Replay: `<span class="hidden sm:inline">Visualizza Replay 3D</span><span class="sm:hidden">Replay 3D</span>`
       - Setup: `<span class="hidden md:inline">Setup Traccia</span><span class="md:hidden">Setup</span>`
       - Download: `<span class="hidden md:inline">Scarica Traccia IGC (FAI)</span><span class="md:hidden">Scarica IGC</span>`
     - Questo garantisce ingombro $< 340\text{px}$ su smartphone, zero wrapping e completa compatibilitÃ  con le asserzioni dei test automatizzati.






---

## 124. Governance del Design System UI: Eliminazione degli Stili Inline, Token Semantici `--gm-*` e Gate Shift-Left Statico
- **Problema**: Con la crescita delle viste e l'aggiunta di nuove schermate e fogli (es. `FlightDetailSheet.js`, `SpotMapView.js`), sono comparsi stili inline ad-hoc (`style="..."`) e colori esadecimali cablati (`#dc2626`, `#f59e0b`, `#10b981`, `#64748b`, `#22c55e`, `#ef4444`). L'uso di colori cablati impedisce l'adattamento al tema chiaro (Sunlight Mode `[data-theme="light"]`) rompendo i contrasti minimi WCAG AA e generando disomogeneitÃ  tipografica e visiva. Inoltre, l'assenza di un test automatico consentiva alle sessioni di introdurre stili non conformi senza segnalazioni d'errore.
- **Causa Radice**:
  1. Assenza di una specifica dedicata al Design System in `.agents/rules/` con catalogazione delle classi primitive (`.gm-card`, `.gm-btn-*`, `.gm-badge-*`, `.gm-section-title`).
  2. Mancanza di un divieto esplicito di stili inline per proprietÃ  statiche (colori, font, margini, bordi).
  3. Mancanza di un test di governance statico (Gate 3) che ispezionasse i file `ui/views/*.js` bloccando l'inclusione di colori esadecimali cablati.
- **Pattern Vincolante**:
  1. **Specifica Design System (`ui_design_system_spec.md`)**: Regola vincolante che impone il ricorso esclusivo a `css/theme.css` e token `var(--gm-*)`. Ã tassativamente vietato l'uso di `#...` o `rgb(...)` all'interno dei file di vista JavaScript.
  2. **Classi Semantiche per Componenti e Stati**: Utilizzare sempre le classi primitive censite (`.gm-card`, `.gm-btn-primary`, `.gm-btn-secondary`, `.gm-btn-ghost`, `.gm-stepper-btn`, `.gm-badge-*`, `.gm-section-title`, `.gm-stat-grid`, `.gm-stat-box`). Per dot e indicatori variometrici o di fase volo, utilizzare classi dedicate (`.gm-vario-color-*`, `.gm-phase-dot-*`, `.gm-ind-dot-*`).
  3. **Stili Inline Riservati a Parametri Dinamici**: L'uso di `style="..."` Ã¨ consentito unicamente per grandezze numeriche calcolate a runtime (es. `width: ${pct}%`, rotazioni angolari `transform: rotate(...)`).
  4. **Gate di Governance Automatizzato (`shiftLeftGovernance.test.mjs`)**: La suite di test esegue una scansione regex su tutti i file `.js` in `ui/views/`, fallendo la build in caso di rilevamento di stringhe esadecimali in attributi `style`.

---

## 125. Architettura Topbar vs Header Card (Progressive Disclosure) e Layout Anti-Collisione nei Grafici Altimetrici
- **Problema**: Su viewport mobili compatti, il titolo della localitÃ  di decollo nella sticky topbar veniva troncato a causa della concorrenza di troppi metadati secondari nella medesima riga (sottotitolo data/durata, badge classe ala EN-B, modello vela). Inoltre, nel grafico altimetrico SVG, le etichette di quota estrema (`Max`, `Min`, `Decollo`, `Atterraggio`) collidevano con i marker delle termiche (`T1`, `T2`) e delle oscillazioni di rollio (`P`), mentre al di sotto persisteva una doppia legenda ridondante e in conflitto cromatico con una barra delle fasi fittizia.
- **Causa Radice**:
  1. Violazione della Progressive Disclosure: sovraccarico informativo nella topbar a scapito dell'orientamento primario dell'utente (localitÃ  e numero volo).
  2. Mancanza di segregazione tra quote globali di riferimento e marcatori temporali lungo la polilinea nel calcolo geometrico SVG.
  3. Sovrapposizione di tassonomie informative incoerenti (fasi teoriche vs variometro empirico reale).
- **Pattern Vincolante**:
  1. **Topbar Ultra-Leggera con Massima PrioritÃ  al Titolo**: La sticky topbar espone esclusivamente il pulsante di ritorno "Flight Log", il badge `#N`, il titolo localitÃ  decollo a massima espansione e il tasto "Setup Traccia". Metadati quali data estesa, orari decollo/atterraggio, durata, modello e classe vela risiedono stabilmente nella card principale (`gm-flight-detail-header-card`).
  2. **Grafico SVG a Bande e Badge Anti-Collisione**:
     - *Riga Superiore di Riferimento Quote (`y = 17px`)*: Riserva uno spazio dedicato esterno all'area di volo per `Decollo` (sinistra), `Max â¢ Min` (centro) e `Atterraggio` (destra).
     - *Badge Scaglionati*: Termiche e inversioni di rollio vengono ordinate per tempo e renderizzate ad altezze Y alternate con sfondi a pillola scura ad alto contrasto per azzerare qualsiasi sovrapposizione visiva.
  3. **Legenda Unica e Coerente**: Soppressione della barra di fase fittizia e della seconda legenda; adozione di un'unica legenda variometrica arricchita dinamicamente con gli indicatori di termica, sondaggio 360Â° e oscillazioni di rollio.

---

## 126. Espansione a Piena Altezza dell'SVG Altimetrico nei Contenitori Card (`.h-full` e `width/height: 100%`)
- **Problema**: Nel dettaglio volo, il grafico altimetrico occupava solo la metÃ  superiore della card contenitore (`.gm-flight-detail-alt-chart`), lasciando la metÃ  inferiore vuota e scura e comprimendo la traiettoria di volo in una banda microscopica.
- **Causa Radice**:
  1. La classe `.h-full` mancava completamente in `css/theme.css`, impedendo all'elemento `<svg class="w-full h-full">` di estendersi al 100% dell'altezza del genitore.
  2. Assenza di attributi `width="100%"` e `height="100%"` sul tag `<svg>` e assenza della regola CSS `.gm-flight-detail-alt-chart svg { width: 100%; height: 100%; display: block; }`. Su schermi mobile compatti ($\approx 370\text{px}$), il browser applicava l'aspect ratio intrinseco del viewBox ($600 \times 140$), riducendo l'altezza del disegno a soli $85\text{px}$ a fronte di un contenitore di $160\text{px}$.
  3. L'altezza complessiva del contenitore ($160\text{px}$) era insufficiente per una consultazione telemetrica aeronautica dettagliata.
- **Pattern Vincolante**:
  1. **Definizione Globale di `.h-full`**: Censire `.h-full { height: 100%; }` in `css/theme.css` e vincolare `.gm-flight-detail-alt-chart svg { width: 100%; height: 100%; display: block; }`.
  2. **Doppio Presidio Attributi / CSS**: Impostare sempre `width="100%" height="100%"` e `preserveAspectRatio="none"` sull'elemento `<svg>`.
  3. **Ingrandimento Ergonomico della Risoluzione Verticale**: Portare l'altezza del contenitore a $220\text{px}$ su mobile e $260\text{px}$ su desktop (`@media (min-width: 640px)`), con coordinate viewBox a $220\text{px}$ (`padTop = 30`, `padBottom = 22`), quintuplicando l'escursione verticale della curva altimetrica ($168\text{px}$ utili contro i $32\text{px}$ precedenti).

---

## 127. Navigazione Telemetrica Multi-Canale (Zoom, Pan, Vario & VelocitÃ  al Suolo) e HUD Cockpit Real-Time con Isolamento Gestuale
- **Problema**: La visualizzazione del solo tracciato altimetrico statico impediva al pilota di analizzare le singole fasi del volo ad alta risoluzione temporale (es. aggancio termica, transizione veloce controvento). Inoltre, mancavano la visualizzazione della componente variometrica continua in m/s e della velocitÃ  al suolo in km/h, costringendo l'utente a desumere le variazioni unicamente dalla pendenza visiva del profilo altimetrico. Infine, l'interazione touch su grafici web rischia di bloccare lo scroll verticale naturale della pagina (gesture conflict).
- **Causa Radice**:
  1. Generazione statica dell'SVG senza supporto per finestre temporali ritagliate (zoom e pan).
  2. Assenza di layer vettoriali secondari per variometro (asse di zero a centro scala) e ground speed (curva normalizzata 0-70 km/h).
  3. Assenza di un cockpit HUD digitale per l'ispezione istantanea dei parametri di volo al punto toccato o sorvolato.
  4. Mancanza di isolamento delle direzioni di tocco (`touch-action`).
- **Pattern Vincolante**:
  1. **Multi-Canale a Livelli Indipendenti**: Fornire sempre pulsanti toggle chiari (`Quota`, `Vario (m/s)`, `VelocitÃ  (km/h)`) con codifica cromatica uniforme (Ciano `#38bdf8` per Quota, Smeraldo `#10b981` per Variometro, Viola `#c084fc` per VelocitÃ ).
  2. **Zoom & Pan a Finestra Mobile con Conservazione Scala Altimetrica Globale**:
     - Ritagliare i punti visibili in base al fattore di zoom ($1.0x - 6.0x$) e al centro frazionario di pan ($0..1$).
     - Preservare i limiti estremi globali di altitudine (`minAlt`, `maxAlt`, `takeoffAlt`, `landingAlt`) per evitare salti o disorientamento visivo della scala durante il pan.
     - Filtrare e proiettare selettivamente sull'asse X visibile solo i marker di termica e inversione di rollio che intersecano la finestra attiva.
  3. **Isolamento Gestuale Mobile (`touch-action: pan-y`)**: Confinare le gesture orizzontali di trascinamento telemetrico al grafico, consentendo sempre al browser lo scorrimento verticale naturale della pagina con un singolo dito.
  4. **Cockpit Inspection HUD a Risposta Immediata (< 16ms, Doherty Threshold)**:
     - Aggiornare in tempo reale la riga di stato (Tempo, Quota MSL, Vario colorato per intensitÃ  di salita/discesa, VelocitÃ  km/h, Evento attivo).
     - Aggiornare il mirino vettoriale (`#gm-chart-cursor-group`) direttamente tramite attributi DOM senza ri-generare l'intera stringa SVG a 60 FPS durante il movimento del cursore.
  5. **Overview Pan Navigator**: Esporre una barra di scorrimento panoramica (`.gm-telemetry-navigator`) al di sotto del grafico quando lo zoom Ã¨ attivo, mostrando con una maniglia mobile la porzione di volo attualmente inquadrata e permettendo lo scrub rapido dell'intera traccia.

---

## 128. Incapsulamento Autonomo dei Modificatori Pulsanti CSS (`.gm-btn-primary`, `.gm-btn-secondary`) contro Bevel di Default del Browser
- **Problema**: Nel pannello di dettaglio volo (`FlightDetailSheet.js`) e nel pannello setup traccia (`TrackSetupSheet.js`), i pulsanti di azione inferiore (`Replay 3D`, `Setup Traccia`, `Scarica IGC (FAI)`) apparivano con bordi grigi 3D in rilievo ("outset bevel"), spigoli vivi quadrati e privi dello stile moderno (angoli arrotondati 12px, ombre morbide, sfondi semitrasparenti e feedback active con scala 0.98) tipico del resto dell'app.
- **Causa Radice**:
  1. I selettori di modifica (`.gm-btn-primary`, `.gm-btn-secondary`, `.gm-bottom-replay-btn`, `.gm-bottom-action-btn`) assumevano la presenza obbligatoria della classe base `.gm-btn` nel markup HTML per ereditare `appearance: none; border-radius: var(--gm-radius-md); font-family: inherit; cursor: pointer; border: 1px solid transparent;`.
  2. Nei template di `FlightDetailSheet.js` e `TrackSetupSheet.js`, i pulsanti erano stati inseriti con la sola classe modificatore (es. `class="gm-btn-secondary gm-bottom-action-btn"` o `class="gm-btn-primary gm-bottom-replay-btn"`), omettendo la classe base `.gm-btn`.
  3. In assenza di `appearance: none` e `border-radius`, i browser applicavano lo stile utente nativo per `<button>` (`border: 2px outset buttonborder; border-radius: 0; appearance: auto`), producendo il tipico artefatto visivo retrÃ².
- **Pattern Vincolante**:
  1. **Autonomia Resiliente dei Modificatori CSS**: In `css/theme.css`, includere sempre `appearance: none; -webkit-appearance: none; border-radius: var(--gm-radius-md, 12px); font-family: inherit; cursor: pointer; border: 1px solid transparent; box-sizing: border-box;` sia nella classe base `.gm-btn` sia direttamente nei modificatori `.gm-btn-primary, .gm-btn-secondary, .gm-btn-ghost, .gm-bottom-replay-btn, .gm-bottom-action-btn`. In questo modo, anche se la classe base viene accidentalmente omessa nel markup, il pulsante non regredisce mai al bevel di sistema.
  2. **Doppio Presidio Markup**: Assicurare che tutti i tag `<button>` dichiarino esplicitamente la classe base `.gm-btn` seguita dal modificatore (`class="gm-btn gm-btn-primary ..."` o `class="gm-btn gm-btn-secondary ..."`).
  3. **Stilizzazione Moderna Dock Bottom Bar**: La barra inferiore `.gm-flight-detail-bottom-bar` deve adottare `backdrop-filter: blur(12px)`, bordo superiore sottile ad alta fedeltÃ  `1px solid var(--gm-border)` e ombra morbida `box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.12)`, con micro-interazioni tattili `:active { transform: scale(0.98); }`.

---

## 129. Riorganizzazione Ergonomica del Grafico Telemetrico: Dock Unificata, Ticker HUD a Riga Singola e Prevenzione Sovrapposizioni Multi-Canale
- **Problema**: A seguito dell'introduzione dei layer multi-canale (variometro, velocitÃ ) e dei controlli di zoom/pan nel grafico di dettaglio volo (`FlightDetailSheet.js`), l'interfaccia soffriva di grave dispersione verticale (~130px sprecati tra due righe di comandi e un box HUD di 60px), collisione caotica tra curve ("spaghetti chart" tra quota, vario e velocitÃ  al suolo), sovrapposizione illeggibile di badge contigui (es. `T5/3P/T6`) e un'ingombrante tabella legenda a 8 righe.
- **Causa Radice**:
  1. I canali telemetrici e i controlli di zoom erano renderizzati in due container flex separati, frammentando lo spazio verticale utile per il grafico.
  2. L'HUD di ispezione era strutturato come una card statica a blocchi verticali alta 60px anzichÃ© come ticker compatto a scomparsa o riga singola fluida.
  3. Le curve di velocitÃ  e variometro condividevano l'intera altezza del canvas senza filtraggio passa-basso nÃ© partizionamento in fasce verticali dedicate.
  4. L'algoritmo di posizionamento dei badge di manovra si basava su una semplice alternanza modulo 2 (`staggerLevel % 2`), che collassava quando 3 o piÃ¹ eventi si verificavano a breve distanza temporale.
- **Pattern Vincolante**:
  1. **Dock Toolbar Monofila (`.gm-telemetry-toolbar`)**: Raggruppare sempre i bottoni di canale (`Quota`, `Vario`, `VelocitÃ `) e i comandi di zoom (`-`, `1.0x`, `+`, `Reset`) in una singola barra orizzontale a dock flex `justify-between`, con bottoni a pillola (`.gm-telemetry-pill-btn`) provvisti di dot semantico colorato.
  2. **Ticker HUD a Riga Singola (`.gm-telemetry-hud-ticker`)**: Strutturare l'HUD d'ispezione come barra monofila compatta ($\le 36\text{px}$) con `overflow-x: auto`, aggiornando istantaneamente Tempo, Quota MSL, Vario colorato dinamicamente, VelocitÃ  al suolo ed Evento attivo.
  3. **Smoothing e Partizionamento delle Bande Multi-Canale**:
     - Applicare sempre una media mobile tri-puntuale (`(v[i-1] + v[i] + v[i+1]) / 3`) per eliminare il rumore ad alta frequenza da GNSS e sensori barometrici.
     - Confinare la velocitÃ  al suolo nella fascia inferiore 38% del grafico ($padTop + 0.62 \cdot H \to padTop + H$), evitando qualsiasi intersezione con il profilo altimetrico.
     - Confinare il variometro nella fascia inferiore 58% con linea di zero tratteggiata neutra.
  4. **Algoritmo Greedy a 3 Corsie per Badge Non-Collidenti**: Utilizzare un tracker orizzontale di ingombro (`laneRightBounds = [-999, -999, -999]`) con spaziatura minima di sicurezza ($\ge 48\text{px}$) per distribuire i marker di termica e inversione sulla corsia orizzontale libera piÃ¹ bassa, azzerando le sovrapposizioni.
  5. **Legenda Compatta a Gradiente Variometrico**: Sostituire tabelle testuali estese con una barra a gradiente orizzontale continua (-5 m/s discesa forte $\to$ 0 m/s $\to$ +5 m/s salita forte) e chip semantiche discrete.

---

## 130. Rappresentazione Grafica a Istogramma delle Precipitazioni e Formattazione Decimale dei Micro-Valori Aerologici
- **Problema**: L'algoritmo di volabilitÃ  (`core/flyability.js`) declassava correttamente le ore con pioggia $> 0.5\text{ mm/h}$ a `NO FLY` e con pioggia $\ge 0.1\text{ mm/h}$ a `Cautela`, ma nei grafici multi-trend mancava una visualizzazione oraria dedicata. Inoltre, il generatore SVG arrotondava tutti i valori a numeri interi (`Math.round`), trasformando a schermo valori critici come $0.2$, $0.3$ o $0.4\text{ mm/h}$ in `0 mm/h`, con evidente incoerenza tra avviso semaforico e metrica mostrata.
- **Causa Radice**:
  1. `renderSvgTrendChart()` supportava unicamente serie a polilinea continua (`path`), inadatte a rappresentare l'intensitÃ  discreta oraria della pioggia.
  2. Assenza di rami di formattazione condizionale per grandezze a scala ridotta ($0 - 4\text{ mm/h}$) sia sulle etichette dell'asse Y sia nel tooltip dell'ora attiva.
  3. Nella scheda "Copertura Nuvolosa", la probabilitÃ  di precipitazione non era plottata nel grafico.
- **Pattern Vincolante**:
  1. **Supporto Serie a Barre in SVG Vettoriali (`type: 'bar'`)**: `renderSvgTrendChart()` deve supportare serie a istogramma generando elementi `<rect>` con larghezza proporzionale all'intervallo orario (`hRange`), `rx="1"` e opacitÃ  controllata (`var(--gm-accent-sky)`).
  2. **Preservazione dei Decimali su Scale Ridotte ($\le 5$)**: Se `maxY <= 5`, l'asse Y e i tooltip per unitÃ  frazionarie (`mm/h`, `EDR`) devono utilizzare tassativamente `toFixed(1)` anzichÃ© `Math.round()`, garantendo la visibilitÃ  immediata delle soglie di pioviggine ($0.1\text{ mm/h}$) e limite di volo ($0.5\text{ mm/h}$).
  3. **Integrazione Duale Multi-Trend e Schede**: Esporre un pannello dedicato `multi-chart-precipitation` nello stack dei grafici orari con soglie tratteggiate di allerta ($0.1$ gialla, $0.5$ rossa) e affiancare la polilinea tratteggiata della probabilitÃ  di pioggia (%) alla copertura nuvolosa (%) nella card espandibile.

---

## 131. Prevenzione Regressioni su Contratti di Test nei Refactoring UI e Identificazione Puntuale dei Target di Bonifica
- **Problema**: Durante l'audit visivo e la stesura del piano di bonifica ergonomica, la proposta di rimuovere direttamente l'azione `[data-action="delete-flight"]` dalle card del feed di volo per prevenire cancellazioni accidentali rischiava di far fallire 2 suite di test di integrazione (`logbookView.test.mjs` e `logbookFlightDetailInteraction.test.mjs`) che asseriscono la presenza e la gestione di tale attributo. Inoltre, un controllo mappa duplicato (select + toggle) segnalato dal manifest automatico Ã¨ stato inizialmente attribuito a `SpotMapView.js` anzichÃ© alla mini-mappa di `ForecastView.js`.
- **Causa Radice**:
  1. Scansione euristica aggregata dell'audit visuale non preventivamente incrociata con la base di codice dei test automatizzati (`tests/ui/`).
  2. Omonimia parziale o sovrapposizione concettuale tra controlli simili presenti in viste differenti (mini-mappa di `ForecastView.js` con `#forecast-minimap-layer-*` vs canvas di `SpotMapView.js` con `#gm-map-layer-*`).
- **Pattern Vincolante**:
  1. **Preservazione dei Contratti di Test**: Prima di modificare o rimuovere attributi `data-action` o ID semantici dalla UI, eseguire sempre un `git grep` su `tests/` per identificare le dipendenze contrattuali. Se l'azione deve essere protetta, intercettarla con pattern a 2 fasi (dialogo/modale di conferma conforme a NN/G #5) o finestra di grazia (Undo a 5 secondi), garantendo la continuitÃ  dei test.
  2. **Ispezione Puntuale del Target**: Validare sempre gli ID univoci degli elementi evidenziati dagli audit headless prima di pianificare il refactoring, distinguendo nettamente le istanze mini-mappa (`ForecastView.js`) dalle istanze mappa completa (`SpotMapView.js`).

---

## 132. Differenziazione Cromatico-Vettoriale Salita / Discesa nei Tracciati Variometrici con Zero-Crossing Esatto
- **Problema**: La curva del variometro visualizzata in overlay al profilo altimetrico veniva renderizzata come una polilinea uniforme monocromatica verde smeraldo (`#10b981`), sia per valori positivi di salita (termica o dinamica, $v > 0$) sia per valori negativi di discesa e sprofondamento ($v < 0$). Questa monotonia cromatica impediva al pilota di cogliere a colpo d'occhio le inversioni di rateo verticale e aumentava il carico cognitivo all'aperto.
- **Causa Radice**: La funzione di render vettoriale tracciava una singola polilinea SVG (`polyline points=...`) associata a uno stile globale `stroke="#10b981"` senza calcolare le partizioni di segno nÃ© i punti di attraversamento della quota zero.
- **Pattern Vincolante**:
  1. **Calcolo Geometrico dello Zero-Crossing**: Per ogni coppia di campioni consecutivi aventi segno discordante ($v_i \cdot v_{i+1} < 0$), calcolare la frazione di interpolazione lineare $t = |v_i| / (|v_i| + |v_{i+1}|)$ e inserire il vertice esatto $(x_0, y_{zero})$ sia come fine della partizione corrente sia come inizio della successiva.
  2. **Tracciati Vettoriali e Aree a Doppio Canale**:
     - **Salita ($v \ge 0$)**: Stroke verde smeraldo (`#10b981`, `.gm-vario-stroke-climb`) e riempimento semitrasparente verso l'asse zero (`rgba(16, 185, 129, 0.16)`, `.gm-vario-fill-climb`).
     - **Discesa ($v < 0$)**: Stroke rosso corallo (`#ef4444`, `.gm-vario-stroke-sink`) e riempimento semitrasparente verso l'asse zero (`rgba(239, 68, 68, 0.16)`, `.gm-vario-fill-sink`).
  3. **Asse Datum Neutro e Indicatore Bicolore**:
     - L'asse di zero deve adottare un colore neutro di riferimento (`#64748b` tratteggiato con etichetta `0 m/s` in `#94a3b8`), evitando di confondersi con la curva di salita.
     - Il dot del selettore (`.dot-vario`) e il chip di legenda devono mostrare il gradiente bicolore a 135Â° (`#10b981` 50% / `#ef4444` 50%) con microcopy esplicita `+Salita / -Discesa`.

---

## 133. Sincronizzazione Bidirezionale tra Mappa 2D Traccia e Grafico Altimetrico: Colorazione Variometrica a Segmenti Raggruppati, Evidenziazione Fasi e Cursore Real-time
- **Problema**: Nella schermata di dettaglio del volo, l'altimetria temporale e la traccia geografica al suolo erano disconnesse, impedendo al pilota di contestualizzare geograficamente dove si trovavano le termiche salite o le manovre registrate nel grafico altimetrico. Inoltre, renderizzare una polilinea Leaflet distinta per ogni singolo secondo di registrazione (migliaia di punti) provocava crolli di frame rate e lag nell'interazione touch.
- **Causa Radice**:
  1. Assenza di una mini mappa cartografica 2D sopra il profilo altimetrico per collegare quota e posizione geografica.
  2. Frammentazione eccessiva del tracciato cartografico se suddiviso punto per punto per applicare la colorazione variometrica.
  3. Mancanza di un protocollo unificato di selezione delle fasi di volo (indici di inizio/fine) in grado di aggiornare contemporaneamente il grafico SVG (rettangolo di fase) e la mappa (halo luminoso, zoom automatico e attenuazione dei segmenti restanti).
- **Pattern Vincolante**:
  1. **Raggruppamento per Fasce Variometriche Continue**: In `renderFlightTrack`, unire i punti contigui appartenenti alla stessa fascia di colore variometrico (stessa palette `sampleVarioRgb`) in macro-segmenti Leaflet (`L.polyline`), riducendo da migliaia a poche decine il numero di elementi DOM nel layer cartografico e garantendo 60 FPS stabili.
  2. **Evidenziazione Spaziale della Fase con Alone Luminoso (Halo)**: Quando l'utente seleziona una fase (termica, inversione, sondaggio) cliccando sul grafico o sulle schede analitiche:
     - Tracciare un layer halo evidenziato (`#38bdf8`, spessore 6px, opacitÃ  0.9) sulla porzione selezionata.
     - Posizionare un pin marker semantico informativo (`.gm-flight-phase-map-pin`) sul punto medio della fase.
     - Attenuare la luminositÃ  dei segmenti non selezionati (`opacity: 0.25`).
     - Eseguire `fitBounds` con margine di sicurezza centrato sulla porzione di traccia selezionata.
  3. **Sincronizzazione Mirino Cursore in Tempo Reale**: Durante l'ispezione touch/mouse del grafico altimetrico (`pointerdown`, `pointermove`), aggiornare un marker circolare a impulsi (`.gm-flight-track-cursor`) sulla traccia 2D alle coordinate esatte del punto campionato, rimuovendolo su `pointerleave` o `pointerup`.
  4. **Toggle Layer Cartografico Unificato**: Offrire un controllo compatto in-canvas per alternare tra `OpenTopoMap` e `Satellite`, sincronizzando istantaneamente `store.ui.mapLayer` per coerenza con le altre viste dell'app.



---

## 134. Attribuzione Deterministica dei Record Personali, Tracciamento del Numero di Volo e Sincronizzazione con il Dettaglio Volo
- **Problema**: Nel pannello delle statistiche di carriera, le schede dei record personali mostravano le grandezze metriche assolute ma non indicavano a quale volo appartenessero, costringendo il pilota a scorrere l'intero logbook per rintracciare il decollo. Inoltre, aprendo la schermata di dettaglio di un volo record, non vi era alcuna indicazione visuale che una metrica costituisse un primato personale.
- **Causa Radice**:
  1. I record personali venivano calcolati con aggregazioni puntuali (semplici massimi numerici) disgiunte dall'identificativo del volo e dal numero progressivo (`flightNumber`).
  2. Le card delle statistiche erano elementi di visualizzazione passivi (`div` non interattivi privi di handler di click e attributi ARIA).
  3. `FlightDetailSheet.js` non disponeva di una logica di confronto tra i parametri del volo aperto e i record storici del pilota.
- **Pattern Vincolante**:
  1. **Calcolo Deterministico nel Core Headless (`core/logbook.js`)**: `calculatePersonalRecords(flights)` deve restituire per ciascun parametro un oggetto composito `{ val, flightId, flightNumber, site, date }`, calcolando `flightNumber` a partire da `flight.flightNumber` o dall'indice cronologico inverso (`flights.length - index`).
  2. **InterattivitÃ  e AccessibilitÃ  delle Card Record**: Le card dei record devono dichiarare `.gm-stats-record-clickable`, `data-action="open-flight-detail"`, `data-flight-id`, `role="button"`, `tabindex="0"` e `aria-label` accessibile, delegando l'apertura a `LogbookView.js`.
  3. **Segnalazione Tri-Modale nel Dettaglio Volo**: In `FlightDetailSheet.js`, `checkFlightRecordFlags(meta, careerRecords)` confronta le metriche con i primati di carriera. Se il volo detiene record:
     - Nella testata viene mostrata la pill semantica `.gm-status-pill-record` ("Record Personale").
     - Nelle card telemetriche corrispondenti (Quota, Guadagno, Vario, Distanza, Durata) viene applicata la classe di evidenziazione `.gm-flight-metric-card-record` e il badge `.gm-record-badge` ("Record").

---

## 135. Rappresentazione Duale nei Grafici di Pioggia: Disaccoppiamento tra Accumulo Deterministico (mm/h) e Probabilità di Precipitazione (%) nei Modelli Alpini
- **Problema**: Nella vista Previsioni, il grafico delle precipitazioni orarie appariva piatto e privo di barre per comprensori montani alpini complessi (es. Chialamberto nelle Valli di Lanzo), dove le app generaliste (3B Meteo, IlMeteo) segnalavano pioggia o rovesci nel weekend. Inoltre, il badge semaforico nel pannello laterale mostrava "Assenti" (verde), inducendo il pilota a ritenere il grafico rotto o i dati incongrui.
- **Causa Radice**:
  1. I modelli ad alta risoluzione (ICON-D2/best_match di Open-Meteo) per orografia alpina stimavano un accumulo deterministico a terra pari a 0.0 mm/h, ma quantificavano una probabilità convettiva/sinottica di precipitazione fino al 39% (con copertura nuvolosa al 95-100%), mentre modelli globali come GFS stimavano fino a 1.7 mm.
  2. renderSvgTrendChart() vincolava tutte le serie alla stessa scala dell'asse Y. multi-chart-precipitation plottava solo i millimetri orari (type: 'bar'), generando barre ad altezza zero in assenza di accumulo millimetrico continuo.
  3. Il badge nel pannello laterale valutava solo precip > 0, ignorando precipProb e marchiando come "Assenti" (verde status-flyable) ore a concreto rischio rovesci.
- **Pattern Vincolante**:
  1. **Dual-Scale Multi-Trend Chart**: renderSvgTrendChart() supporta serie scalate su assi indipendenti (s.minY, s.maxY) e un asse secondario destro (secondaryAxis: { unit: '%', minY: 0, maxY: 100 }), con restringimento orizzontale automatico del canvas (xMax = 322) per evitare sovrapposizioni tra curve e label percentuali.
  2. **Sovrapposizione Barre di Accumulo + Polilinea di Probabilità**: Il grafico multi-chart-precipitation plotta contemporaneamente sia le barre azzurre di accumulo orario (mm/h su asse sinistro 0-3 mm/h) sia la polilinea tratteggiata azzurro chiaro con campitura semitrasparente della probabilità di precipitazione (% su asse destro 0-100%).
  3. **Badge di Stato Consapevole della Probabilità**: Anche in presenza di 0.0 mm/h di accumulo previsto a griglia, se precipProb >= 50% la card mostra allerta arancione/rossa (status-alert: XX% prob. rovesci), se precipProb >= 25% mostra cautela ambra (status-caution: XX% prob. pioggia), e se precipProb > 0% riporta la percentuale reale anziché un compiacente "Assenti".


---

## 136. Controlli Mappa Icon-Only & Mirino: Geometrie Vettoriali Dedicate (Sfera Wireframe e Vetta di Montagna) e Sfumatura Radiale Soffice Senza Bordi
- **Problema**: I pulsanti toggle per l'alternanza dei layer cartografici includevano etichette testuali ("OpenTopo", "Satellite") che appesantivano la mappa e consumavano spazio visivo prezioso, specialmente nella mini-mappa e su schermi mobili outdoor. Inoltre, i contenitori dei controlli mappa (toggle layer, trigger del menu mirino/puntamento) dotati di bordo solido, forme scatolari e sfondi bianchi opachi risultavano invasivi, distraenti o simili a placche sovrimpresse sul terreno orografico.
- **Causa Radice**:
  1. Utilizzo di pulsanti a capsula estesi con etichetta testuale affiancata all'icona, anziché un controllo icon-only puro con divulgazione del nome del layer tramite tooltip nativo e attributi semantici ARIA.
  2. Adozione di bordi solidi (`border: 1px solid ...`), sfondi opachi (`rgba(255, 255, 255, 0.92)`) e gradienti lineari pesanti che marcavano contorni geometrici rigidi sul canvas orografico.
  3. Icone generiche (disegno satellite convenzionale) meno intuitive rispetto a simboli geodetici puri.
- **Pattern Vincolante**:
  1. **Icon-Only Design su Tutti i Controlli Mappa**: Eliminare etichette testuali interne (`.gm-layer-toggle-label`). I pulsanti toggle renderizzano unicamente l'icona SVG (dimensione 20px), affidando la denominazione del layer agli attributi `aria-label="Layer mappa: [Attivo] (tocca per [Successivo])"` e `title="Passa a [Successivo]"`.
  2. **Iconografia Specialistica Dedicata**:
     - *Satellite*: Sfera wireframe 3D geometrica (cerchio perimetrale a raggio 9.5, assi ortogonali equatoriale e meridiano a piena estensione, ed ellissi longitudinali e latitudinali perfettamente raccordate a raggio 9.5 con spessore 1.8px).
     - *OpenTopo*: Vetta alpina scultorea con nevaio a doppio arco simmetrico (`M12 2.5L2.5 20.5h19L12 2.5z` e `M6.8 12.5L9.5 14.5L12 12.2L14.5 14.5L17.2 12.5`), perfettamente armonizzata nello spessore (1.8px) e nel peso visivo con la sfera wireframe.
  3. **Controlli Mappa Border-Free con Sfumatura Radiale Soffice (Zero Blur-Disc)**:
     - Applicare a tutti i controlli flottanti su mappa (`.gm-map-layer-toggle`, `.gm-mini-map-layer-toggle`, `.gm-mini-map-expand-btn`, `.gm-aim-menu-trigger`, `.gm-replay-layer-toggle`) sagome geometriche morbide (circolare $32\text{px}/36\text{px}$ o pill $36\text{px}$ di altezza con `border-radius: var(--gm-radius-full)`).
     - Rimuovere tassativamente qualsiasi bordo (`border: none !important;`), ombra dura (`box-shadow: none !important;`) e sfocatura di sfondo (`backdrop-filter: none !important;`): il backdrop blur applicato all'elemento genera infatti un disco ottico rigido dal contorno netto anziché una sfumatura graduale.
     - La sfumatura radiale deve estinguersi a zero opacità nel perimetro esterno ("completamente trasparente intorno") e concentrare il contrasto ("meno trasparente al centro") sotto l'icona:
       - *Sfondo Scuro / Satellite*: `radial-gradient(circle/ellipse at center, rgba(15, 23, 42, 0.65) 0%, rgba(15, 23, 42, 0.35) 40%, rgba(15, 23, 42, 0.08) 70%, transparent 95%)` con icona bianca (`#f8fafc`).
       - *Sfondo Chiaro / Topo*: `radial-gradient(circle/ellipse at center, rgba(255, 255, 255, 0.75) 0%, rgba(255, 255, 255, 0.40) 40%, rgba(255, 255, 255, 0.10) 70%, transparent 95%)` con icona scura (`#0f172a`).
  4. **Presidio Ergonomico (Fitts's Law)**: Mantenere l'area interattiva touch $\ge 48\times 48\text{px}$ tramite pseudo-elemento invisibile `::before` su tutti i controlli.

---

## 137. Mini-Mappa 2D Telemetrica: Sincronizzazione Cursore Invariante a Frazione Temporale/Indice, Zoom Centrato su Fase e Trim Visivo Bidirezionale
- **Problema**:
  1. Durante lo scrubbing sul grafico altimetrico fino all'estrema destra (atterraggio), il cursore di posizione sulla mappa 2D si arrestava poco oltre la metà della traccia (compressione orizzontale).
  2. Toccando una scheda di fase di volo (es. termica, sondaggio 360°, manovra dinamica), la mappa non eseguiva l'ingrandimento né la centratura sul segmento di volo relativo.
  3. L'assenza di un trimming visivo della traccia sulla fase di volo impediva al pilota di concentrarsi sulla porzione selezionata escludendo il rumore visivo del resto del volo.
- **Causa Radice**:
  1. Il grafico altimetrico e la mappa Leaflet operavano su insiemi di campioni con cardinalità differenti (es. decimazione LTTB per la mappa vs serie oraria/tempo interpolata per il grafico). Il passaggio dell'indice assoluto `index` del grafico cercava una corrispondenza `origIdx === index` o clampava sull'indice grezzo, esaurendo la corsa a metà traccia quando l'indice massimo del grafico era inferiore a quello della mappa.
  2. In `LeafletMapEngine.highlightFlightTrackRange(range)`, il metodo assumeva come primo parametro un singolo oggetto `{ startIndex, endIndex }`, mentre `FlightDetailSheet.js` invocava il metodo passando tre argomenti posizionali distinti `(startIndex, endIndex, options)`. La verifica `typeof range.startIndex !== 'number'` falliva silenziosamente, abortendo l'operazione prima del calcolo dei bounds e di `map.fitBounds`.
  3. I segmenti esterni alla fase rimanevano disegnati con opacità ordinaria, disperdendo il fuoco dell'attenzione.
- **Pattern Vincolante**:
  1. **Mappatura Cursore Proporzionale Invariante**: `setFlightTrackCursor(index, totalCount, timeSeconds)` adotta una strategia di risoluzione gerarchica a 4 livelli:
     - (a) Match su timestamp assoluto `p.timeSeconds === timeSeconds` con distanza minima.
     - (b) Match su frazione continua $\text{frac} = \frac{\text{index}}{\text{totalCount} - 1} \in [0.0, 1.0]$ proiettata su $\text{targetIdx} = \text{round}(\text{frac} \cdot (N_{\text{map}} - 1))$.
     - (c) Match diretto su `origIdx`.
     - (d) Clamping di sicurezza `[0, N_{\text{map}} - 1]`.
     Garantisce che trascinare il cursore fino al 100% dell'asse X del grafico collochi infallibilmente il marker sull'atterraggio a fine traccia.
  2. **Flessibilità di Firma per Metodi Cartografici**: Ogni metodo dell'adapter cartografico (`highlightFlightTrackRange`, `setFlightTrackCursor`) deve supportare polimorficamente sia la firma a parametri separati `(startIndex, endIndex, options)` sia la firma a oggetto singolo `({ startIndex, endIndex, ...options })`.
  3. **Trim Visivo Bidirezionale Coordinato (Mappa + Grafico)**:
     - *Mappa*: all'attivazione della fase, i segmenti non interessati vengono attenuati (`opacity: 0.15, weight: 1.5`), il segmento di fase riceve spessore rinforzato (`weight: 5`), alone luminoso ciano (`#38bdf8`, weight 7, opacity 0.6), pin testuale di ingresso (`.gm-flight-phase-map-pin`) e pin circolare di uscita (`.gm-flight-phase-exit-pin`), con `map.fitBounds(phaseBounds, { padding: [35, 35], maxZoom: 17, animate: true })`.
     - *Grafico*: la finestra di zoom e pan si restringe automaticamente all'intervallo temporale della fase, con possibilità di ripristino immediato a panoramica totale 1.0x tramite pulsante "Mostra Tutto".

---

## 138. Traccia 3D Replay WebGL: Spessore Dinamico Zoom-Adattivo Invariante a Schermo e Gradiente Variometrico FAI
- **Problema**:
  1. La traccia 3D del visualizzatore Three.js era renderizzata con un prisma a diamante fisso di 20 metri di larghezza e 14 metri di altezza. Quando la telecamera si avvicinava al parapendio (zoom 16-18 o vista cockpit), la traccia appariva gigantesca ed enorme (più del doppio dell'apertura alare del parapendio di 10.5m), ostruendo la vela, il pilota e l'orografia circostante.
  2. La traccia era colorata con un colore solido Magenta elettrico (#ff007f) anziché riflettere le variazioni di salita e discesa variometrica del volo.
  3. Le linee di caduta verticali a tenda (drop curtain) verso il terreno avevano colore rosa (#ffb3d9) discordante con la semantica aeronautica.
- **Causa Radice**:
  1. Adozione di dimensioni fisse in metri metrici orografici (20m x 14m) non parametrizzate sul fattore di scala di risoluzione del terreno (meters per pixel) di Web Mercator.
  2. Override cablato a tinta fissa del nastro e della spina dorsale senza aggancio a `sampleVarioRgb(pt.vario)`.
- **Pattern Vincolante**:
  1. **Dimensionamento Dinamico Zoom-Adattivo (`calculateRibbonDimensions`)**:
     - Calcolo puro headless in `core/flightReplayMath.js`: $\text{metersPerPixel}(Z, \phi) = \frac{156543.03392 \times \cos(\phi)}{2^Z}$.
     - Larghezza calcolata per mantenere un target visivo costante su schermo di ~3.5 pixel: $W_{\text{meters}} = \text{clamp}(1.0, 400.0, \text{metersPerPixel} \times 3.5)$.
     - Rapporto di spessore verticale controllato ($H = W \times 0.65$).
     - A zoom ravvicinato (zoom 18), la traccia si restringe elegantemente a ~1.45m di larghezza (14% dell'apertura alare), restituendo un nastro aerodinamico sottile e fedele.
     - A zoom panoramico (zoom 12), scala automaticamente a ~93m nel mondo 3D, garantendo che a schermo non collassi mai a frazioni di subpixel invisibili.
  2. **Aggiornamento In-Flight a 60 FPS senza Re-allocazione GPU**:
     - Pre-calcolo e memorizzazione dei vettori normali unitari di prua in `_ribbonNormals` (`Float32Array(n * 2)`).
     - Nel ciclo di render, se $\Delta\text{zoom} > 0.08$, aggiornamento diretto in-place dell'array di posizioni del `BufferGeometry` con `posAttr.needsUpdate = true` (<0.05ms di esecuzione, zero GC pressure).
  3. **Colorazione Cromatica Variometrica FAI Standard**:
     - Ogni vertice del prisma (4 per punto di traccia) e della linea dorsale centrale riceve i coefficienti RGB calcolati da `sampleVarioRgb(pt.vario)` (Rosso per salite forti $\ge +3.0\text{ m/s}$, Arancione per salite moderate $+1.5\dots+3.0\text{ m/s}$, Ambra per salite deboli $+0.2\dots+1.5\text{ m/s}$, Verde smeraldo per planate $-0.8\dots+0.2\text{ m/s}$, Azzurro per discese $-2.0\dots-0.8\text{ m/s}$, Indaco per discese forti $\le -2.0\text{ m/s}$).
     - Interpolazione smooth automatica di Three.js e WebGL tra vertici consecutivi (`vertexColors: true`).
  4. **Coerenza Semantica Linee di Caduta a Terreno**:
     - I segmenti verticali del drop curtain verso il DEM adottano `vertexColors: true` con i colori variometrici dei punti corrispondenti e opacità controllata (0.40), visualizzando istantaneamente sul rilievo montuoso la localizzazione orografica di termiche e discendenze.

---

## 139. Visualizzazione Precipitazioni: Disaccoppiamento di Dominio Accumulo (mm/h) vs Probabilità (%) tramite Heatmap Oraria Dedicata Stile Windy (Prevenzione Interferenza di Gestalt)
- **Problema**:
  1. Nella card compatta "Precipitazioni" (`multi-chart-precipitation`), la curva della probabilità di pioggia (0-100%) tracciata come spezzata azzurra tratteggiata (`stroke-dasharray="3,3"`) intersecava le linee orizzontali di soglia aeronautica (0.1 mm/h cautela, 0.5 mm/h NO FLY pioggia), anch'esse tratteggiate (`strokeDasharray: "4,3"`). Tale sovrapposizione generava grave interferenza di Gestalt, portando il pilota a confondere la probabilità adimensionale con i limiti quantitativi di bagnamento dell'ala.
  2. In valli alpine e con modelli meteo ad alta risoluzione (es. ICON-EU in Open-Meteo per Chialamberto a 5-6 giorni), la quantità oraria prevista può risultare pari a 0.0 mm/h (barre di altezza zero) anche in presenza di una probabilità di pioggia del 39%. Senza barre visibili e con una curva tratteggiata ambigua, il grafico appariva privo di dati o guasto.
  3. L'etichetta estesa "PRECIPITAZIONI" nel pannello laterale del trend subiva clipping contro il bordo di separazione verticale su viewport compatti per larghezza insufficiente del contenitore (`82px`).
- **Causa Radice**:
  1. Tentativo di plottare due grandezze fisiche eterogenee (accumulo continuo $0\dots N\text{ mm/h}$ su asse Y primario vs probabilità discreta $0\dots 100\%$ su asse Y secondario) sul medesimo piano cartesiano 2D ricorrendo allo stesso pattern visivo (tratteggio).
  2. Discrepanza interpretativa tra modelli meteo sintetici globali (es. GFS che stima 0.7-1.7 mm/h) e modelli regionali alpini (ICON-EU che a 5 giorni azzera l'accumulo al punto griglia pur segnalando probabilità convettiva).
- **Pattern Vincolante**:
  1. **Disaccoppiamento Rigido di Dominio**:
     - L'area di grafico cartesiano è rigorosamente riservata all'accumulo orario quantitativo in mm/h (barre SVG verticali `type: 'bar'`, `var(--gm-accent-sky)`) e alle soglie aeronautiche orizzontali di sicurezza (0.1 e 0.5 mm/h).
     - Rimosso l'asse Y secondario e la curva tratteggiata di probabilità dal canvas principale.
  2. **Striscia Oraria Heatmap Stile Windy (`heatmapRow`)**:
     - Posizionare sotto la baseline del grafico (`yMax + 5`) una striscia di celle orarie dedicate con etichetta `Prob.`.
     - Ciascuna cella riporta la percentuale esatta (`val + '%'`) e assume colorazione progressiva saturata:
       - $\ge 60\%$: Rosso emergenza (`var(--gm-status-unflyable)`).
       - $35\dots 59\%$: Ambra cautela (`var(--gm-status-caution)`).
       - $20\dots 34\%$: Ciano intenso (`var(--gm-accent-sky)`).
       - $1\dots 19\%$: Ciano tenue (`rgba(14, 165, 233, 0.28)`).
       - $0\%$: Grigio neutro attenuato (`rgba(148, 163, 184, 0.12)`).
     - La cella dell'ora attiva selezionata dallo scrubber riceve un contorno di evidenziazione (`stroke="var(--gm-accent)" stroke-width="1.6"`).
     - Il cursore orario verticale si prolunga attraverso la striscia heatmap per mantenere perfetta continuità temporale.
---

## 140. Selezione Fasi di Volo e Manovre Tramite Puntamento Diretto su Grafico Altimetrico: Risoluzione di Layering SVG e Disaccoppiamento Gesto Tap vs Dragging
- **Problema**:
  1. Facendo clic o toccando direttamente sul profilo altimetrico in corrispondenza di una termica o manovra dinamica (es. wingover, spirale, inversione di rollio, test 360°), la fase di volo non veniva selezionata; la selezione funzionava solo cliccando sulle card sottostanti al grafico.
  2. Il layer SVG dell'area sfumata sottostante la quota (`<polygon ... fill="url(#...-area)">`) intercettava tutti gli eventi di puntamento (`pointerdown`, `click`), impedendo ai gruppi grafici degli eventi sottostanti (`<g class="gm-chart-thermal-band">`, `.gm-chart-maneuver-marker`) di ricevere l'evento click.
  3. L'affidamento esclusivo a `e.target.closest('[data-phase-type]')` causava frequenti fallimenti di intercettazione quando l'utente toccava la curva della quota, una linea di griglia o lo spazio vuoto all'interno della colonna temporale della manovra.
  4. L'assenza di differenziazione tra trascinamento (pan dello zoom) e tocco discreto (selezione) generava conflitti di interazione.
- **Causa Radice**:
  1. Sovrapposizione geometrica nel DOM SVG priva di `pointer-events="none"` sul poligono dell'area di quota.
  2. Mancanza di un risolutore coordinate-based (`findPhaseAtPoint(pointIndex)`) che correla la coordinata X del puntatore (`clientX`) all'indice del trackpoint del volo, verificando l'appartenenza all'intervallo temporale/indice di tutte le manovre (termiche, inversioni, manovre dinamiche, sondaggi).
- **Pattern Vincolante**:
  1. **Disattivazione Pointer Events su Layer Decorativi**: Assegnare tassativamente `pointer-events="none"` a riempimenti d'area SVG (`polygon`), reticoli di sfondo e linee di griglia che si estendono sopra le fasce temporali.
  2. **Risoluzione di Fase Basata su Coordinate (`findPhaseAtPoint`)**:
     - Calcolare la coordinata normalizzata X del tocco sul grafico: $\text{relX} = \text{clamp}(0, 1, \frac{X - \text{rect.left}}{\text{rect.width}})$.
     - Mappare su indice del punto visibile tenendo conto della finestra attiva di zoom e pan.
     - Scansionare l'indice risultante contro i metadati di manovra (`dynamicManeuvers`, `thermals`, `thermalProbes`) con fallback robusto su matching temporale (`timeSeconds`) e tolleranza di tocco per manovre brevi ($\pm 2$ campioni).
  3. **Disaccoppiamento Rigido Gesto Tap vs Drag Pan (Laws of UX / Fitts's Law)**:
     - Durante `pointerdown`, memorizzare posizione iniziale (`startX`, `startY`) e timestamp (`pointerDownTime`).
     - Durante `pointermove`, se la distanza euclidea o orizzontale supera 6px (`Math.abs(deltaX) > 6`), marcare l'interazione come trascinamento (`hasDragged = true`) ed eseguire esclusivamente pan/scrubbing.
     - In `pointerup` (o `click`), scatenare la selezione della fase `selectPhase(matched)` solo se `!hasDragged && elapsed < 500ms`.
  4. **Feedback Visivo Reattivo all'Hover**: Al passaggio del mouse (`!isPointerDown`), se il punto corrisponde a una fase, impostare `chartContainer.style.cursor = 'pointer'` con tooltip informativo ("Tocca per selezionare [Manovra]"); su segmenti neutri di planata impostare `cursor = 'crosshair'`.
  5. **Deselezione su Spazio Neutro di Planata**: Un tocco su una porzione di planata priva di manovre mentre è attiva una fase deseleziona la fase (`clearPhaseSelection()`), ripristinando istantaneamente zoom/pan a 1.0x e centrando la mappa globale.

---

## 141. Icone Flottanti Cartografiche Bianco Assoluto su Sfumatura Radiale Nera (Uniform High-Contrast Scrim)
- **Problema**: L'adattamento cromatico dei controlli flottanti su mappa (pulsanti layer, mirino di centratura, espansione mini-mappa) in modalità topo o tema chiaro — con icone scure #0f172a su sfumatura radiale bianca rgba(255, 255, 255, 0.75) — generava scarso contrasto percepito e dissonanza visiva rispetto al layout aeronautico, specialmente in presenza di rilievi chiari, roccia, neve o curve di livello fitte.
- **Causa Radice**: La cartografia orografica all'aperto presenta variazioni estreme di luminanza locale (pendii soleggiati vs valli in ombra, neve, ortofoto). Una sfumatura chiara con icone scure perde leggibilità quando sovrapposta a sfondi misti o ad alta frequenza visiva.
- **Pattern Vincolante**:
  1. **Iconografia Bianca Pura Uniforme (`#ffffff` / `stroke="currentColor"`)**: Tutte le icone dei controlli flottanti su mappa (`.gm-map-layer-toggle`, `.gm-replay-layer-toggle`, `.gm-aim-menu-trigger`, `.gm-mini-map-layer-toggle`, `.gm-mini-map-expand-btn`) devono essere rigorosamente bianche (`color: #ffffff !important; stroke: currentColor;`), indipendentemente dal layer attivo (topo, satellite, streets) o dal tema dell'app (`[data-theme="light"]` o dark).
  2. **Sfumatura Radiale Nera Profonda a Dissolvenza Perimetrale Totale**:
     - Centro opaco al 70%: `rgba(0, 0, 0, 0.70)` a 0%
     - Decadimento continuo: `rgba(0, 0, 0, 0.40)` a 40%, `rgba(0, 0, 0, 0.10)` a 70%
     - Dissolvenza al 100% sul bordo: `transparent 95%`.
     - Zero bordi rigidi (`border: none !important`), zero ombre esterne e zero `backdrop-filter` per evitare artefatti a disco di sfocatura ritagliato.
  3. **Adattamento Geometrico della Sfumatura**: Cerchio perfetto (`circle at center`) per controlli simmetrici quadrati/tondi; ellisse orizzontale (`ellipse at center`) per controlli asimmetrici o rettangolari a pillola come il mirino con freccia (`.gm-aim-menu-trigger`).

---

## 142. Traiettoria 3D Slanciata (Anti-Inglobamento Parapendio), Basemap Satellitare Predefinita & Design Rigoroso del Grafico Scrubber Altimetrico
- **Problema**:
  1. La traccia 3D nel replay volumetrico risultava eccessivamente larga (23m-46m a zoom 12-14), inglobando completamente il parapendio (apertura alare 10.5m, imbrago 0.5m) e coprendo pilota e linee in vista ravvicinata ed inseguimento.
  2. Lo sfondo della vista 3D risultava visivamente sgradevole ("sputtanato") a causa del default su OpenTopoMap, le cui etichette e quote 2D venivano stirate e deformate sul terreno 3D DEM, e a causa dei padding residui di `#main-view` e delle barre di navigazione dell'app visibili.
  3. Nella barra superiore, il titolo e sottotitolo del volo entravano in collisione geometrica con il selettore layer e il gruppo telecamere (`Inseguimento | Pilota | Libera`), finendo renderizzati al di sotto dei controlli su viewport mobile (360-390px).
  4. Il grafico altimetrico dello scrubber (`ReplayTelemetryCanvas`) appariva disordinato e carico di rumore visivo a causa di decine di barre verticali colorate a tutta altezza (64px) che attraversavano la curva della quota come sbarre.
- **Causa Radice**:
  1. Default di `calculateRibbonDimensions` con `targetPixels = 3.5` e tetto di clamp a 400m, che dimensionava la traccia per visibilità macroscopica autostradale anziché come spina dorsale aerodinamica compatibile con le proporzioni dell'ala.
  2. Mancanza di impostazione esplicita della basemap predefinita su `'satellite'` in 3D Replay, e assenza di regole CSS `#main-view:has(.gm-flight-replay-fullscreen)` per disattivare padding e nascondere `#bottom-nav-bar` e `#desktop-nav-bar`.
  3. Etichetta estesa del pulsante back ("Flight Log", ~110px) e delle telecamere ("Inseguimento", 12 caratteri, ~105px) che saturavano la riga orizzontale su schermi $\le 390\text{px}$.
  4. Generazione degli eventi milestone (`_renderEventMarkers`) con `position: absolute; top: 0; bottom: 0; width: 3px`, tagliando il grafico cartesiano dall'alto in basso.
- **Pattern Vincolante**:
  1. **Nastro 3D Slanciato (`calculateRibbonDimensions`)**:
     - Parametri di default rigidamente controllati: `minWidthMeters = 0.35`, `maxWidthMeters = 1.2`, `targetPixels = 1.8`, `heightRatio = 0.5`.
     - In vista ravvicinata e cockpit la larghezza scende dinamicamente fino a 35cm, posizionandosi perfettamente al di sotto dell'imbrago senza mai coprire la calotta (10.5m) o il fascio funicolare.
     - Opacità del drop curtain verso il terreno DEM ridotta a 0.25 con colorazione FAI, garantendo percezione di quota senza appesantire la scena.
  2. **Basemap Satellitare Predefinita (Esri World Imagery)**:
     - `MapLibreThreeEngine` e `FlightReplayView` inizializzano per default `activeLayer = 'satellite'`. Le ortofoto aeree non contengono testi 2D deformabili dal DEM a forte inclinazione (60°-75° pitch).
     - `#main-view:has(.gm-flight-replay-fullscreen)` imposta `padding: 0; max-width: 100%; overflow: hidden;`.
     - `#app-root:has(.gm-flight-replay-fullscreen)` nasconde completamente `#bottom-nav-bar` e `#desktop-nav-bar` (`display: none !important`).
  3. **Top Bar Responsive & Anti-Collisione**:
     - Altezza dinamica: `min-height: 56px; height: calc(56px + env(safe-area-inset-top, 0px))`.
     - Su schermi $\le 640\text{px}$, il pulsante back nasconde l'etichetta testuale (`.gm-replay-back-text { display: none }`) trasformandosi in un touch target compatto 48x48px centrato sull'icona.
     - Etichette telecamera concise: "Segui", "Pilota", "Libera" (risparmio di oltre 80px orizzontali).
     - Titolo e sottotitolo con `flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis;`.
  4. **Grafico Altimetrico Scrubber Ridisegnato**:
     - Marcatori di eventi convertiti in micro-tacche sul bordo inferiore: `bottom: 0; height: 6px; width: 4px; border-radius: 2px 2px 0 0; opacity: 0.85`.
     - Griglia orizzontale di riferimento tratteggiata e tenue (a 33% e 66% della quota relativa).
     - Etichette filigrana di quota minima e massima in monospace discreto (`rgba(148, 163, 184, 0.40)`).
     - Riempimento d'area sfumato ciano trasparente (`rgba(56, 189, 248, 0.22)` a `0.01`).
     - Ago scrubber verticale sottile da 1.5px con indicatore concentrico (bullseye ciano/bianco) posizionato esattamente sulla quota istantanea.
     - Barra delle fasi superiore assottigliata a 3px con angoli arrotondati.

---

## 143. Grafico Interattivo Volo: Posizionamento Badge Fasi in Basso, Separazione Scrubber/Pan Gestuale e Fedeltà Cromatica Variometrica su Mappa
- **Problema**:
  1. I badge delle fasi di volo (`T1`, `1P`, `WO`, `Spirale`) erano posizionati nella parte superiore del grafico (`padTop + 9 + ev.yLevel * 13`), collidendo con le quote MSL e la curva altimetrica, risultando poco leggibili a causa delle dimensioni ridotte (12px altezza, font 8.5px).
  2. Con zoom attivo, qualsiasi trascinamento orizzontale muoveva la finestra di pan del grafico anziché consentire lo scrubbing immediato del cursore e la lettura istantanea delle metriche HUD.
  3. Sulla mini-mappa 2D, la selezione di una fase di termica mostrava una traccia prevalentemente azzurra/blu anziché gialla/arancione (incongruenza aeronautica: blu = discendenza/affondata).
- **Causa Radice**:
  1. Coordinate `badgeY` legate al `padTop` anziché alla base del grafico cartesiano (`height - padBottom`).
  2. Nel listener `pointermove`, la condizione `state.zoom > 1.0 && deltaX > 4` attivava il pan senza distinguere tra swipe rapido (scrubber) e pressione prolungata (pan).
  3. `LeafletMapEngine.highlightFlightTrackRange` inseriva in `phaseHighlightGroup` una polilinea continua di alone con `color: '#38bdf8'` (Sky Blue), `weight: 7` e `opacity: 0.6`, che si sovrapponeva ai segmenti sottostanti della traccia, tingendoli di blu. Inoltre `safePoints` in `FlightDetailSheet.js` ometteva `vario`, esponendo il rendering della mappa al rumore non filtrato delle quote GNSS.
- **Pattern Vincolante**:
  1. **Badge Posizionati alla Base (`bottomY = height - padBottom`)**:
     - `badgeY = bottomY - 3 - ev.yLevel * 18`, con rettangolo pill `y = badgeY - 16`, altezza `16px` e raggio `3.5px`.
     - Testo `y = badgeY - 4`, font `10.5px` monospace bold (`800`) e colori ad alto contrasto abbinati alla fase (`#fbbf24` ambra per termiche, `#fb923c` per rollio, `#e9d5ff` per manovre dinamiche).
  2. **Macchina a Stati Gestuale con Timer a 350ms**:
     - `pointerdown`: avvia un timer a 350ms. Se l'utente sposta il puntatore prima dei 350ms (`deltaX > 6px`), il timer si annulla e la gesture agisce unicamente da **SCRUBBER** continuo (aggiorna `cursorIndex`, HUD e cursore mappa, lasciando inalterato `state.pan`).
     - Se il tocco è mantenuto fermo per $\ge 350\text{ms}$, si attiva `isPanMode = true`, consentendo il trascinamento della finestra di zoom (`state.pan`).
     - Tocco breve (<350ms, movimento <6px): seleziona la fase sotto il punto o deseleziona su spazio neutro.
  3. **Fedeltà Cromatica Variometrica Assoluta su Mappa**:
     - Mai sovrapporre polilinee colorate fittizie (come aloni ciano `#38bdf8`) sopra la traccia reale.
     - Il trimming cartografico si esegue portando in primo piano i segmenti attivi (`poly.bringToFront()`) con spessore `5.5px` e `opacity: 1.0`, attenuando i restanti a `opacity: 0.15`.
     - I punti passati alla mappa devono sempre includere il `vario` filtrato con media mobile a 3 punti per riflettere fedelmente le variazioni di quota.

---

## 144. Calibrazione Spessore Minimo Visivo della Traccia 3D (Scala Proiettiva 3D vs Web Mercator 2D, Pavimento 4px)
- **Problema**: 
  1. Con clamp rigido a $1.2\text{ m}$, la traccia 3D appariva come un filo subpixel invisibile in panoramica (<0.2px).
  2. Applicando ciecamente la formula 2D di Web Mercator ($6.64\text{ m/px}$ a zoom 14), la traccia si è trasformata in un'autostrada larga $26.5\text{ m}$ che a schermo misurava $60-80\text{ pixel}$, inglobando l'intero parapendio.
- **Causa Radice**: La risoluzione Web Mercator calcola la scala ortografica per tile 2D a livello del mare. Nella scena Three.js, la telecamera prospettica 3D (pitch $62^\circ$) è puntata sull'avatar a quota orografica: a zoom 14, 1 pixel sullo schermo corrisponde a $\approx 0.13\text{ metri}$ (13 cm), non a 6.64 metri.
- **Pattern Vincolante**:
  1. **Scala Proiettiva Reale ($\text{metersPerPixel} = \frac{2129.92}{2^z}$)**: A zoom 14 la risoluzione della telecamera al target è di $0.13\text{ m/px}$.
  2. **Target 4px Reale ($0.52\text{ m}$ a zoom 14)**: Con $W = 0.52\text{ metri}$ ($52\text{ cm}$), la traccia misura esattamente 4 pixel a schermo, inserendosi armoniosamente al di sotto dell'imbrago ($60\text{ cm}$) senza competere con l'apertura alare ($13.2\text{ m}$).
  3. **Scala Dinamica Multi-Zoom**: A zoom 12 scala a $2.08\text{ m}$ (4px), a zoom 10 a $8.32\text{ m}$ (4px), con clamp $0.35\text{ m} \le W \le 25.0\text{ m}$.
  4. **Proporzione Volumetrica Prismatica (`heightRatio = 0.6`)**: Sezione a diamante $52\text{ cm} \times 31\text{ cm}$ con vertici colorati secondo la scala variometrica FAI.

---

## 145. Mini-Mappe Contestuali (Previsioni e Dettaglio Volo): Coerenza dei Controlli Flottanti e Stacking Leaflet
- **Problema**: Nella mini-mappa 2D del volo (`FlightDetailSheet.js`), il controllo di cambio layer era stato inserito nella riga di intestazione esterna (`flex items-center gap-1.5`) accanto al titolo di sezione, collidendo con la spaziatura e disallineandosi con la classe `.gm-mini-map-layer-toggle` (che ha `position: absolute`), mentre il pulsante di espansione a tutto schermo era del tutto assente rispetto alla mini-mappa delle previsioni (`ForecastView.js`).
- **Causa Radice**: Mancata applicazione del pattern `.gm-mini-map-box` per la card cartografica del volo, lasciando i controlli separati dal canvas anziché fluttuanti sovrapposti agli angoli del contenitore cartografico.
- **Pattern Vincolante**:
  1. **Parità Architetturale del Container**: Qualsiasi mini-mappa nell'applicazione deve adottare la classe `.gm-mini-map-box` e l'attributo reattivo `data-map-layer="${activeLayer}"`.
  2. **Controlli Flottanti Standardizzati**:
     - In alto a sinistra (`top: 8px; left: 8px`): `.gm-mini-map-layer-toggle` con icona dinamica del layer opposto e sfumatura radiale morbida nera.
     - In alto a destra (`top: 8px; right: 8px`): `.gm-mini-map-expand-btn` con icona a frecce diagonali opposte e apertura diretta della vista espansa (fullscreen overlay in previsioni, Replay 3D volumetrico nel logbook volo).
  3. **Stacking Context Sicuro su Leaflet (`z-index: 500`)**: Entrambi i pulsanti devono avere `z-index: 500` per galleggiare stabilmente sopra i tile Leaflet (pane 200) e le polilinee del tracciato (pane 400).
  4. **Fitts's Law Outdoor**: Target touch esteso a pavimento $\ge 48\times 48\text{px}$ tramite pseudo-elemento invisibile `::before`.




---

## 146. Visualizzazione Precipitazioni: Standard Parameteo su Probabilità (0-100%) con Curva Continua ed Eliminazione del Micro-Nastro Heatmap (Prevenzione Canvas Vuoto e Micro-Testo Illeggibile)
- **Problema**:
  1. Con accumulo a 0.0 mm/h per tutta la giornata (scenario tipico delle giornate volabili o con convezione pomeridiana), scalare l'asse Y su 0-3 mm/h generava un "canvas deserto" (80% dell'area vuota, barre ad altezza zero) e costringeva a stipare le probabilità in una striscia heatmap inferiore di appena 13px con font a 6.8px, completamente illeggibile su smartphone e sotto luce solare diretta.
  2. Il marcatore dell'ora attiva dello scrubber a 0.0 mm/h collideva direttamente sulla baseline con le linee di soglia orizzontali e il testo percentuale.
  3. Rottura dell'omogeneità visiva rispetto a tutti gli altri 6 grafici Parameteo (Vento, CAPE, Base Cumulo, ecc.) che usano curve continue spline Bézier a tutta altezza.
- **Causa Radice**:
  Scambio erroneo tra grandezza continua di rischio (la probabilità di precipitazione %, che varia continuamente e definisce la finestra di sicurezza del volo) e grandezza quantitativa episodica (l'accumulo mm/h, che è nullo nella quasi totalità delle ore volabili).
- **Pattern Vincolante**:
  1. **Asse Primario su Probabilità di Precipitazione (0 - 100%)**:
     - L'asse Y misura 0% - 100% con curva continua cubica Bézier ciano cielo (`var(--gm-accent-sky)`) e riempimento d'area sfumato (`rgba(14, 165, 233, 0.18)`), conforme allo standard Parameteo di `ui_chart_design_spec.md`.
     - Soglie aeronautiche di sicurezza a linee tratteggiate: 30% (cautela sviluppo convezione/rovesci) e 60% (critico / rovesci probabili NO FLY).
  2. **Accumulo Condizionale su Barre SVG (`hasPrecip`)**:
     - Se e solo se almeno un'ora della giornata presenta accumulo $> 0.0\text{ mm/h}$, vengono tracciate le barre verticali di accumulo quantitativo (`type: 'bar'`, scala autonoma `minY: 0`, `maxY: maxPrecip * 1.5`, opacità 0.55) collocate al di sotto della curva.
     - Se l'accumulo è 0.0 mm/h ovunque, non vengono generate barre fittizie, mantenendo il canvas pulito.
  3. **Eliminazione Radicale della Heatmap Ribbon**:
     - Nessun nastro micro-testuale con font a 6.8px sotto la baseline. L'altezza del grafico è recuperata interamente.
     - Lo scrubber orario posiziona il cursore direttamente sulla quota della curva di probabilità, azzerando le collisioni sulla linea di terra.
  4. **Display a Sinistra (Single Source of Truth)**:
     - Valore primario: percentuale di probabilità dell'ora attiva (es. `11` con unità `% prob.`).
     - Sub-badge: accumulo orario e stato semaforico esplicito (es. `0.0 mm/h · Asciutto`, `Pioviggine (0.3 mm/h)` o `NO FLY: Pioggia (1.2 mm/h)`).

---

## 147. Riconoscimento Intelligente delle Termiche: Clustering Spaziale, Tolleranza Inversioni di Virata ("Entro ed Esco") ed Estensione Salita
- **Problema**:
  1. Durante il termicamento in volo libero, i piloti invertono frequentemente il senso di rotazione (da orario CW ad antiorario CCW o viceversa) per ricentrare il nucleo di massima ascendenza o adattarsi all'orografia del costone. L'algoritmo precedente (`detectThermals`) scartava categoricamente il merge di blocchi contigui con direzione opposta (`cand.turnDir === curBlock.turnDir`), spezzando un'unica salita termica continua in frammenti artificiali distinti (es. T1 da +101m e T2 da +31m con gap di 0s e discesa di 0m nel volo reale #93).
  2. Nelle fasi alte della termica o in prossimità del costone, i piloti spesso effettuano virate alternate / a S (soaring/figure-8) con rotazione netta vicina a 0° pur mantenendo ratei di salita sostenuti (+1.5..+4 m/s). L'accumulatore classico di cerchi a senso unico si azzerava continuamente, scartando del tutto la quota guadagnata in tali manovre (es. perdita di 92m di salita tra 1913m e 2005m).
  3. L'uscita temporanea dal nucleo per ricerca (fino a 30-45s con perdita di pochi metri entro 150-250m di raggio) provocava la terminazione definitiva della termica a causa di soglie temporali ed altimetriche troppo restrittive (`gapSec <= 12`, `altDrop <= 8`) e prive di verifica di prossimità spaziale.
  4. Le tracce già presenti in IndexedDB conservavano la vecchia telemetria serializzata con `engineVersion` precedente, impedendo all'utente di beneficiare dei miglioramenti algoritmici senza dover reimportare manualmente il file IGC.
- **Causa Radice**:
  - Assunzione ingenua che una termica debba mantenere rigorosamente lo stesso senso di virata dall'ingresso all'uscita.
  - Mancanza di analisi delle manovre attive in portanza (`soaring_turn`) con rotazione combinata multi-direzionale.
  - Mancanza di verifica del centroide geografico del nucleo (`distMeters`) nella logica di clustering.
- **Pattern Vincolante**:
  1. **Rilevamento Manovre Attive in Portanza (`type: 'soaring_turn'`)**:
     - Monitorare finestre con velocità angolare attiva ($|\omega| \ge 2.5^\circ/\text{s}$), variometro positivo ($v_z \ge -0.2\text{ m/s}$), angolo complessivo accumulato $\ge 220^\circ$ e guadagno $\ge 8\text{m}$ con rateo $\ge 0.15\text{ m/s}$.
  2. **Forward Climb Extension**:
     - Estendere i candidati in avanti lungo la traccia fino al raggiungimento del picco effettivo di quota prima della transizione a planata o discendenza persistente.
  3. **Clustering Spaziale Invariante rispetto al Senso di Virata ("Entro ed Esco")**:
     - Rimuovere il vincolo di direzione identica nel merge.
     - Calcolare il centro geografico del nucleo (`computeSliceCenter`) e fondere i frammenti appartenenti alla medesima colonna termica:
       - Gap immediato: $\Delta t \le 15\text{s}$, $\Delta h \le 15\text{m}$, distanza $\le 300\text{m}$.
       - Ricerca standard: $\Delta t \le 45\text{s}$, $\Delta h \le 22\text{m}$, distanza $\le 250\text{m}$.
       - Uscita/rientro ampio: $\Delta t \le 60\text{s}$, $\Delta h \le 25\text{m}$, distanza $\le 140\text{m}$.
     - Se la termica unificata presenta sia virate CW che CCW, assegnare la direzione dominante se una supera l'altra di almeno $2\times$, oppure `'CW/CCW'` (visualizzato come `"Misto"` nella UI) se equilibrata.
  4. **Auto-Upgrade Telemetria (Engine Versioning)**:
     - Incrementare `CURRENT_TELEMETRY_ENGINE_VERSION` (es. `9`). All'apertura del dettaglio volo (`getFlightDetail` in `logbookDb.js`), se `telemetry.engineVersion < CURRENT_TELEMETRY_ENGINE_VERSION`, ri-analizzare la telemetria al volo sui punti originali o decimati e aggiornare il record in background nell'adapter.



---

## 147. Ergonomia Marker Decollo su Mappa: Settore di Esposizione Pulito Senza Freccia né Badge Numerico dei Gradi
- **Problema**: Nel marker cartografico del decollo (`generateTakeoffSectorSvg`), la presenza simultanea del cuneo ad arco a 70°, della linea con freccia azimutale e del badge rettangolare scuro con il valore in gradi (es. `170°`) provocava un sovraccarico visivo inutile (clutter), estendendosi oltre l'impronta del settore e sovrapponendosi all'ortofoto satellitare, ai nomi geografici e alla linea di planata verso l'atterraggio.
- **Causa Radice**: Ridondanza informativa: il cono a 70° comunica già in modo immediato, intuitivo e geometrico l'orientamento e l'apertura del pendio di decollo. La freccia e il badge numerico costituivano inchiostro non-dati duplicativo.
- **Pattern Vincolante**:
  1. `generateTakeoffSectorSvg` deve omettere per impostazione predefinita (`showArrow = options.showArrow === true`, `showBadge = options.showBadge === true`) sia l'asta/freccia direzionale (`prefix-line`, `prefix-arrow`) sia il badge numerico con i gradi (`prefix-badge`).
  2. Il marker cartografico standard visualizza unicamente il cuneo di lancio a 70° colorato secondo la direzione del vento (verde in asse, ambra al traverso, rosso sottovento), il perno centrale di decollo (`circle.hub` con `▲`) e la quota altimetrica in metri (`${altitude}m`), preservando la massima chiarezza outdoor della mappa sia nella vista contestuale che a schermo intero.

---

## 148. Gerarchia Visiva Card Flight Log: Anti-Troncamento Rotte, Rimozione Badge EN Ridondanti e Prevenzione Duplicazione Decollo
- **Problema**:
  1. Su viewport mobile ristretti (360px–390px), la rotta di volo (`siteName`: `Decollo -> Atterraggio`) veniva sistematicamente troncata a 13–15 caratteri con puntini di sospensione (`Decollo Ciavanis -> PeterPan ...`), oscurando completamente l'atterraggio.
  2. Il pill badge della classe velica (`EN-B` o `EN-A`) occupava ~54px nell'header della card pur essendo cognitivamente superfluo (il modello specifico della vela è già mostrato nel sub-header, i filtri di categoria sono presenti nella toolbar orizzontale e i dettagli tecnici risiedono nel full-sheet).
  3. Il toponimo di decollo veniva duplicato nella seconda riga (`2026-10-11 • Ore 16:42 • Decollo Ciavanis • Axis Pluto 4`), sprecando 100px orizzontali e forzando il troncamento artificiale del nome della vela (`truncate max-w-[140px]`).
- **Causa Radice**:
  - Sovraffollamento flexbox orizzontale a riga singola con `white-space: nowrap; text-overflow: ellipsis;`.
  - Assenza di deduzione semantica sulla ridondanza toponomastica (`siteArea` generato per qualsiasi `site !== title`, anche quando `site` è parte integrante del titolo rotta).
- **Pattern Vincolante**:
  1. **Header Card Pulito (Occam's Razor)**: Rimuovere `gm-glider-pill-badge` dal feed delle card, liberando 54px orizzontali ed eliminando il rumore cromatico su decine di card consecutive.
  2. **Anti-Troncamento a Due Righe Controllate (`line-clamp: 2`)**: Configurare `.gm-flight-site-title` con `display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.35; word-break: break-word;` e `.gm-flight-card-header` a `align-items: flex-start`. La rotta ha a disposizione fino a due righe (~480px) senza subire tagli con ellipsis.
  3. **Prevenzione Duplicazione Decollo (`isTakeoffRedundant`)**: Verificare sistematicamente se `flight.site` coincide o è contenuto in `title`/`siteName`. In caso positivo, omettere `siteArea` dalla seconda riga, lasciando la sequenza ariosa `Data • Ore HH:MM • Modello Vela`.
  4. **Rimozione del Vincolo Lunghezza Vela**: Rimuovere `max-w-[140px]` dallo span della vela, consentendo ai nomi composti di estendersi naturalmente nello spazio liberato.

---

## 149. Rendering Dinamico del Nastro 3D di Volo Fino all'Istante di Riproduzione (BufferGeometry.setDrawRange & Dynamic Avatar-Attached Leading Vertex)
- **Problema**:
  1. Nel replay 3D del volo (`FlightReplayView` / `MapLibreThreeEngine`), l'intera traiettoria volumetrica veniva renderizzata fin dal montaggio della vista ($p = 0$). Quando l'utente premeva "Play", il parapendio si muoveva lungo un nastro già completamente tracciato nel cielo, privando il pilota della sensazione realistica di "disegnare" la traccia nell'aria man mano che il volo procedeva.
  2. Ricreare o riallocare i buffer WebGL dei vertici ad ogni fotogramma di riproduzione ($60\text{ FPS}$) avrebbe provocato elevata pressione sul garbage collector, micro-stutter e thermal throttling su dispositivi mobili outdoor.
- **Causa Radice**:
  Le geometrie Three.js (`trackRibbonMesh`, `centerLineMesh`, `curtainMesh`) mantenevano il `drawRange` predefinito all'intero buffer (`count: Infinity`), senza agganciare il range di rasterizzazione WebGL alla variabile temporale `currentTimeSec` o al progresso $p \in [0.0, 1.0]$.
- **Pattern Vincolante**:
  1. **Controllo del Range di Disegno a $O(1)$ (`BufferGeometry.setDrawRange`)**:
     - Preallocare l'intero nastro volumetrico, la spina dorsale variometrica e la cortina di caduta al suolo durante `_buildTrackRibbon()` e `_buildDropCurtain()`.
     - A $p = 0$ (prima del play / decollo): impostare `geometry.setDrawRange(0, 0)`, nascondendo completamente il nastro ma mantenendo visibili l'avatar e i marker 3D di decollo e atterraggio.
     - A $0 < p < 1.0$: individuare il segmento attivo `idx` via binary search su `currentTimeSec` e impostare `trackRibbonMesh.geometry.setDrawRange(0, (idx + 1) * 24)` (24 indici per segmento quad), `centerLineMesh.geometry.setDrawRange(0, nextIdx + 1)` e `curtainMesh.geometry.setDrawRange(0, curtainDrawCount)`.
     - A $p = 1.0$ (touchdown all'atterraggio): ripristinare il range completo `(n - 1) * 24`.
  2. **Aggancio Continuo del Vertice di Testa all'Avatar (`_updateTraveledTrack`)**:
     - Poiché il velivolo si trova in una posizione interpolata continua `currentPoint` tra due campioni GPS discreti `idx` e `nextIdx`, aggiornare in-place nel `Float32BufferAttribute` i 4 vertici del nastro corrispondenti a `nextIdx` per farli coincidere con le coordinate $(x, y, z)$ e il colore FAI del parapendio (`posAttr.needsUpdate = true`).
     - Al passaggio di segmento o durante lo scrubbing a ritroso, invocare `_restoreRibbonPoint(i)` per ripristinare le coordinate e i colori precalcolati del punto precedente, prevenendo deformazioni permanenti della geometria.
  3. **Contratto Headless**:
     - [`HeadlessReplayEngine.js`](file:///ui/3d/HeadlessReplayEngine.js) espone il metodo `getTraveledPoints()`, restituendo l'array dei punti percorsi fino al progresso attivo per test automatici a 0ms in puro Node.js.



---

## 150. Invarianza Rigorosa di Spazio-Schermo a 6.0px del Nastro 3D della Traiettoria di Volo in MapLibre WebGL
- **Problema**:
  1. Nel replay 3D del volo (`MapLibreThreeEngine`), la traccia della traiettoria volumetrica oscillava tra due estremi inadatti all'uso outdoor:
     - Una "strada autostradale" spessa oltre 80px a zoom ravvicinato (cockpit o inseguimento), causata da dimensioni fisse in metri ($26.5\text{ m}$) calcolate una tantum senza aggiornamento durante lo zoom.
     - Un filo sub-pixel quasi invisibile ($0.15\text{ px}$) generato da un fattore di scala prospettico arbitrario ($0.13\text{ m/px}$ a zoom 14 anziché i reali $3.32\text{ m/px}$ di Web Mercator).
  2. L'utente ha esplicitamente richiesto: *"falla sempre larga 6px indipendentemente dal livello di zoom"*.
- **Causa Radice**:
  - In MapLibre 3D con proiezione prospettica, la scala geografica al suolo a latitudine $\phi$ e zoom $z$ è rigorosamente determinata dalla formula Web Mercator:
    $$\text{metersPerPixel}(z, \phi) = \frac{40075016.686 \cdot \cos(\phi)}{512 \cdot 2^z}$$
  - Un oggetto con spessore fisico costante in metri cambia dimensione apparente in pixel su schermo in modo inversamente proporzionale a $2^z$. Per ottenere una dimensione apparente costante in pixel (spazio-schermo invariante), la dimensione geometrica in metri deve scalare proporzionalmente alla risoluzione in metri per pixel ad ogni livello di zoom.
- **Pattern Vincolante**:
  1. **Calcolo Deterministico dello Spessore Invariante a 6px (`core/flightReplayMath.js`)**:
     - `calculateRibbonDimensions(zoom, latitude = 46.0, options = {})`:
       - `targetPixels = options.targetPixels ?? 6.0`
       - `metersPerPixel = (40075016.686 * Math.cos(latRad)) / (512 * Math.pow(2, z))`
       - `widthMeters = Math.max(0.20, Math.min(1000.0, metersPerPixel * targetPixels))`
       - `heightMeters = widthMeters * 0.6`
     - Questa formula garantisce matematicamente che $\frac{\text{widthMeters}}{\text{metersPerPixel}} \equiv 6.0\text{ px}$ su tutto l'intervallo $z \in [10, 19]$.
  2. **Aggiornamento Dinamico a 60 FPS Senza Riallocazione GPU (`ui/3d/MapLibreThreeEngine.js`)**:
     - Registrare il listener dell'evento `'zoom'` della mappa (`this.map.on('zoom', this._onMapZoom)`) per intercettare lo zoom interattivo continuo (rotella mouse, pinch to zoom mobile) e stringere il delta di controllo nel loop di rendering a $> 0.02$ di zoom per le animazioni di camera.
     - Modulare i vertici del nastro prismatico 3D in-place su `posAttr.array` sfruttando le normali unitarie precalcolate `_ribbonNormals`, senza allocare nuove geometrie né sollecitare il garbage collector.
     - Pulire il listener in `destroy()` con `this.map.off('zoom', this._onMapZoom)`.

---

## 151. Notifica Continua di Repaint WebGL (`this.map.triggerRepaint()`) nel Loop di Riproduzione 3D di MapLibre GL JS
- **Problema**:
  - Nel replay 3D del volo (`MapLibreThreeEngine`), quando l'utente avviava la riproduzione premendo "Play", la vista 3D appariva completamente immobile/congelata. L'avatar non si muoveva, la telecamera non inseguiva e il nastro della traccia percorsa non avanzava, sebbene lo scrubber 2D della timeline avanzasse regolarmente.
- **Causa Radice**:
  - MapLibre GL JS adotta un ciclo di rendering WebGL strettamente *on-demand* (dirty checking) per azzerare il consumo di batteria e GPU su dispositivi mobili. Al termine della transizione iniziale `fitBounds` (1200ms), se l'utente non interagisce con il tocco, la mappa entra in stato di riposo (*idle*).
  - Il loop interno `_runLoop()` avanzava `currentTimeSec`, interpolava il punto attivo e aggiornava le geometrie Three.js a 60 FPS in `requestAnimationFrame`, ma **non invocava `this.map.triggerRepaint()`**.
  - Poiché il repaint di MapLibre non veniva risvegliato, il metodo `render(gl, matrix)` del `CustomLayer` Three.js non veniva mai eseguito. Inoltre, in modalità telecamera `free` non veniva invocato `jumpTo()`, e in modalità `chase` i micro-delta di spostamento della fotocamera a 60 FPS venivano considerati sub-pixel e ignorati dal runtime MapLibre.
- **Pattern Vincolante**:
  1. **Risveglio Continuo ad Ogni Frame (`_runLoop`)**:
     - Invocare sistematicamente `if (this.map && typeof this.map.triggerRepaint === 'function') { this.map.triggerRepaint(); }` ad ogni iterazione di `_runLoop()` per garantire che MapLibre ridisegni il canvas WebGL e chiami `glCustomLayer.render()` a 60 FPS.
  2. **Notifica Immediata sui Cambi di Stato di Riproduzione e Vista**:
     - Chiamare `this.map.triggerRepaint()` in `play()`, `pause()`, `seek()`, `setCameraMode()` e `setElevationOffset()`.
  3. **Auto-Rewind Deterministico su Play a Fine Volo**:
     - In `play()`, se `this.progress >= 1.0`, riavvolgere automaticamente la riproduzione al decollo (`this.seek(0)`) prima di far partire il loop.
  4. **Disaccoppiamento della Telecamera dall'Avatar**:
     - `_updateCurrentFrame(pt)` deve aggiornare la telecamera `_updateCameraForFrame(pt)` in presenza di `this.map` indipendentemente dallo stato di caricamento dell'avatar `this.avatarGroup`, proteggendo l'invocazione con `typeof this.map.jumpTo === 'function'`.


---

## 152. Stato Iniziale di Panoramica Completa vs Modalità Riproduzione Dinamica nel Replay 3D (`hasPlaybackStarted`)
- **Problema**:
  - All'apertura della vista di replay 3D del volo, la traccia volumetrica non era visibile per intero ma azzerata al decollo ($p = 0$). Il pilota non poteva esaminare la panoramica completa della rotta prima di avviare la riproduzione, perdendo il colpo d'occhio sull'intero percorso di volo.
  - L'utente ha esplicitamente richiesto: *"quando apro il render 3d mostra tutta la traccia. Solo quando si fa play la traccia viene mostrata fino all'istante di riproduzione"*.
- **Causa Radice**:
  - L'inizializzazione delle geometrie Three.js e la chiamata immediata a `_updateTraveledTrack()` in `loadTrack()` impostavano il `drawRange` a $0$ poiché $p = 0$, senza distinguere tra la fase di ispezione iniziale a traccia intera (pre-riproduzione) e la modalità di traccia percorsa dinamica (riproduzione o scrubbing attivo).
- **Pattern Vincolante**:
  1. **Flag di Stato Esplicito (`this.hasPlaybackStarted`)**:
     - Inizializzato a `false` nel costruttore e reimpostato a `false` ad ogni caricamento di traccia in `loadTrack()`.
     - In `_buildTrackRibbon()` e `_buildDropCurtain()`, se `!this.hasPlaybackStarted`, impostare il `drawRange` al 100% delle geometrie (`(n - 1) * 24` per il nastro volumetrico, `n` per la spina centrale, `_totalCurtainVertices` per la cortina).
     - In `_updateTraveledTrack(currentPoint)`, aggiungere la guardia di **Caso 0**: se `!this.hasPlaybackStarted`, mantenere il `drawRange` al 100% e ritornare immediatamente.
  2. **Transizione Deterministica alla Modalità Dinamica**:
     - In `play()` e `seek()`, commutare `this.hasPlaybackStarted = true`.
     - All'invocazione di `play()`, invocare `_updateTraveledTrack()` per l'istante temporale corrente prima di avviare il loop: a $p = 0$ la traccia si azzera al decollo e cresce fluidamente frame per frame a 60 FPS dietro l'avatar in movimento.
     - Durante il seek manuale, la traccia si sincronizza immediatamente con il punto temporale selezionato.
  3. **Allineamento Motore Headless (`HeadlessReplayEngine.js`)**:
     - In `HeadlessReplayEngine`, `getTraveledPoints()` restituisce l'intero array dei punti (`[...this.trackPoints]`) se `!this.hasPlaybackStarted`, commutando al calcolo della fetta percorsa (`0..maxIdx`) solo dopo l'attivazione di `play()` o `seek()`.
---

## 153. Motore di Scala Multi-Regime della Traiettoria 3D (Dual-Regime Hermite Scaling) e Priorità Z-Buffer Anti-Occlusione dell'Avatar
- **Problema**:
  - Imponendo uno spessore a schermo rigidamente costante ($6.0\text{ px}$) per tutta la traiettoria di volo a qualsiasi livello di zoom, a zoom ravvicinato ($z = 14 \dots 18$, vista cockpit, chase o ispezione manovre/spirali in termica) la larghezza fisica del prisma 3D raggiungeva proporzioni spropositate ($19.9\text{ m}$ a $z = 14$, $10.0\text{ m}$ a $z = 15$, $5.0\text{ m}$ a $z = 16$).
  - La traccia risultava più larga dell'intera apertura alare del parapendio ($13.2\text{ m}$ per Enzo 3) e oltre 20 volte più larga dell'imbrago pod ($0.50\text{ m}$), mentre la semialtezza verticale ($6\text{ m}$ a $z=14$, $3\text{ m}$ a $z=15$) superava l'altezza del fascio funi, inghiottendo completamente pilota, funi e calotta.
  - Nelle virate a 360° in termica (raggio $15-25\text{ m}$), i segmenti precedenti della traccia formavano una muraglia opaca impenetrabile che nascondeva l'ala.
  - L'attacco della traccia all'avatar in `_updateTraveledTrack` avveniva al centro geometrico $(cp.x, cp.y, cp.z)$, penetrando nel torace del pilota, e un `polygonOffset` globale negativo sul ribbon faceva vincere alla traccia il test di profondità, disegnandola sopra l'avatar.
- **Causa Radice**:
  - Conflitto tra coordinate di schermo 2D (pixel) e coordinate mondo metriche 1:1 (metri) in proiezione prospettica Three.js.
  - Assenza di un profilo di scala multi-regime che distingua la visualizzazione macroscopica del volo (dove la traccia è il riferimento primario) dalla visualizzazione microscopica del velivolo (dove l'aereo è il protagonista e la traccia deve essere un filamento aerodinamico sottile e discreto).
- **Pattern Vincolante**:
  1. **Motore di Scala a Doppio Regime con Transizione Hermite Smoothstep (`calculateRibbonDimensions`)**:
     - *Regime Macro ($z \le 12.0$)*: Visibilità prominente costante a $\approx 5.0\text{ px}$ su schermo ($W = 66\text{m} \dots 318\text{m}$, $H \le 25\text{m}$, $h_{\text{ratio}} = 0.30$) per garantire riconoscibilità immediata della rotta e della colorazione variometrica FAI attraverso l'orografia alpina.
     - *Regime di Transizione ($12.0 < z < 17.0$)*: Raccordo continuo $C^1$ tramite smoothstep cubico ($s(t) = 3t^2 - 2t^3$) dove lo spessore a schermo cala morbidamente da $5.0\text{ px}$ a $2.0\text{ px}$. A $z = 14$ (chase view iniziale), la larghezza scende a $13.09\text{ m}$ (contenuta entro i $13.2\text{ m}$ dell'ala) e l'altezza a $3.24\text{ m}$ ($hh = 1.62\text{ m}$, sotto le funi).
     - *Regime Micro ($z \ge 17.0$)*: Nastro aerodinamico sottile e slanciato ($W = 0.20\text{m} \dots 0.83\text{m}$, $H \le 0.10\text{m}$, $hh \le 0.05\text{m}$, spessore schermo $2.0\text{ px}$). La traccia ha dimensioni inferiori o pari alla larghezza dell'imbrago pod ($0.50\text{m}$), garantendo zero occlusione dell'ala e delle funi anche all'interno di termiche strette.
  2. **Attacco al Cono di Coda dell'Imbrago & Rastrematura a Punta (Pencil-Tip Tapering)**:
     - In `_updateTraveledTrack`, il punto di aggancio di testa $nextIdx$ viene traslato all'indietro lungo il vettore di scia verso la punta posteriore affusolata dell'imbrago pod ($\text{offset} = 0.85\text{m} \cdot \text{scale}$, quota $y + 0.35\text{m} \cdot \text{scale}$).
     - Ai vertici di testa viene applicata una rastrematura conica a cuspide ($hw_{\text{head}} \le 0.04\text{m}$, $hh_{\text{head}} \le 0.02\text{m}$), facendo scaturire la traccia morbidamente da dietro il pilota senza penetrare nell'imbrago.
  3. **Gerarchia Z-Buffer e Ordinamento di Rendering (`renderOrder` & `depthWrite`)**:
     - Assegnare `renderOrder = 10`, `depthTest: true`, `depthWrite: true` e `polygonOffsetFactor: -1.0, units: -2.0` alle mesh del parapendio (`canopyMesh`, `podHarnessMesh`) in `paragliderModel.js`.
     - Assegnare `renderOrder = 1` al `trackRibbonMesh`, `renderOrder = 2` al `centerLineMesh`, e `renderOrder = 0` al `curtainMesh`, con polygon offset del ribbon ridotto a `-0.25, -1.0`.
     - In questo modo l'avatar del parapendio vince categoricamente il test di profondità, rimanendo sempre nitido, in primo piano e perfettamente visibile rispetto alla scia retrostante.

---

## 154. Disaccoppiamento Meteorologico Decollo-Atterraggio e Ingestione Multi-Punto Open-Meteo
- **Problema**:
  - Le maniche a vento vettoriali al decollo e all'atterraggio (sia nella mini-mappa che nell'overlay analitico del comprensorio) indicavano sempre la stessa identica direzione e intensità del vento, e il calcolo dei circuiti di atterraggio utilizzava il vento di decollo o un'euristica fissa.
- **Causa Radice**:
  - `ForecastViewController.fetchWeatherDataAsync` interrogava Open-Meteo unicamente per le coordinate del decollo attivo.
  - `evaluateComprensorio` forniva un unico oggetto aggregato `weatherSnapshot`.
  - Di conseguenza `takeoffWeather` e `landingWeather` puntavano alla stessa istanza dati, propagando azimut e intensità identici a entrambe le maniche a vento.
- **Pattern Vincolante**:
  1. **Supporto Coordinate Multi-Punto in `openMeteoApi.js` (`isCoordinateList`, `normalizeCoordinateList`)**:
     - Accettare array di coordinate `[{ lat, lon, elev, role }]` o mappe `{ takeoff, landing }`, normalizzando le proprietà di quota (`elevation`, `altitude`, `elev`).
     - Costruire richieste Open-Meteo con parametri separati da virgola (`latitude=lat1,lat2&longitude=lon1,lon2&elevation=elev1,elev2`), sfruttando il supporto multi-punto nativo delle API (restituzione di un array JSON di risposte).
  2. **Cache Granulare per Coordinate (`InMemoryCache`)**:
     - Nella gestione multi-punto (`fetchMultiLocationWeatherData`), ogni punto geografico deve essere memorizzato e recuperato nella cache in memoria con la propria chiave geografica deterministica `generateWeatherCacheKey(lat, lon, targetDate, model)`.
     - In questo modo i dati di un decollo o atterraggio restano riutilizzabili individualmente tra schermate diverse (Home, Forecast, SpotMap) senza creare chiavi composte duplicate.
  3. **Modellazione Fisica dello Strato Limite di Valle (`generateSyntheticWeather`)**:
     - Nei dati sintetici offline, il flag `isLanding: true` modella la fisica reale del fondo valle: riduzione del vento del $25\%$ per attrito al suolo, rotazione del vento di $+25^\circ$ per incanalamento orografico della brezza di valle, e gradiente adiabatico sulla temperatura in base al salto di quota tra decollo e atterraggio.
  4. **Contratto Dati Disaccoppiato nel Comprensorio (`evaluateComprensorio`)**:
     - Il modulo comprensorio estrae separatamente `takeoffWeather` e `landingWeather` dal payload multi-punto (o punti 0 e 1).
     - Mantiene retrocompatibilità tramite `weatherSnapshot: takeoffWeather`.
     - Le viste UI (`ForecastView.js`) e i motori cartografici aggiornano separatamente le maniche a vento e utilizzano l'autentico vento al suolo dell'atterraggio per la configurazione dei circuiti di atterraggio.

---

## 155. Doppia Manica a Vento sulla Mini-Mappa, Isolamento Prefissi SVG e Ergonomia Controlli di Zoom vs Tasto Fullscreen
- **Problema**:
  - Nella mini-mappa compatta della scheda previsioni, il pilota poteva vedere la manica a vento del decollo, ma non quella dell'atterraggio in contemporanea, perdendo il confronto immediato sulla direzione del vento nei due punti chiave del volo.
  - La mini-mappa e l'overlay a tutto schermo mancavano di controlli diretti di zoom (`+` e `-`), costringendo su desktop o schermi touch al pinch-to-zoom (che nella mini-mappa è disabilitato per non intrappolare lo scroll verticale della pagina).
  - Il pulsante di espansione fullscreen era collocato in alto a destra, collidendo con la posizione naturale dei controlli di zoom.
- **Causa Radice**:
  - `renderSpotMiniMap` istanziava unicamente la manica a vento del sub-spot primario (o solo decollo), senza posizionare contemporaneamente il marker all'atterraggio.
  - Mancanza di identificatori SVG univoci e isolati tra le due maniche a vento vettoriali nello stesso documento SVG/DOM (rischio di collisione di ID di gradienti e rotazioni).
  - Sovrapposizione spaziale nell'angolo in alto a destra tra l'azione di espansione e i controlli di zoom.
- **Pattern Vincolante**:
  1. **Doppia Manica a Vento Vettoriale Indipendente (`LeafletMapEngine.renderSpotMiniMap`)**:
     - Istanziare e tracciare due marker distinti sulla mini-mappa: `takeoffWindsockMarker` (coordinate decollo, prefisso `miniws-to-`, scala 0.45) e `landingWindsockMarker` (coordinate atterraggio, prefisso `miniws-ld-`, scala 0.45).
     - L'atterraggio deve includere sia il marker grafico `⏚` sia la manica a vento orientata in base al vento dell'atterraggio.
     - L'aggiornamento orario in-place (`updateWindsockMarker`) ruota selettivamente `#miniws-to-wrapper` e `#miniws-ld-wrapper` senza re-inizializzare la mappa Leaflet.
  2. **Isolamento dei Prefissi SVG per Marker Cartografici Multipli**:
     - Ogni marker vettoriale SVG generato dinamicamente deve utilizzare prefissi dedicati (`prefix: 'miniws-to-'`, `prefix: 'miniws-ld-'`) per `id="...-wrapper"`, `id="...-grad"`, `id="...-tail"`, evitando collisioni tra filtri, clip-path e trasformazioni CSS.
  3. **Disposizione Ergonomica e Separazione Fitts (Top-Right Zoom vs Bottom-Right Fullscreen)**:
     - Angolo in alto a destra (`top: 8px; right: 8px;`): colonna verticale dei controlli di zoom (`+` e `-`) con pulsanti da 32×32px, `radial scrim` di contrasto e pseudo-elemento `::before` esteso al pavimento Fitts $\ge 48\text{px}$.
     - Angolo in basso a destra (`bottom: 8px; right: 8px;`): pulsante fullscreen / analisi volo (`.gm-mini-map-expand-btn`), garantendo una distanza verticale $> 100\text{px}$ rispetto ai controlli di zoom per azzerare qualsiasi tocco accidentale.
  4. **Metodi Cartografici Pubblici Deterministici (`zoomIn`, `zoomOut`)**:
     - Tutti i motori cartografici (`LeafletMapEngine`, `HeadlessMockMapEngine`) devono esporre `zoomIn(delta = 1)` e `zoomOut(delta = 1)`. Nella mini-mappa Leaflet, dove i gesti di scroll e pinch sono disattivati per proteggere la navigazione della pagina, i metodi programmatici garantiscono il pieno controllo dello zoom all'utente.
---

## 156. Separazione tra Verdetto di Sicurezza e Metriche Fisiche nelle Previsioni di Comprensorio (Finestre di Volo e Imposizione Decollo)
- **Problema**:
  - In modalità Overview del comprensorio, fondere matematicamente o selezionare il "peggior valore" tra decollo e atterraggio per le metriche fisiche (es. velocità decollo con direzione atterraggio) genera dati ibridi inesistenti nella fisica atmosferica.
  - Al contempo, selezionare ciecamente il decollo senza rispettare la scelta esplicita dell'utente dal picker sovrascrive silenziosamente la volontà del pilota.
  - Inoltre, nei mock di test di componenti UI complessi, `this.containerEl` potrebbe definire solo `querySelector` ma non `querySelectorAll`, generando crash inaspettati (`TypeError: querySelectorAll is not a function`).
- **Causa Radice**:
  - Confusione concettuale tra *Verdetto di Sicurezza* (logica aeronautica a catena debole: $\min(\text{score}(T), \text{score}(L))$) e *Rappresentazione Telemetrica* (dati fisici puntuali che devono preservare quote e orografie reali).
  - Assenza di un meccanismo di segmentazione diurna in finestre operative (chunking) che racconti l'evoluzione della giornata al pilota senza obbligarlo allo scrub orario manuale.
- **Pattern Vincolante**:
  1. **Modulo Headless per Finestre di Volo (`core/flightWindows.js`)**:
     - La segmentazione della giornata in blocchi omogenei (Mattina, Ore Centrali, Pomeriggio, Sera) deve risiedere interamente nel Core headless, senza riferimenti al DOM, testabile in Node.js puro.
  2. **Doppia Modalità di Decollo (Automatico $T_{\text{best}}$ vs Imposto)**:
     - In Overview predefinita, il sistema raccomanda dinamicamente il miglior decollo ($T_{\text{best}}$) accoppiato all'atterraggio sicuro ($L_{\text{safe}}$).
     - Se l'utente impone un decollo via `forcedTakeoffId`, il sistema valuta rigidamente quel decollo. Se in alcune finestre quel decollo è critico, segna la severità e produce un avviso consultivo se un altro decollo del comprensorio è favorevole.
  3. **Interazione 1-Tap & Guardie di Selezione DOM**:
     - Le card delle finestre di volo devono sincronizzare con 1-tap lo scrubber orario inferiore (`data-action="select-window" data-hour="..."`).
     - Proteggere sempre l'accesso ai metodi DOM con guardie funzionali: `if (this.containerEl && typeof this.containerEl.querySelectorAll === 'function')`.


---

## 157. Disaccoppiamento Oro-Meteorologico delle Maniche a Vento tra Decollo e Atterraggio e Segregazione Visiva delle Finestre di Volo (Esclusiva Overview)
- **Problema**:
  - Sulla mini-mappa cartografica e nell'overlay delle procedure di volo, le maniche a vento del decollo e dell'atterraggio mostravano talvolta identica direzione e velocità.
  - Nei modelli numerici di previsione (risoluzione 10km), decolli e atterraggi separati da pochi chilometri appartengono alla stessa maglia orografica e ricevono vettori identici.
  - Se il payload meteo proveniente da cache mono-punto era privo di `landingWeather`, il fallback applicava i dati del decollo all'atterraggio.
  - Inoltre, la sezione "Evoluzione Giornaliera" (Finestre di Volo) veniva mostrata anche quando l'utente selezionava un decollo o atterraggio specifico, generando rumore visivo rispetto ai dati puntuali dello spot.
- **Causa Radice**:
  - Mancanza di correzione orografica della brezza di valle per differenze angolari minime ($\le 5^\circ$) e fallback conservativo uniforme in `core/comprensorio.js`.
  - Cache meteo di `ForecastView` che considerava valido un record presente anche se privo di `landingWeather`, omettendo la fetch multi-punto.
  - Render incondizionato del contenitore delle finestre di volo indipendentemente da `this.selectedSubSpot`.
- **Pattern Vincolante**:
  1. **Disaccoppiamento Oro-Meteorologico e Brezza di Valle (`core/comprensorio.js`)**:
     - In `evaluateComprensorio`, se `landingWeatherSource` è assente o se la deviazione angolare tra decollo e atterraggio è $\le 5^\circ$ o $\ge 355^\circ$, applicare sempre la rotazione orografica della brezza di valle ($+25^\circ$) e l'attrito al suolo (velocità $75\%$, raffiche $80\%$).
  2. **Idratazione e Validazione Cache Multi-Punto (`ForecastView.js`)**:
     - Il metodo `ensureLandingWeather` garantisce la presenza dei dati d'atterraggio in qualsiasi payload meteo prima del rendering.
     - `fetchWeatherDataAsync` invalida e rinfresca la cache se il record memorizzato è privo di `landingWeather`.
  3. **Segregazione Finestre di Volo all'Overview (`ForecastView.js`)**:
     - Visualizzare `#forecast-flight-windows-container` e richiamare `renderFlightWindows` esclusivamente se `this.selectedSubSpot === 'overview'`.
     - Se in Overview l'utente impone un decollo (`activeTakeoffId` specifico), mantenere la vista delle finestre esponendo il badge distintivo `Imposto: <nome decollo>`.

---

## 158. Audit Visivo Multi-Modale & Bonifica Ergonomica HMI: Risoluzione Collisione Etichette SVG Doppio Asse, Touch Floor via Pseudo-Elementi e Full-Length CDP Viewports
- **Problema**:
  1. Nei grafici SVG a doppio asse Y (es. `LogbookStatsView`, ore di volo a istogramma e numero voli a polilinea sovrapposti), quando un mese presentava valori proporzionalmente simili (es. 0.8h e 1 volo), le etichette di testo venivano disegnate alle stesse identiche coordinate (X, Y), causando una sovrapposizione illeggibile.
  2. Gli screenshot di audit CDP iniziali venivano troncati alla parte alta della schermata (844px), nascondendo lo stato dei controlli espansi (menu tema, selettore 14 giorni, grafici aerologici aperti) e degli elementi a fondo pagina.
  3. Controlli compatti (pillole telemetriche, zoom dock, banner dismiss) presentavano altezze fisiche inferiori a 40px, non conformi al pavimento tattile outdoor (Fitts's Law $\ge 48\text{px}$).
  4. L'HUD di ispezione telemetrica su schermi mobile 390px subiva troncamento orizzontale sull'ultimo elemento.
  5. Acronimi aeronautici sintetici nel visualizzatore 3D (`D#1`, `Max Q`, `T#1`) generavano confusione per piloti principianti (violazione Novice Pilot Spec).
- **Causa Radice**:
  1. Posizionamento cieco `y - 5` sia per la polilinea che per l'istogramma senza pre-calcolo delle collisioni verticali.
  2. Esecuzione di `Page.captureScreenshot` senza dimensionamento dinamico del viewport basato su `scrollHeight` del contenitore attivo.
  3. Assenza di pseudo-elementi `::before` con dimensioni minime 48x48px per estendere il touch target senza alterare la silhouette compatta.
  4. Spaziature e font-size fissi senza media query mobile `<= 480px` sull'HUD telemetrico.
  5. Denominazioni ereditate da logiche interne di decodifica IGC non tradotte in etichette fenomenologiche esplicite.
- **Pattern Vincolante**:
  1. **Pre-calcolo e Inversione Deterministica delle Etichette nei Grafici SVG**:
     - Pre-calcolare le coordinate $(x, y)$ di entrambi i canali nello stesso ciclo. Se $|y_{\text{bar}} - y_{\text{line}}| < 16\text{px}$, posizionare l'etichetta del marker più in alto sopra il proprio elemento ($y - 6$) e l'etichetta del marker più in basso sotto il proprio elemento ($y + 11$). Questo garantisce almeno 9px di separazione netta tra i testi.
  2. **Touch Target Extension via Pseudo-Elementi**:
     - Utilizzare `.gm-telemetry-btn::before`, `.gm-telemetry-zoom-btn::before`, `.gm-theme-menu-trigger::before` con `position: absolute; min-width: 48px; min-height: 48px; top: 50%; left: 50%; transform: translate(-50%, -50%)`. L'area tattile rispetta Fitts's Law outdoor a costo zero di ingombro visivo.
  3. **Full-Length Viewport Emulation negli Audit Visivi CDP**:
     - Negli script di test visivo automatizzato (`run-full-audit-capture.mjs`), calcolare `Math.max(document.body.scrollHeight, activeScrollContainer.scrollHeight)` e impostare `Emulation.setDeviceMetricsOverride({ height: fullHeight })` prima dello scatto.
  4. **Lessico Esplicito Pilota Principiante (Zero Acronimi Jargon)**:
     - Sostituire categoricamente sigle come `D#`, `Max Q`, `T#` con `Dinamica [N]`, `Quota Max`, `Termica [N]` sia nel Replay 3D che nei badge telemetrici.

---

## 159. Vincolo di Nomenclatura UI: Bando del Nome 'Guido' da Etichette, Header e Persona di Briefing
- **Problema**: L'interfaccia utente esponeva in modo pervasivo il nome 'Guido' come persona del briefing meteorologico ('Briefing di Volo (Guido)', 'Briefing Sicurezza Guido', 'Guido: "Oggi a..."') e nei tag didattici di sicurezza ('Istruttore Guido'), generando attribuzioni fittizie non richieste e confusione rispetto alle figure storiche reali del volo libero.
- **Causa Radice**: Invenzione acritica di una persona/mascotte nei primi prototipi di briefing meteorologico e debriefing del volo, propagatasi nei template HTML e nelle stringhe dei controller senza vincolo di sobrietà e anti-sycophancy.
- **Pattern Vincolante**:
  1. **Divieto Assoluto di 'Guido' nella UI Ordinaria**: Il nome 'Guido' non deve mai comparire nei testi visibili dell'interfaccia utente (briefing card, debriefing del volo, intestazioni accessibili, badge o sintesi generate).
  2. **Eccezione Unica (Citazione Bibliografica Esplicita)**: L'unico contesto in cui è consentito menzionare Guido Teppa è la citazione bibliografica o didattica esplicita del suo manuale ufficiale (*Parapendio*, Guido Teppa, Mulatero Editore).
  3. **Lessico Standard Sovraordinato**: Utilizzare esclusivamente denominazioni neutre e conformi agli standard aeronautici: 'Briefing di Volo', 'Briefing di Sicurezza', 'Istruttore' / 'Istruttore FIVL', 'Debriefing Didattico di Sicurezza'.
  4. **Governance Automatizzata nei Test**: Il test suite `tests/ui/uiIntegrityAudit.test.mjs` presidia l'assenza permanente di 'Guido' dai template e dalle stringhe UI.

---

## 160. Architettura Previsioni a Due Livelli: Macro Panoramica di Comprensorio vs Micro Aerologia Disaccoppiata di Spot (Opzione A)
- **Problema**: In `ForecastView`, la presenza contemporanea in vista Panoramica (Overview) di oltre 7 schede accordion parametriche, grafici multi-trend e 4 card di evoluzione giornaliera generava un forte sovraccarico cognitivo e oltre 2.500px di scroll verticale ridondante. Inoltre, selezionando un decollo o un atterraggio dal selettore, le schede mostravano dati anemometrici confusi o identici (l'atterraggio a 260m leggeva il vento a 1000m di quota del decollo, e il decollo includeva grafici di brezza e cono di planata spuri).
- **Causa Radice**:
  1. `ForecastView.computeParamMetrics` estraeva `hourlyData` unicamente da `weatherData.hourly` (stazione in quota del decollo), ignorando la serie temporale al suolo `landingWeather`.
  2. `renderSpecificSpotMetrics` utilizzava `evalData.weatherSnapshot` per entrambi i punti senza leggere `evalData.landingWeather`.
  3. L'HTML della vista renderizzava `.gm-forecast-mode-bar` e `#forecast-params-container` in modo incondizionato sia in Overview che nei singoli sub-spot.
- **Pattern Vincolante**:
  1. **Macro Overview Pulita (Zero Clutter)**: Quando `selectedSubSpot === 'overview'`, renderizzare esclusivamente la Summary Card ($T_{\text{best}} + L_{\text{safe}}$ con dislivello, efficienza e mini-mappa con maniche a vento disaccoppiate), l'Evoluzione Giornaliera (4 finestre di volo 1-tap), il Briefing di Volo e lo Scrubber orario inferiore. Nascondere completamente le schede parametriche e la barra di modo.
  2. **Micro Aerologia Decollo (`isTakeoff`)**: Mostrare la scheda specifica del decollo, il toggle `Aerologia Decollo`, e le 6 schede/grafici analitici del decollo: Vento con allineamento pendio, Raffiche in quota, Base cumulo LCL, Instabilità CAPE, Turbolenza EDR, Copertura/Pioggia. Zero schede atterraggio o brezza di valle spurie.
  3. **Micro Aerologia Atterraggio (`isLanding`)**: Mostrare la scheda specifica dell'atterraggio, il toggle `Aerologia Atterraggio`, e le 5 schede/grafici analitici dell'atterraggio: Brezza di Valle (da `landingWeather`), Raffiche al suolo, Cono di planata & Rientro, Copertura nuvolosa, Temperatura e Aria al suolo. Zero schede o grafici di decollo spuri.
  4. **Aggiornamento In-Place Difensivo**: In `updateHourlyInPlace`, verificare `selectedSubSpot`: se `'overview'`, mantenere il contenitore parametri nascosto (`display: none`); altrimenti rigenerare schede o grafici contestuali con guardie difensive (`if (paramsContainer.style)`).

---

## 161. Puntamento Dinamico e Zoom Automatico della Mini-Mappa sullo Spot Selezionato
- **Problema**: Quando il pilota selezionava un decollo o un atterraggio specifico in `ForecastView`, la mini-mappa manteneva incondizionatamente un `fitBounds` macroscopico sull'intero comprensorio con zoom modesto ($\le 14$), rendendo difficile valutare i dettagli del pendio di decollo o dell'atterraggio. Inoltre, il tocco sui marker della mini-mappa reimpostava forzatamente la modalità 'overview'.
- **Causa Radice**: `renderSpotMiniMap` in `mapEngineAdapter.js` non distingueva la presenza di `isTakeoffSelected` o `isLandingSelected` nel calcolo finale dell'inquadratura, invocando sempre `fitBounds` sul binomio complessivo se entrambi i punti erano definiti.
- **Pattern Vincolante**:
  1. **Zoom Mirato su Sub-Spot Selezionato (`setView(..., 15.5)`)**: Se `isTakeoffSelected` o `isLandingSelected` è attivo, `LeafletMapEngine.prototype.renderSpotMiniMap` centra e zooma a `15.5` sulle coordinate dello spot selezionato (`tCoord` o `lCoord`), garantendo una vista ravvicinata nitida del cono di lancio, della manica a vento e dell'orografia.
  2. **Panoramica in Overview (`fitBounds`)**: Solo quando `selectedSubSpot === 'overview'` (nessun sub-spot selezionato), la mini-mappa esegue `fitBounds` con padding di sicurezza per includere entrambi i punti.
  3. **Headless Engine Symmetry**: `HeadlessMockMapEngine` riflette la medesima logica calcolando `center`, `zoom` (15.5 vs 13.5), `focusedSpot` e flag `isSubSpotFocused`.
  4. **Reattività al Tocco sui Marker (`onSelectSubSpot`)**: Toccando il marker di decollo o atterraggio sulla mini-mappa, `ForecastView` imposta `this.selectedSubSpot = subSpotId`, commutando l'aerologia e zoomando istantaneamente sul punto selezionato.

---

## 162. Ricostruzione Deterministica della Traccia e Auto-Heal Telemetrico nei Voli da Backup (Caso Volo #50)
- **Problema**: I voli storici importati da backup ParaMeteo (es. Volo #50 `fl_excel_1787747985586_10`) presentavano tutte le statistiche di sintesi (quota max 2037m, guadagno +260m, vario +2.4 m/s, 3 termiche, durata 36 min), ma la sezione "MAPPA 2D TRACCIA" restava un rettangolo nero vuoto e il "PROFILO ALTIMETRICO" mostrava *"Tracciato altimetrico non disponibile"*, impedendo l'accesso al Replay 3D e al download IGC.
- **Causa Radice**:
  1. Le routine di esportazione del software legacy omettevano gli array di punti GPS grezzi dalla collezione `database.flightTracks`, memorizzando solo metadati di volo, coordinate estreme, termiche e timeline delle fasi.
  2. `parameteoImporter.js` impostava `decimatedPoints = []` e `rawIgc = null` in assenza di punti grezzi, non sfruttando i dati telemetrici ricchi già presenti.
  3. In `FlightDetailSheet.js`, la riga `if (!Array.isArray(points) || points.length < 2) return;` abortiva prematuramente `attachInteractiveFlightChart`, impedendo l'inizializzazione del motore Leaflet (`createMapEngine`) e lasciando il canvas disconnesso.
  4. In `logbookDb.js`, la routine di auto-heal in `getFlightDetail` scattava solo se `rawIgc` era già presente come testo stringa.
- **Pattern Vincolante**:
  1. **Motore Headless di Ricostruzione Traccia (`core/flightTrackReconstruction.js`)**: Modulo puro Node.js privo di DOM che sintetizza traiettorie 3D realistiche e deterministiche interpolando decollo, atterraggio, quote min/max, punti di massimo variometro, spirali di salita per ciascuna termica (raggio, centri geodetici, numero di giri) e segmenti della timeline, generando sia punti campionati sia file IGC validi (standard FAI B-records).
  2. **Auto-Heal a Due Livelli (Import & Query Time)**:
     - All'importazione (`parameteoImporter.js`), ricostruire la traccia se i punti mancano ma la telemetria è presente, popolando `takeoffLat/Lon`, `landingLat/Lon` e flag `isReconstructed: true`.
     - Alla lettura nel database (`logbookDb.js#getFlightDetail`), se un volo esistente in IndexedDB manca di `decimatedPoints`, invocare la ricostruzione al volo e salvarlo in background senza costringere l'utente a re-importare il backup.
  3. **Inizializzazione Difensiva della Mappa (`FlightDetailSheet.js`)**: Non abortire mai la creazione del motore di mappa: anche se i punti sono vuoti o ridotti, la mappa 2D deve essere montata e centrare i marker di decollo e atterraggio.
  4. **Badge di Trasparenza Semantica (`.gm-status-pill-sky`)**: Mostrare visivamente il badge `Telemetria Ricostruita` per informare il pilota che la traccia deriva dalla sintesi telemetrica.



---

## 163. Posizionamento Geodetico del Badge Dislivello al Punto Medio della Retta Decollo-Atterraggio e Snap ai Confini della Traccia
- **Problema**:
  1. Nella mini-mappa cartografica di `ForecastView`, la retta geodetica tratteggiata che unisce decollo e atterraggio (`glidePolyline`) visualizzava l'orientamento spaziale e il colore di sicurezza della planata, ma mancava un'indicazione immediata del dislivello altimetrico $\Delta h$ lungo la retta stessa.
  2. Nei test di traiettoria del modulo di ricostruzione traccia (`flightTrackReconstruction.js`), oscillazioni armoniche (S-turn) applicate all'inizio del volo senza rampa di transizione facevano discostare il primo punto campionato $P_0$ dalle coordinate esatte del decollo, violando la condizione al contorno di partenza a terra.
- **Causa Radice**:
  1. `LeafletMapEngine.prototype.renderSpotMiniMap` disegnava la polyline tra $T$ e $L$ ma non calcolava il punto medio né istanziava un marker indicatore.
  2. La formula sinusoidale delle virate non applicava un fattore di smorzamento progressivo ($rampUp$) a $t = 0$, introducendo un offset orizzontale istantaneo al punto di lancio.
- **Pattern Vincolante**:
  1. **Calcolo Geodetico del Punto Medio e Delta Altimetrico**:
     $$P_{\text{mid}} = \left[\frac{\text{lat}_t + \text{lat}_l}{2}, \frac{\text{lon}_t + \text{lon}_l}{2}\right], \quad \Delta h = |h_{\text{takeoff}} - h_{\text{landing}}|$$
  2. **Micro-Badge Aeronautico Infrangibile (`.gm-glide-delta-badge`)**: Renderizzato con `L.divIcon` centrato (`iconAnchor: [27, 9]`, `zIndexOffset: 350`, `interactive: false`), stile frosted glass ad alto contrasto conforme ai token del tema (`var(--gm-bg-card)`, `var(--gm-text-primary)`), e supporto nativo per Sunlight Mode (`[data-theme="light"]`). Clic e tocchi passano attraverso (`pointer-events: none`).
  3. **Snap Rigoroso ai Confini nella Ricostruzione Traccia**: Nel generatore di punti sintetici, forzare rigidamente $P_0 \equiv (\text{lat}_t, \text{lon}_t, h_t)$ e $P_{N-1} \equiv (\text{lat}_l, \text{lon}_l, h_l)$, applicando uno smorzamento progressivo $\min(1, \Delta t / 40)$ a qualsiasi oscillazione o virata iniziale.


---

## 164. Profilo Altimetrico Naturale a Spline Hermite con Ancore Termiche e Ripristino Focus Card da Replay 3D
- **Problema**:
  1. Il profilo altimetrico del Volo #50 ricostruito appariva visivamente "finto" e artificiale: una curva sinusoidale monotona che saliva costantemente fino al 60% della durata (minuto 21), ignorando che la salita in termica principale si era conclusa a 2037m alle 13:00 (minuto 3.5), seguita da veleggiamento a 1830m-1884m con altre 2 termiche e infine planata verso PeterPan. Il variometro presentava inoltre gradini di discretizzazione dovuti all'arrotondamento del metro intero.
  2. Quando il pilota chiudeva il visualizzatore Replay 3D (o la scheda di dettaglio volo) e tornava alla lista del Logbook, la vista atterrava sempre in cima alla lista a scroll 0: la card del volo appena esaminato perdeva la posizione visiva e il focus da tastiera, costringendo l'utente a cercare e scorrere di nuovo tutti i voli.
- **Causa Radice**:
  1. `flightTrackReconstruction.js` utilizzava un profilo matematico parametrico a rampa unica anziché ancorarsi sulle coordinate temporali e altimetriche registrate nei metadati (`maxAltPoint` alle 13:00, termiche 1-2-3 con `entryAlt`/`exitAlt`, punto di max variometro alle 13:14 e transizione planata finale). Inoltre, `raw.reconstructionVersion` mancava, impedendo a `logbookDb.js` di aggiornare le tracce già salvate in precedenza nel database locale del browser.
  2. La navigazione indietro in `FlightReplayView.js` (`handleExitReplay`) impostava genericamente `window.location.hash = '#logbook'`, e `ui/router.js` non estraeva né trasmetteva i parametri di query presenti nella stringa hash (`#route?key=value`), reimpostando la vista senza stato di puntamento.
- **Pattern Vincolante**:
  1. **Interpolazione Altimetrica a Spline Hermite Cubica con Tangenti Continue**:
     - In `core/flightTrackReconstruction.js`, ordinare e deduplicare tutte le ancore temporali reali: Decollo, ingressi/uscite termiche con spirali geodetiche e guadagni quota, vertice di picco `maxAltPoint` (con tangente orizzontale $\dot{h}=0$), punto di `maxVarioPoint` e atterraggio.
     - Calcolare le tangenti Hermite $m_k$ per garantire derivata prima continua (zero cuspidi o discontinuità).
     - Applicare micro-rilievo atmosferico multi-frequenza deterministico e smussamento simmetrico del variometro (finestra a media mobile a 3 punti) per eliminare il rumore di discretizzazione.
  2. **Migrazione Trasparente Database (`reconstructionVersion: 2`)**:
     - In `logbookDb.js` (`getFlightDetail`), rilevare tracce con `raw.isReconstructed && (!raw.reconstructionVersion || raw.reconstructionVersion < 2)` e forzare la ri-generazione al volo, aggiornando `raw.originalPoints`, `raw.decimatedPoints`, `raw.rawIgc`, `bundle.meta.sparklineSvgPoints` e persistendo nel database IndexedDB.
  3. **Routing con Parametri Hash e Focus Restoration (`focusFlight`)**:
     - `ui/router.js` espone `parseHashParams(hash)`, estrae i parametri sia su evento `hashchange` sia all'avvio e, quando `validRoute === currentRoute`, inoltra i parametri a `currentMountedView.handleRouteParams(params)`.
     - `FlightReplayView.js` naviga a `#logbook?focusFlightId=${encodeURIComponent(flightId)}`.
     - `LogbookView.js` implementa `focusFlight(flightId)`: se il volo è nascosto da ricerca o filtri, li resetta a 'all', centra la card con `scrollIntoView({ behavior: 'smooth', block: 'center' })`, imposta `focus({ preventScroll: true })` e applica la classe `.gm-flight-card-focused` con animazione a pulsazione visiva per 2.5 secondi.
     - `closeFlightDetailView` in `FlightDetailSheet.js` applica il medesimo puntamento automatico alla chiusura della scheda.


---

## 165. Rotazione Continua Geodetica (Shortest Path) delle Maniche a Vento allo Scrubbing Orario
- **Problema**:
  Durante lo scorrimento della timeline oraria nello scrubber delle previsioni (`ForecastView`), quando la direzione del vento oltrepassava la discontinuità $0^\circ / 360^\circ$ (es. rotazione da $355^\circ$ a $10^\circ$), le maniche a vento vettoriali sulla mini-mappa o sul visualizzatore di analisi volo compivano una rotazione errata nel senso opposto di $345^\circ$ in senso antiorario anziché percorrere l'arco minimo di $+15^\circ$ in senso orario.
- **Causa Radice**:
  L'elemento `.gm-windsock-wrapper` adotta una transizione CSS elastica (`transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)`). Quando `updateWindsockMarker` o `updateFlightProcedures` impostava `wrapper.style.transform = rotate(${k.rotation}deg)` con `k.rotation` normalizzato rigidamente nell'intervallo $[0, 360)$, il motore CSS del browser interpolava scalarmente i valori numerici da $355$ a $10$ ($\Delta = -345^\circ$), generando un giro completo al contrario ad alta velocità.
- **Pattern Vincolante**:
  1. **Funzione Pura Headless `calculateShortestRotation(currentAngle, targetAngle)` (`core/windsock.js`)**:
     Calcola l'angolo continuo unwrapped percorrendo tassativamente l'arco geodetico minimo:
     $$\text{diff} = (\text{target} - \text{current}) \pmod{360}$$
     $$\text{if } \text{diff} > 180 \implies \text{diff} -= 360; \quad \text{if } \text{diff} < -180 \implies \text{diff} += 360$$
     $$\text{return } \text{current} + \text{diff}$$
     Garantisce $|\Delta \theta| \le 180^\circ$ per qualsiasi coppia di angoli (inclusi giri multipli e numeri negativi) e gestisce difensivamente input nulli o non finiti.
  2. **Tracciamento Angolare Continuo su Engine (`ui/map/mapEngineAdapter.js`)**:
     Sia `LeafletMapEngine` sia `HeadlessMockMapEngine` tracciano gli angoli continui (`takeoffWindsockAngle`, `landingWindsockAngle`, `flightTakeoffWindsockAngle`, `flightLandingWindsockAngle`) inizializzati in `renderSpotMiniMap`/`renderComprensorioFlightMap` e aggiornati in `updateWindsockMarker`/`updateFlightProcedures`, sincronizzati con `wrapper.dataset.currentRotation`.
  3. **Preservazione Transizione DOM**:
     L'aggiornamento orario applica la nuova rotazione continua all'attributo `transform` del wrapper e rigenera esclusivamente il contenuto interno dei segmenti SVG (`includeWrapper: false`), garantendo animazioni a 60 FPS senza reset o salti visivi.

---

## 166. Prevenzione Tempeste HTTP 429 Open-Meteo tramite In-Flight Promise Pooling, Multi-Day Cache Population e Circuit Breaker Cooldown
- **Problema**:
  Durante l'interazione con l'applicazione (cambio rapido di data, caricamento iniziale della vista `ForecastView` o re-mount del router), la console registrava sequenze a catena di errori `HTTP 429 (Too Many Requests)` verso le API Open-Meteo. L'applicazione continuava a martellare la rete peggiorando il rate limit, con fallimento dei retry e blocco dell'interfaccia.
- **Causa Radice**:
  1. *Assenza di in-flight pooling*: chiamate parallele simultanee per lo stesso URL generavano richieste di rete duplicate indipendenti, esaurendo in pochi secondi la quota oraria/minuto dell'API.
  2. *Spreco del payload multi-giorno*: Open-Meteo restituiva un forecast orario esteso per 8 giorni (`start_date` a `end_date`), ma il client memorizzava nella cache in-memory esclusivamente la data target puntuale (`targetDate`). Ogni click sui tab data successivi ("Domani", "Dopodomani") causava un cache-miss forzato e una nuova chiamata HTTP da decine di kilobyte.
  3. *Loop di retry non scalato e assenza di circuit breaker*: il retry si riattivava dopo appena 500ms su codice 429 senza rispettare la finestra di blocco dell'API esterna, e nessuna protezione globale intercettava il rate limit per sospendere temporaneamente le richieste di rete successive.
- **Pattern Vincolante**:
  1. **In-Flight Request Deduplication (`fetchWithDeduplication`)**:
     Tutte le richieste a endpoint remoti devono transitare attraverso un pool Map indicizzato per URL canonico. Se una richiesta è già "in-flight", le successive chiamate concorrenti ricevono la medesima `Promise`, azzerando le chiamate ridondanti.
  2. **Popolazione Multi-Day Automatica della Cache**:
     All'arrivo del payload Open-Meteo contenente un intervallo orario multi-giorno, estrarre tutte le date distinte `YYYY-MM-DD` da `raw.hourly.time` e salvare il relativo forecast indicizzato in `weatherCache`. Il cambio data sui tab deve risultare una lettura istantanea da memoria a latenza zero ($0\text{ms}$).
  3. **Circuit Breaker con Cooldown Attivo e Fallback Graceful**:
     Alla ricezione di un codice HTTP 429 (e dopo fallimento del backoff esponenziale), attivare un cooldown di sicurezza (estratto dall'header `Retry-After` o predefinito a 60 secondi). Durante la finestra di cooldown, le successive richieste meteo non devono toccare la rete, ma restituire immediatamente la cache stale pregressa o un fallback sintetico contrassegnato con `{ isRateLimited: true, isSynthetic: true }`.
  4. **Segnalazione di Stato nell'Interfaccia Pilota**:
     In presenza di `isRateLimited: true`, l'indicatore di stato live deve comunicare sobriamente lo stato quota (`Quota API (429)`) con stile visivo ambra/caution conforme al design system, senza bloccare la navigazione o generare alert modali intrusivi.

---

## 167. Divieto Assoluto di Fabbricazione di Punti Traccia (Zero Synthetic/Reconstructed Track Points) e Gestione Trasparente dei Voli Privi di Coordinate GPS
- **Problema**:
  Nei tentativi precedenti di visualizzare una traccia per i voli importati da fogli Excel o backup parziali privi di campionamento secondo per secondo (es. Volo #50), il sistema sintetizzava traiettorie e onde sinusoidali/spline artificiali. L'utente ha giustamente sollevato la violazione di veridicità del dominio aeronautico: inventare punti geografici o profili altimetrici per un volo registrato è inaccettabile e fuorviante per l'analisi del pilota.
- **Causa Radice**:
  Tentativo di mascherare l'assenza di dati grezzi generando punti artificiali (`flightTrackReconstruction.js`, interpolazioni ad onda, finti B-record IGC) invece di gestire con sobrietà e trasparenza l'assenza della traccia registrata.
- **Pattern Vincolante**:
  1. **Divieto Assoluto di Punti Sintetici / Fittizi**:
     - Rimozione totale del modulo di ricostruzione traccia (`core/flightTrackReconstruction.js`) e di qualsiasi algoritmo che inventi coordinate GPS o quote intermedie per voli reali.
     - Nei moduli di importazione (`core/parameteoImporter.js`), i voli senza punti grezzi devono mantenere `points: null`, `rawPoints: []`, `decimatedPoints: []`, `rawIgc: null`, `hasDecimatedTrack: false`, `isReconstructed: false`.
  2. **Auto-Purge Attivo nel Database Locale (`core/logbookDb.js`)**:
     - Alla lettura nel database (`getFlightDetail`), se un volo presenta `raw.isReconstructed === true` o punti generati artificialmente in sessioni pregresse, ripulire attivamente i campi (`decimatedPoints = []`, `originalPoints = []`, `rawIgc = null`, `isReconstructed = false`) e persistere la bonifica in IndexedDB.
  3. **Rappresentazione Veritiera nella Scheda di Dettaglio (`FlightDetailSheet.js`)**:
     - **Mini-Mappa 2D**: Se il volo possiede coordinate di decollo e atterraggio nei metadati, renderizzare esclusivamente i marker ufficiali di decollo ("D") e atterraggio ("A") inquadrati nei bounds, senza tracciare alcuna polyline fittizia tra di essi.
     - **Profilo Altimetrico**: Visualizzare il messaggio sobrio e trasparente: *"Tracciato altimetrico non disponibile (nessuna registrazione di coordinate GPS/IGC per questo volo)"*, accompagnato dalle metriche reali verificate (Quota Decollo, Quota Max, Quota Atterraggio, Durata, Dislivello).
     - **Disabilitazione Controlli**: Disabilitare esplicitamente i pulsanti di Replay 3D e Assetto (`disabled aria-disabled="true" title="Replay 3D non disponibile: traccia GPS assente"`) e il download del file IGC (`title="Download IGC non disponibile: nessuna registrazione GPS"`).
     - **Badge di Stato**: Mostrare il badge sobrio `Traccia Non Registrata`.
  4. **Stato Vuoto Trasparente nel Replay 3D (`FlightReplayView.js`)**:
     - Se l'utente naviga all'URL `#replay?flightId=...` per un volo privo di punti GPS, visualizzare una schermata trasparente con messaggio esplicito (*"Traccia GPS Non Disponibile: Il volo non contiene una registrazione di coordinate GPS secondo per secondo. Il Replay 3D richiede una traccia reale IGC registrata da strumento o variometro"*) e pulsante *"Torna al Flight Log"* che ripristina la vista centrata sulla card del volo (`#logbook?focusFlightId=...`).

---

## 168. Identificazione Veritiera della Presenza Traccia GPS nel Flight Log (`hasAttachedTrack`) e Feedback Tri-Modale di Sicurezza
- **Problema**:
  Nel feed del logbook, i voli privi di traccia GPS reale (es. storicizzati da tabelle Excel o importati solo con metadati tabellari) non erano distinguibili a colpo d'occhio dai voli dotati di traccia IGC registrata. Inoltre, affidarsi semplicemente al flag booleano preesistente `flight.hasTrack === true` generava falsi positivi poiché nei vecchi backup ParaMeteo tale flag era impostato a `true` anche quando l'oggetto traccia non conteneva coordinate effettive nel database.
- **Causa Radice**:
  Assenza di una funzione di validazione strutturale headless per la presenza fisica di traccia GPS e mancanza di un indicatore visivo dedicato sulle card del flight log.
- **Pattern Vincolante**:
  1. **Funzione Pura Headless `hasAttachedTrack(flight)` (`core/logbook.js`)**:
     Valuta l'effettiva presenza di dati GPS autentici: `hasDecimatedTrack === true`, `hasRawIgc === true`, `decimatedPoints.length >= 2`, `points.length >= 2`, `rawIgc` con lunghezza $> 30$ caratteri, o bundle con traccia valida.
     Rifiuta categoricamente `flight.isReconstructed === true`, array vuoti o assenti, ignorando il flag non verificato `flight.hasTrack`.
  2. **Feedback Tri-Modale sulle Card del Logbook (`LogbookView.js`)**:
     Applicare il principio tri-modale di sicurezza (`laws-of-ux` Sezione 8): combinare **Colore + Testo Esplicito + Icona Funzionale**:
     - *Traccia Presente*: `.gm-track-badge-present` (smeraldo, icona polyline SVG, testo *"Traccia"*).
     - *Traccia Assente*: Nessun badge renderizzato (omissione del badge negativo per azzerare il visual clutter sulle card prive di coordinate).
     - Tipografia compatta a larghezza controllata nel blocco `.gm-flight-badge-group`, prevenendo qualsiasi troncamento del titolo del volo su display mobile 360px-390px.
  3. **Filtri Rapidi a Scorrimento Singolo (`touch-action: pan-x`)**:
     Nel carosello dei filtri del logbook, includere i chip `Con traccia` (`with-track`) e `Senza traccia` (`no-track`) gestiti dal controller `filterFlights`, consentendo all'utente di isolare istantaneamente i voli analizzabili in 2D/3D.
  4. **Coerenza Semantica nel Dettaglio Volo (`FlightDetailSheet.js`)**:
     Allineare i badge di testata (`.gm-status-pill-emerald` *"Traccia GPS"* vs `.gm-status-pill-slate` *"Traccia Non Registrata"*), garantendo un lessico coerente in tutta l'applicazione.

---

## 169. Gerarchia Above-the-Fold 100% Meteo-Centrica nella Home, Pillola Vela a Costo Verticale Zero e Fattore Opzionale di Prudenza "Allenamento & Esperienza Pilota"
- **Problema**:
  1. Posizionare un blocco a 4 righe `Attività Pilota` (`.gm-pilot-card`, ~165px) prima della sezione `Volabilità` nella Home sottrae il 35% del viewport mobile Above-the-Fold (360-390px) proprio quando il 90% delle aperture dell'app ha come obiettivo esclusivo il triage meteorologico immediato dei comprensori.
  2. In `HomeDashboardView.js`, il selettore calendario a 14 giorni invocava `getAvailableCalendarDates(today, 14, null)` omettendo le sintesi di volabilità (`flySummaries`), perdendo la simmetria a 4 stati presente in `ForecastView.js`.
  3. Lo stato di allenamento del pilota (freschezza / giorni dall'ultimo volo) e l'esperienza complessiva (numero di voli a libretto) sono fattori reali di sicurezza nel volo libero, ma a differenza della vela non alterano i limiti aerodinamici fisici ($V_{\text{trim}}$ o efficienza di planata $L/D$).
- **Causa Radice**:
  1. Accorpamento improprio nella Home di KPI storici da diario di volo (`30 Giorni | Anno`, ore, dislivello, ultimo volo) che appartengono al tab `Flight Log`.
  2. Mancato passaggio di `this.getMultiDayFlyability(null, 14)` al bottom sheet calendario della Home.
  3. Assenza di una separazione matematica tra limiti fisici dell'ala (penetrazione al vento e cono di planata) e soglie di gestione attiva del pilota (raffiche, turbolenza EDR, CAPE, vento traverso).
- **Pattern Vincolante**:
  1. **Home Above-the-Fold 100% Meteo-Centrica (`HomeDashboardView.js`)**:
     - Vietato collocare card statistiche di carriera o blocchi multipiano del pilota sopra o dentro la Home. La sezione `Volabilità` deve iniziare immediatamente sotto l'header.
     - **Barra Simbiotica a Riga Singola (`#home-symbiotic-toolbar` / `.gm-symbiotic-toolbar`)**: la casella di ricerca (`.gm-symbiotic-search`), l'unico toggle di filtro volabilità (`#btn-home-fly-filter-toggle`, che commuta a mutua esclusione tra `Tutti (N)` e `Volabili (M)`) e la pillola della vela attiva (`#btn-home-select-glider`) condividono **un'unica riga orizzontale** (`flex-wrap: nowrap`). Quando l'utente avvia una ricerca (`:focus-within` o `.is-searching`), il toggle di filtro volabilità sparisce automaticamente per cedere tutto lo spazio orizzontale all'input di ricerca.
     - **Avviso di Continuità Condizionale (Opzione B)**: quando il pilota è in stato ottimale (`active`, $\le 35\text{gg}$), non mostrare alcun badge di stato in Home (`0px`); mostrare `#home-pilot-currency-alert` accanto alla pillola della vela esclusivamente in stato `reentry` ($36\text{–}90\text{gg}$), `lapsed` ($> 90\text{gg}$) o `no_flights`.
     - Il toggle `30 Giorni | Anno` risiede nella card `"Valuta & Continuità Pilota"` di `LogbookStatsView.js`, e l'unico bottone primario del `Flight Log` apre `ImportFlightSheet.js` che unifica il caricamento `.IGC/.JSON` e il form collassabile `"Registra Volo Manualmente (Senza Traccia)"`.
  2. **Simmetria Calendario 14 Giorni Cross-View**:
     - Sia `HomeDashboardView.js` sia `ForecastView.js` devono passare `getMultiDayFlyability(null, 14)` a `getAvailableCalendarDates(today, 14, flySummaries)` e renderizzare i 4 stati semantici (`flyable`, `caution`, `unflyable`, `severe`) con legenda `.gm-date-sheet-legend`.
  3. **Fattore Opzionale di Prudenza "Allenamento & Esperienza Pilota" (`usePilotCurrencyFactor`)**:
     - Opzione esplicita opt-in (`usePilotCurrencyFactor: false` di default in `core/store.js`), attivabile dallo sheet di selezione vela e da `SettingsView.js`.
     - **Derating Monodirezionale Conservativo (`calculatePilotSafetyFactor` in `core/logbook.js`)**: il moltiplicatore non può **mai superare `1.0x`** (`1.0x` se $\le 35\text{gg}$ e $\ge 15\text{ voli}$; `0.85x` (`-15%`) se in `reentry` $36\text{–}90\text{gg}$ o $< 15\text{ voli}$; `0.75x` (`-25%`) se `lapsed` $> 90\text{gg}$).
     - **Invarianza dei Limiti Aerodinamici Fisici (`core/flyability.js` & `core/comprensorio.js`)**: il moltiplicatore riduce esclusivamente le soglie di pilotaggio attivo ($\Delta\text{Gust}$, brezza gialla di lancio, turbolenza EDR, CAPE convettivo, cono di vento traverso), lasciando **strettamente invariati** i limiti fisici di penetrazione al vento (`windRed`, `windNoFly` ancorati a $V_{\text{trim}}$, con `gustRed >= windRed + 4` e `gustNoFly >= windNoFly + 4`) e il cono di planata verso l'atterraggio (`safeLimit`).
     - **Explainability Trasparente**: quando un comprensorio viene declassato per effetto del fattore pilota (`flyScore.severity > pureScore.severity`), la stringa `reason` dichiara esplicitamente: `"Meteo favorevole per la vela • [reasonTag]"`.

---

## 170. Marker Circolare Pulito dell'Atterraggio sulla Mini-Mappa (Zero Quota sovrapposta alla Manica a Vento)
- **Problema**:
  Sulla mini-mappa cartografica (`#forecast-mini-map`), il marker dell'atterraggio (`.gm-mini-pin-landing`) mostrava la quota altimetrica accanto al simbolo (`⏚ 700m`), allargando il pin a pillola (`54x22px`) e causando la collisione visiva con la manica a vento vettoriale ancorata sulle medesime coordinate, oltre a duplicare inutilmente un dato già esposto nella riga testuale dell'atterraggio e nel badge dislivello (`Δ 855m`).
- **Causa Radice**:
  Inclusione di `<span class="gm-mini-pin-alt">${lAlt}m</span>` nel template HTML di `L.divIcon` per l'atterraggio in `ui/map/mapEngineAdapter.js`.
- **Pattern Vincolante**:
  - **Hub Circolare `22x22px` Simmetrico (`.gm-mini-pin-landing`)**: Nella mini-mappa (`renderSpotMiniMap`) e nella mappa d'analisi comprensorio (`renderComprensorioFlightMap`), il marker di atterraggio deve renderizzare esclusivamente il simbolo aeronautico `<span class="gm-mini-pin-glyph">⏚</span>` all'interno di un hub circolare `22x22px` (`iconSize: [22, 22]`, `iconAnchor: [11, 11]`, `border-radius: 50%`), speculare all'anello pivot `r="11"` del decollo e privo di testo altimetrico (`gm-mini-pin-alt`).

---

## 171. Pannelli di Warning Floating Ancorati in Basso con Pulsante Chiudi (Zero Cumulative Layout Shift)
- **Problema**:
  I pannelli di avviso contestuali (in particolare `.gm-horizon-notice` *"Tendenza a lungo raggio: oltre 7 giorni le previsioni sono indicative"* in `HomeDashboardView`, `ForecastView` e `SpotMapView`, nonché `.gm-storage-warning-banner`, `.gm-logbook-undo-banner` e `.gm-import-summary-banner` in `LogbookView`) erano inseriti nel flusso statico del documento sotto la barra delle date o in testa alla vista. Quando venivano mostrati, spingevano verso il basso le card sottostanti causando un fastidioso scatto verticale del layout (Cumulative Layout Shift, CLS) e non potevano essere chiusi dall'utente una volta letti.
- **Causa Radice**:
  Posizionamento statico (`display: flex` in-flow con margini verticali) e assenza di un controllo esplicito di chiusura (`✕`) con stato di dismissione per la data/sessione attiva.
- **Pattern Vincolante**:
  1. **Ancoraggio Floating in Basso sopra la Barra Inferiore (`position: fixed`, Zero CLS)**:
     - Tutti i pannelli di warning/avviso devono essere estratti dal flusso del documento (`position: fixed; left: 50%; transform: translateX(-50%); width: calc(100% - 24px); max-width: 520px; z-index: 950;`) e ancorati in basso sopra la barra di navigazione (`bottom: calc(var(--gm-nav-height-mobile, 64px) + env(safe-area-inset-bottom, 0px) + 12px)` su mobile, `bottom: 20px` su desktop).
     - Nelle viste dotate di timeline scrubber dockata in basso (`.gm-forecast-view .gm-horizon-notice`, `.gm-spot-map-view .gm-horizon-notice`, `#gm-map-date-bar .gm-horizon-notice`), l'offset inferiore sale automaticamente sopra lo scrubber (`+ 104px` mobile / `108px` desktop) per non coprire mai le barre orarie.
  2. **Pulsante di Chiusura Obbligatorio (`.gm-warning-close-btn`, Fitts $\ge 48 \times 48\text{px}$)**:
     - Ogni pannello di warning (`.gm-horizon-notice`, `.gm-flight-safety-warning-banner`, `.gm-storage-warning-banner`, `.gm-import-summary-banner`) deve esporre all'estremità destra un pulsante di chiusura esplicito `✕` (`.gm-warning-close-btn` con area di tocco espansa tramite `::before` a `48x48px`) che consente all'utente di chiudere immediatamente l'avviso (`data-action="dismiss-horizon-notice"`, `dismiss-safety-warning`, `dismiss-storage-warning`, `dismiss-import-summary`).


---

## 172. Card Comprensorio a 2 Righe con Timeline Diurna di Volabilità e 1-Tap Hour Deep-Linking (Opzione A — Recognition over Recall)
- **Problema**:
  La precedente card comprensorio a 4 righe in `HomeDashboardView.js` (titolo + sottotitolo binomio `▲ Decollo · ⏚ Atterraggio` + 3 pillole testuali `Brezza ottimale · Dir. Allineata · Planata Sicura` + riga di spiegazione testuale) richiedeva la lettura seriale di ~18 parole per ogni sito ma fotografava un unico istante statico della giornata, senza mostrare **quando** si apre o si chiude la finestra di volo.
- **Causa Radice**:
  Sovraccarico verbale per-card (lettura sequenziale lenta) a scapito della scansione visiva pre-attentiva dell'evoluzione diurna (`Alba -> Tramonto`).
- **Pattern Vincolante**:
  1. **Layout Espressivo a 2 Righe (`.gm-spot-card.gm-spot-card-timeline`)**:
     - **Riga 1 (`.gm-spot-header`)**: a sinistra Nome Comprensorio + Provincia (`.gm-spot-title-group`); a destra (`.gm-spot-header-right`) micro-causa sintetica (`.gm-spot-explain.gm-spot-micro-reason`, es. `Raffiche mod. · Rientro` o `Vento ottimale`), badge semantico pieno (`.gm-badge-pill`) e chevron (`›`). Il contratto *Unico Binomio* è preservato negli attributi `data-takeoff-name`, `data-landing-name` e `aria-label`.
     - **Riga 2 (`.gm-home-timeline`)**: striscia oraria diurna dall'alba al tramonto (`resolveDaylightHours` da `core/daylight.js`, tipicamente `08`..`18`), composta da slot `.gm-home-timeline-slot` con ora a 2 cifre (`.gm-home-timeline-hour`) e barra cromatica a 4 stati (`.gm-home-timeline-bar`: `status-flyable`, `status-caution`, `status-unflyable`, `status-severe`, oppure `status-unavailable` in assenza di dati offline).
  2. **Deep-Linking Orario a 1-Tap (`data-action="view-forecast-hour"`)**:
     - Toccare uno slot orario specifico (`data-hour="11"`) imposta `{ selectedSpot, selectedHour: 11 }` nello store e naviga direttamente a `ForecastView` posizionata su quell'ora esatta.

---

## 173. Selettore Rapido Previsioni Sub-Spot (`Panoramica | Decollo | Atterraggio`) e Combo Inline Condizionale per Spot Multipli (`[NOTE-002]`)
- **Problema**:
  In `ForecastView.js`, dopo l'unificazione dell'header in `.gm-unified-spot-bar`, il passaggio tra la vista `Panoramica` e le previsioni analitiche del singolo `Decollo` o `Atterraggio` (nonché il cambio di decollo/atterraggio attivo nei comprensori multi-spot) richiedeva l'apertura del bottom sheet `Seleziona Comprensorio` (`openPickerSheet`), introducendo un cambio di contesto modale non necessario quando il pilota sta già esaminando la card di riepilogo (`#forecast-summary-card`) o la card del punto specifico (`#forecast-specific-spot-card`).
- **Causa Radice**:
  Le righe di decollo e atterraggio dentro `.gm-flight-data-grid` (`renderSummaryMetrics`) e l'intestazione di `renderSpecificSpotMetrics` erano puramente statiche, prive sia di una barra di commutazione rapida in-place sia di un selettore inline contestuale per i comprensori con più decolli o più atterraggi.
- **Pattern Vincolante**:
  1. **Selettore Rapido a 1-Tap (`.gm-quick-subspot-switcher`) e Righe Interattive (`.gm-flight-stat-row-interactive`)**:
     - In testa a `#forecast-spot-metrics-container` (sia in `renderSummaryMetrics` sia in `renderSpecificSpotMetrics`) esporre la barra a 3 pillole `role="tablist"` (`Panoramica`, `Decollo`, `Atterraggio`) con `data-action="select-subspot"` e area di tocco espansa (`::before`), permettendo la commutazione istantanea a 1-tap senza aprire lo sheet.
     - Le righe `.gm-flight-stat-row` in `renderSummaryMetrics` espongono anch'esse `data-action="select-subspot"` verso il decollo o l'atterraggio mostrato.
  2. **Combo Inline Condizionale (`.gm-inline-subspot-select`, Occam's Razor)**:
     - Renderizzare un elemento `<select class="gm-inline-subspot-select gm-flight-target" data-action="change-active-takeoff|change-active-landing">` al posto del nome statico **esclusivamente** quando il comprensorio dispone di più opzioni per quel ruolo (`spot.takeoffs.length > 1` o `spot.landings.length > 1`). Quando esiste un solo decollo o un solo atterraggio (`length <= 1`), mostrare testo statico pulito `<span class="gm-flight-target">` privo di frecce dropdown superflue.
  3. **Persistenza del Binomio Scelto al Ritorno in Panoramica**:
     - Quando l'utente seleziona `Panoramica` (`subSpotId === 'overview'`), preservare `this.activeTakeoffId` e `this.activeLandingId` se appartengono già al comprensorio corrente, anziché resettarli forzatamente al decollo/atterraggio primario.
  4. **Reattività della Timeline Oraria (`evaluateTimelineSlot`) e Disambiguazione Chiave `weatherCache`**:
     - `getWeatherData(spot, dateStr)` deve includere `takeoff.id` e `landing.id` nella chiave di cache (`${spot.id}_${takeoff.id || 't0'}_${landing?.id || 'l0'}_${dateStr}`) e verificare `_landingId` prima di riutilizzare `landingWeather`, evitando di servire l'aerologia del primo decollo/atterraggio quando si cambia spot tramite combo.
     - `renderTimelineGrid`, `renderStickyScrubber` e `setHour` devono valutare ogni slot tramite `evaluateTimelineSlot(spot, weatherData, h, glider, activeSub)` anziché invocare direttamente `evaluateComprensorio` (che valuta sempre il decollo primario + cono di planata), differenziando:
       - `overview` (`· Panoramica`): severità combinata peggiore tra decollo, cono di planata e brezza di valle in atterraggio;
       - `takeoff` (`· ↗ <Decollo>`): volabilità pura del decollo selezionato con altezza barra modulata dall'allineamento azimutale (`diffFromFront`) e dal vento in quota;
       - `landing` (`· ↘ <Atterraggio>`): volabilità specifica dell'atterraggio (`getFlyabilityScore(..., isTakeoff = false)` + guardia brezza di valle pomeridiana $\ge 15\text{ km/h}$ / raffiche $\ge 21\text{ km/h}$).

---

## 174. Date Picker Compatto Monoriga (`36px`) con Stepper Prev/Next Integrato e Griglia Calendario a 7 Colonne (`Lun–Dom`)
- **Problema**:
  1. I tab data a 2 righe (`.gm-date-tab` alti `48px` visivi, larghi `>= 68px`) occupavano troppo spazio verticale nell'header di `HomeDashboardView`, `ForecastView` e `SpotMapView`, e l'aggiunta dinamica di un 5° chip `.custom` quando si sceglieva una data fuori dai preset provocava overflow orizzontale sui viewport mobile (`360px–390px`).
  2. Mancava la possibilità di avanzare o retrocedere rapidamente di un giorno (`Prev / Next`) senza dover aprire ogni volta il bottom sheet del calendario.
  3. Il bottom sheet del calendario usava una griglia a 3/4 colonne non allineata ai giorni della settimana (`Lun–Dom`) più un blocco secondario ridondante (`<input type="date">` nativo + pulsante `Conferma`).
- **Causa Radice**:
  Accoppiamento tra visualizzazione della data attiva e lista dei chip preset, assenza di metadati di navigazione sequenziale (`prevDate`/`nextDate`) in `core/datePresets.js` e layout a card larghe nello sheet.
- **Pattern Vincolante**:
  1. **Stepper Integrato + Quick Chips Monoriga (`36px` visivi, Touch Floor $\ge 48\text{px}$ via `::before`)**:
     - `.gm-date-tabs` è diviso in due gruppi compatti sulla stessa riga:
       - `.gm-date-stepper`: `[‹ prev-date] [📅 open-date-picker-sheet (activeDisplayLabel) ▾] [› next-date]`. La pillola centrale mostra sempre la data attiva corrente (preset o custom) e apre lo sheet 14 giorni.
       - `.gm-date-quick-chips`: renderizza esclusivamente `smartData.quickPresets` (`!p.isCustom`) con etichette corte su 1 riga (`Oggi`, `Dom`, `Sab`, `Dom`), mantenendo larghezza fissa e zero layout shift anche quando è attiva una data custom.
  2. **Griglia Calendario 2 Settimane a 7 Colonne (`Lun–Dom`) senza Input Nativo Ridondante**:
     - In `openDatePickerSheet()`, esporre l'intestazione `.gm-date-weekday-header` (`WEEKDAY_HEADERS_MON`: `Lun..Dom`) sopra `.gm-date-grid` (`grid-template-columns: repeat(7, 1fr)`), precedendo i 14 giorni con `availableDates[0].weekdayIndexMonday` celle `.gm-date-grid-spacer` per garantire l'allineamento rigoroso di ogni data sotto la propria colonna settimanale. Non includere mai il campo ridondante `#custom-date-native-input`.
  3. **Invarianza del Colore di Volabilità sul Giorno Selezionato (`.gm-date-grid-item.active`)**:
     - È vietato colorare l'intero sfondo di `.gm-date-grid-item.active` con `var(--gm-accent)` (giallo/ambra), poiché si confonde con lo stato semantico `Cautela` e nasconde la volabilità del giorno selezionato.
     - `.gm-date-grid-item.active` deve usare un anello di selezione ciano neutro (`border-color: #38bdf8; box-shadow: 0 0 0 1.5px #38bdf8; background-color: rgba(56, 189, 248, 0.14)` in dark / `#0284c7` in light), preservando **sempre** sia la barra inferiore a 4 colori (`.gm-date-grid-item.fly-*` senza `:not(.active)`) sia il colore semantico originale del badge `.grid-fly-status`.

---

## 175. Timeline Diurna Leggera (`.gm-home-timeline-bar` a `3.5px`), Gerarchia d'Opacità (Von Restorff) e Assenza di Numeri Orari o Selezione Visibile nelle Card Home
- **Problema**:
  1. Nella Home Dashboard (`HomeDashboardView.js`), le barre orarie `.gm-home-timeline-bar` avevano spessore `8px` e opacità `100%` uniforme per tutti gli stati, trasformando 13 slot per card in mattoncini pesanti in cui il rosso `Non Volabile` dominava visivamente rispetto alle finestre volabili.
  2. La presenza dei numeri delle ore (`.gm-home-timeline-hour`) e del riquadro di selezione sull'ora attiva (`.is-selected-hour`) nelle timeline delle card Home introduceva ripetizione numerica e rumore visivo superfluo in una vista di triage rapido.
  3. I token `--gm-bg-surface-alt`, `--gm-border-subtle` e `--gm-surface-2` erano usati nei selettori Home ma non definiti in `:root` / `[data-theme="light"]`, rendendo invisibili le barre `status-unavailable` offline.
- **Causa Radice**:
  Trattare la micro-timeline delle card Home come uno scrubber numerico completo anziché come un indicatore visivo sintetico a colpo d'occhio, assenza di gerarchia di opacità tra stati attivi (`flyable`) e stati chiusi (`unflyable`), e mancata dichiarazione dei token secondari di superficie/bordo in `:root`.
- **Pattern Vincolante**:
  1. **Assenza di Numeri delle Ore e di Selezione Visibile nelle Timeline Home**:
     - Nelle timeline della Home (`.gm-home-timeline`), ogni `.gm-home-timeline-slot` renderizza esclusivamente `<span class="gm-home-timeline-bar"></span>` (senza `.gm-home-timeline-hour`, senza asse numerico e senza classe/riquadro `.is-selected-hour`). Il contesto orario e anemometrico resta accessibile tramite `title` e `aria-label`.
  2. **Indicatori Sottili (`3.5px`) con De-Enfasi delle Ore Non Volabili**:
     - `.gm-home-timeline-bar` adotta `height: 3.5px; border-radius: var(--gm-radius-full);` (con touch floor garantito da `.gm-home-timeline-slot::before { inset: -8px 0; }`).
     - Opacità differenziata per risalto immediato delle finestre utili: `status-flyable` (`opacity: 0.85`), `status-caution` (`opacity: 0.68`), `status-unflyable` (`opacity: 0.28`), `status-unavailable` (`opacity: 0.32`).
  3. **Chevron Verticale Standard da Accordion (`.gm-spot-accordion-trigger` + `.gm-spot-chevron`)**:
     - Nella testata destra della card (`.gm-spot-header-right`), evitare la doppia freccia conflittuale (`▾` dentro il badge + `›` orizzontale accanto). Racchiudere badge e freccia in un unico bottone `.gm-spot-accordion-trigger` (`data-action="toggle-spot-reasons"`) con `.gm-spot-chevron` orientato verticalmente verso il basso (`points="6 9 12 15 18 9"`) che ruota di `180deg` (`transform: rotate(180deg)`) quando `.is-reasons-expanded` è attivo.

---

## 176. Sincronizzazione Bootstrap IndexedDB vs LocalStorage, Stripping Tracciati Densi, Conversione Unità Headless e Governance CSS/PWA
- **Problema**:
  1. In `ui/app.js`, l'esecuzione di `store.loadPersistedState()` *dopo* il caricamento iniziale da IndexedDB (`logbookManager.getAllFlights()`) permetteva a uno snapshot obsoleto in `localStorage` di sovrascrivere in memoria l'archivio autorevole dei voli, mentre `ImportFlightSheet.js` salvava i voli manuali solo nello store in RAM senza persisterli in IndexedDB.
  2. La serializzazione integrale di `flights` in `localStorage` (`core/store.js`) includeva gli array densi (`points`, `originalPoints`, `uncalibratedOriginalPoints`), esponendo il browser a `QuotaExceededError` oltre i 5MB.
  3. La regex di pre-chunking IGC in `core/logbookDb.js` non riconosceva l'header standard `HFDTEDATE:DDMMYY,NN`, ripiegando sulla data odierna e causando collisioni di fingerprint su tracce multi-ora; inoltre `store.loadPersistedState()` scartava i layer mappa `'dark'` e `'cyclosm'`, e le preferenze `ui.units` non erano applicate nel rendering delle viste.
  4. In `css/theme.css` erano presenti 14 selettori top-level duplicati e oltre 120 attributi `style="..."` statici nei controller UI.
- **Causa Radice**:
  Disallineamento nell'ordine di idratazione dello stato tra `localStorage` e `IndexedDB`, assenza di proiezione leggera (`flights_meta`) nel salvataggio sincrono su `localStorage`, validazione parziale dei layer cartografici e stratificazione progressiva di regole CSS/inline durante iterazioni UI.
- **Pattern Vincolante**:
  1. **Ordine di Bootstrap e Autorevolezza IndexedDB**: In `bootstrapApp()` (`ui/app.js`), invocare prima `store.loadPersistedState()` per le preferenze utente e subito dopo sincronizzare `flights` da `logbookManager.getAllFlights()`. Tutti i canali di creazione volo (incluso il form manuale in `ImportFlightSheet.js`) devono persistere tramite `logbookManager.saveFlight()`.
  2. **Proiezione Leggera in `localStorage` (`persistKeys`)**: Quando `core/store.js` serializza `flights` in `localStorage`, rimuovere sempre gli array densi (`points`, `originalPoints`, `uncalibratedOriginalPoints`), conservando in `localStorage` solo i metadati leggeri e delegando i blob densi a IndexedDB (`flights_raw`).
  3. **Formattazione Unità Centralizzata (`core/units.js`)**: Tutte le viste (`HomeDashboardView`, `ForecastView`, `LogbookView`) devono formattare vento, quota e rateo variometrico tramite il modulo puro headless `core/units.js` (`formatWindSpeed`, `formatAltitude`, `formatVario`) in funzione di `store.getState().ui.units`.
  4. **Cleanup Deterministico Overlay e Guardie Tastiera**: Ogni cambio rotta nel router deve invocare `sheetManager.closeSheet()` (eseguendo eventuali hook `__cleanupOverlay`), e le scorciatoie globali da tastiera devono essere inibite quando `#sheet-container` o un overlay full-screen ha `aria-hidden="false"`.
  5. **Gate Automatici Shift-Left (`tests/ui/shiftLeftGovernance.test.mjs`)**: Mantenere a zero i selettori CSS top-level duplicati in `css/theme.css`, verificare la presenza e registrazione del Service Worker `sw.js` e bloccare qualsiasi regressione terminologica nei test automatici.
