# 🦅 GlideMind - Brand Identity, Icon & Splash Screen Plan

Documento operativo per l'implementazione dell'identità visiva, del bundle iconografico PWA e dello splash screen per **GlideMind**.

---

## 1. Riferimento Visivo di Partenza

Il punto di riferimento approvato è il mockup dello splash screen verticale (9:16) archiviato in:
👉 [`assets/brand/glidemind_splash_concept.jpg`](../assets/brand/glidemind_splash_concept.jpg)

### Elementi Costitutivi del Brand
- **Emblema Alare**: Profilo aerodinamico a tre elementi rastremati verso destra, che evoca l'ala del deltaplano/parapendio e la portanza delle correnti ascensionali.
- **Tavolozza Colori**:
  - *Fondo Primario*: `#0b0d12` (Neutral Carbon antiriflesso per visibilità outdoor).
  - *Gradiente Ambra*: Da `#fbbf24` (luce zenitale) a `#f59e0b` (ambra aeronautica primaria) e `#d97706` (ambra profonda).
  - *Bagliore Perimetrale*: `rgba(245, 158, 11, 0.25)` controllato.
  - *Tipografia Brand*: `GLIDEMIND` in `#f3f5f8` (sans-serif geometrico maiuscolo, `letter-spacing: 0.15em`).
  - *Payoff*: `FREE FLIGHT INTELLIGENCE` in `#9aa2b1` / tonalità ambrata desaturata.
  - *Trama di Sfondo*: Micro-trama geometrica a fibra di carbonio opaca.

---

## 2. Piano Operativo Dettagliato

### Fase 1: Vettorializzazione Master SVG (`assets/icons/glidemind-wing.svg`)
1. **Modellazione Geometrica Bézier**:
   - Tracciamento dei tre elementi alari con curve continue e spigoli arrotondati.
   - Proporzioni calibrate su griglia `512x512` con baricentro allineato.
2. **Definizione Shader & Filtri SVG**:
   - `linearGradient` angolato a 45° per l'effetto ottone/ambra aeronautica.
   - `filter` opzionale con `feGaussianBlur` leggero per la versione splash/display.

---

### Fase 2: Bundle Iconografico & Standard PWA Mobile
1. **Esportazione Asset**:
   - `assets/icons/favicon.svg`: master vettoriale leggero per tab del browser.
   - `assets/icons/icon-192.png`: icona standard Android (192×192px).
   - `assets/icons/icon-512.png`: icona master raster ad alta densità (512×512px).
   - `assets/icons/icon-maskable-512.png`: icona adattiva Android con padding perimetrale del 15% (safe-zone circolare 80% per prevenire troncamenti nei launcher OEM).
   - `assets/icons/apple-touch-icon.png`: formato 180×180px per iOS WebClip.
2. **Configurazione Web App Manifest**:
   - Creazione di `manifest.webmanifest` con:
     - `background_color`: `#0b0d12`
     - `theme_color`: `#0b0d12`
     - `display`: `standalone`
     - Dichiarazione icone standard e maskable.

---

### Fase 3: Splash Screen Zero-FOUC & Transizione Doherty
1. **Trama Fibra di Carbonio in CSS**:
   - Generazione della texture carbonio antiriflesso tramite pattern vettoriale CSS/radial-gradient puro a zero overhead di rete.
2. **Overlay DOM Inline in `index.html`**:
   - Markup critico inserito a livello radice prima di `#app-root`:
     - Container `#gm-splash-screen` a tutta altezza (`100dvh`, background `#0b0d12`, `z-index: 99999`).
     - Emblema alare in SVG inline centrato verticalmente (42-45% dall'alto).
     - Tipografia `GLIDEMIND` e payoff `FREE FLIGHT INTELLIGENCE`.
3. **Dismiss Sincronizzato con l'Idratazione dello Store**:
   - All'aggancio del router o completamento del boot:
     - Aggiunta classe `.gm-splash-hidden` (`opacity: 0; pointer-events: none; transition: opacity 300ms ease;`).
     - Rimozione dal DOM a 350ms, garantendo latenza inferiore a 400ms (soglia di Doherty).

---

### Fase 4: Integrazione Brand nell'Header dell'Applicazione
- In `index.html` (linee 19-23), sostituire il placeholder SVG temporaneo con la variante inline dell'emblema alare per mantenere coerenza grafica tra avvio e interfaccia attiva.

---

### Fase 5: Verifica di Conformità & Standard Visivi
- Verifica rendering su display mobile ad alto contrasto.
- Validazione safe area per icone maskable tramite conformità W3C PWA.
- Verifica assenza di flash bianco all'avvio in modalità standalone.
