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



