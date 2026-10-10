# Worklog: Revisione Cartografica SpotMapView — Layer Switcher, Progressive Dot Marker & Scrubber Overhaul

- **Data**: 2026-10-10
- **Autore**: AI Assistant (Antigravity)
- **Ambito**: Cartografia, UI/UX, Ergonomia Outdoor, Performance

---

## Contesto e Problemi Riscontrati

Dallo screenshot dell'utente e dal riscontro sul campo sono emerse tre criticità nell'esperienza d'uso della mappa comprensori (`SpotMapView.js`):
1. **Pill Pileup a Macro Zoom**: A zoom nazionale (< 7.5), la mappa renderizzava capsule orizzontali complete da 120px per ciascuno dei 135 siti censiti. I marker collassavano l'uno sull'altro creando una barriera visiva illeggibile che oscurava l'orografia e faceva perdere di vista il comprensorio che il pilota stava osservando (es. Castaldia).
2. **Assenza di Layer Switcher**: L'interfaccia non permetteva al pilota di selezionare il tipo di cartografia (Rilievo Topografico, Immagini Satellitari, Cockpit Scuro, Stradale OSM).
3. **Timeline Scrubber Compromessa e Marker Bleeding**: Lo scrubber orario dockato in basso soffriva di traslucenza ottica (`backdrop-filter: blur(10px)` a `z-index: 500`), lasciando intravedere frammenti testuali di marker sottostanti ("ca" di Castaldia sovrapposto all'intestazione oraria). Mancavano inoltre controlli stepper touch diretti e un'indicazione chiara dello stato di volabilità dello spot attivo per l'ora selezionata.

---

## Interventi Implementati

### 1. Progressive Disclosure dei Marker & Tracking Avionico (`ui/map/mapEngineAdapter.js`)
- **Macro Zoom (< 7.5)**:
  - *Spot Passivi*: Convertiti in dot circolari semaforici compatti da 18px (`.gm-map-dot-marker`) recanti simbolo geometrico avionico (`●`, `▲`, `✕`, `○`), bordo colorato e sfondo scuro, privi di etichette testuali ingombranti.
  - *Spot Osservato / Attivo (`activeSpotId`)*: Dot evidenziato con bordo dorato (`.gm-map-dot-focused`), anello beacon avionico pulsante a scansione radiale (`.gm-focused-beacon-pulse` con `@keyframes gm-beacon-pulse`), card fluttuante del nome ad alto contrasto posizionata sopra il dot e `zIndexOffset: 1000`.
- **Medium Zoom (7.5 - 8.9)**:
  - L'aureola di bacino orografico da 8 km viene renderizzata **esclusivamente per lo spot attivo/osservato**, eliminando la saturazione dello schermo generata da decine di cerchi concentrici concorrenti.
- **Micro Zoom (>= 9.0)**:
  - Marker di decollo, atterraggio e vettore planata dello spot attivo ricevono enfasi visiva, ombra dorata e `zIndexOffset: 1000`.

### 2. Selettore Multi-Layer Keyless ad Alta Disponibilità (`ui/map/mapEngineAdapter.js`, `ui/views/SpotMapView.js`)
- Definita la matrice `MAP_LAYERS` con 4 profili raster distribuiti su CDN globali Akamai/OSM privi di vincoli di API key:
  - `topo`: Esri World Topo Map (rilievo orografico, curve di livello).
  - `satellite`: Esri World Imagery (ortofoto satellitare ad alta risoluzione).
  - `dark`: Esri Canvas Dark Gray Base (modalità cockpit a basso abbagliamento).
  - `streets`: OpenStreetMap Standard.
- Integrato menu a tendina `<select id="gm-map-layer-select">` nella barra superiore di `SpotMapView`.
- Aggiornamento dinamico istantaneo del layer cartografico tramite `mapEngine.setLayer(layerId)` con salvaguardia di persistenza e sincronizzazione store.

### 3. Isolamento Ottico & Overhaul dello Scrubber Orario (`ui/views/SpotMapView.js`, `css/theme.css`)
- **Azzeramento del Marker Bleeding**: Elevato `z-index: 600`, sfondo card solido (`var(--gm-bg-card, #12161f)`) e ombra netta (`box-shadow: 0 8px 30px rgba(0,0,0,0.55)`), garantendo che nessun marker o elemento cartografico possa trasparire dietro la timeline.
- **Pillola Situazionale dello Spot Attivo (`#gm-map-scrubber-spot-pill`)**: Visualizza il nome del comprensorio osservato e il badge semaforico di volabilità calcolato per l'ora attiva.
- **Stepper Touch Ergonomici $\ge 44\times 44\text{px}$**: Introdotti pulsanti `#gm-map-prev-hour-btn` (`‹`) e `#gm-map-next-hour-btn` (`›`) nell'header dello scrubber per navigazione oraria rapida a 1 tap, mantenendo al contempo gli slot continui 08:00..20:00 con barre percentuali di volabilità.

---

## Verifiche di Qualità & Governance

- **Test Suite**: Eseguito `npm test` con esito 100% positivo: **393/393 test superati** su 57 suite (inclusi contratti cartografici headless `spotMapView.test.mjs` e governance `shiftLeftGovernance.test.mjs`).
- **Headless Core Purity**: Nessuna modifica apportata a `core/`. Tutti i moduli di calcolo rimangono disaccoppiati dal DOM.
- **Anti-Sycophancy & Sobrietà Terminologica**: Zero emoji decorative in header e pulsanti (adottati esclusivamente glifi semantici aeronautici `●`, `▲`, `✕`, `‹`, `›`).
