# GlideMind UI Chart & Time-Series Ergonomics Specification (Parameteo Standard)

Questo documento definisce il contratto architetturale ed ergonomico per i grafici temporali (serie storiche orarie) in GlideMind, ispirato allo standard di pulizia visiva e alto rapporto dati-inchiostro di Parameteo.

---

## 1. Il Blueprint Architetturale Side-by-Side (2 Colonne)

Ogni riga di serie temporale (`.gm-trend-card.gm-trend-card-side-by-side`) adotta una struttura a due colonne orizzontali senza annidamento di box interni:

```
+--------------------------------------------------------------------------+
|  COLONNA SINISTRA (85-100px)   |      COLONNA DESTRA (FLUIDA 1fr)        |
|                                |                                         |
|  [ETICHETTA METRICA]           |  |                                      |
|  VALORE NUMERICO GIGANTE       |  |     CURVA SPLINE BÉZIER CONTINUA     |
|  Unità di Misura               |  |     (Nessun testo o box interno)     |
|  Badge Secondario / Direzione  |  |                                      |
|                                |  +------------------------------------  |
|                                |    08      11      14      17      20   |
+--------------------------------------------------------------------------+
```

### Specifiche di Dettaglio delle Colonne:
1. **Colonna Sinistra (Display Metrica Statico + Corrispondenza 1:1 Serie/LED)**:
   - **Larghezza**: fissa `98px` - `108px` con bordo separatore sottile a destra (`border-r: 1px solid var(--gm-border)`).
   - **Etichetta Superiore + Chevron Espansione**: maiuscola, grassetto, corpo `0.62rem`, colore di accento semantico (`var(--gm-accent)`), affiancata dall'indicatore direzionale `.gm-trend-expand-icon` per segnalare l'espansione verticale al tocco.
   - **Corrispondenza 1:1 Serie e Indicatori LED (`.gm-series-led`)**:
     - Ogni serie rappresentata nel grafico SVG (curva primaria, curva secondaria tratteggiata o istogramma a barre) DEVE esporre nel pannello di sinistra il proprio valore corrispondente all'istante selezionato (`selectedHour`).
     - Ogni valore nel pannello di sinistra DEVE essere preceduto da un indicatore visivo "LED" (`.gm-series-led`, `.gm-series-led-dashed`, `.gm-series-led-bar`) dello stesso colore della linea/barra corrispondente nel grafico.
   - **Valore Primario**: evidenziato ad alta leggibilità outdoor (font-size `1.25rem` - `1.35rem`, `font-weight: 800`, colore ad alto contrasto `var(--gm-text-primary)`).
   - **Unità di Misura**: affiancata o immediatamente sotto il valore (`km/h`, `m slm`, `J/kg`, `EDR`, `E`, `%`).
   - **Sub-badge / Serie Secondaria**: LED della seconda serie + grandezza correlata per l'ora attiva (es. raffica + direzione del vento, quota max termica + AGL per la base cumulo, salita termica `m/s` per la turbolenza, accumulo `mm/h` per le precipitazioni).
   - **Sincronizzazione Reattiva**: si aggiorna in tempo reale (`< 50ms`) al trascinamento dello scrubber orario.

2. **Colonna Destra (Canvas Grafico SVG Puro, Soglie e Sezionamento Volabilità)**:
   - **Altezza Ibrida & Tap-to-Expand (`toggle-trend-chart`)**:
     - Altezza base compatta maggiorata (`H = 108` unità SVG, `114` con heatmap) per garantire un'escursione verticale leggibile delle curve lungo la giornata.
     - Al tap sulla card (`.gm-trend-card-side-by-side`), il grafico si espande verticalmente in-place (`H = 176` unità SVG, classe `.expanded`), mostrando griglia Y aggiuntiva e le etichette numeriche delle soglie a margine destro.
   - **Scala Y con Zero Fisso (`minY = 0`) e Tetto Adattivo (`maxY`)**:
     - Mantiene `minY = 0` ancorato alla base per preservare la percezione del valore assoluto, calcolando `maxY` in modo adattivo appena sopra la soglia rossa di non-volabilità e il picco giornaliero (`Math.max(redLimit * 1.15, peakDayValue * 1.15)`), evitando spazio morto sopra le curve.
   - **Doppia Linea di Soglia Obbligatoria (Gialla + Rossa Tratteggiata)**:
     - Ogni grafico DEVE sempre tracciare sia la riga tratteggiata gialla (`var(--gm-status-caution)`) sia la riga tratteggiata rossa (`var(--gm-status-unflyable)`) rappresentanti le soglie operative di volabilità.
   - **Sezionamento Orizzontale/Orario di Sfondo (`.gm-chart-zone-band`)**:
     - Gli slot orari in cui il parametro supera la soglia gialla o rossa (o scende sotto i minimi di sicurezza per la Base Cumulo) sono evidenziati sullo sfondo da una tendina verticale semitrasparente (`<path class="gm-chart-zone-band gm-chart-zone-caution|unflyable">`, `opacity: 0.08–0.09`).
   - **Marker Ora Attiva**: linea verticale tratteggiata sottile e pallini centrati sia sulla curva primaria sia sulle curve secondarie.

---

## 2. Blacklist Ergonomica (Anti-Pattern Banditi)

Per preservare il rapporto dati-inchiostro e azzerare l'affaticamento visivo:

1. **Divieto di Tripla Duplicazione (No Echo Effect)**:
   - È vietato ripetere lo stesso valore sia nel titolo della card, sia nel tooltip fluttuante dello scrubber, sia nella riga descrittiva in calce.
   - Il display a sinistra è l'**Unica Sorgente di Verità Visiva (Single Source of Truth)** per i valori dell'ora attiva.
2. **Divieto di Tooltip Fluttuanti Ostruenti dentro il Canvas SVG**:
   - È vietato disegnare rettangoli/etichette testuali fluttuanti (es. `<rect>` + `<text>4 km/h</text>`) che coprono la curva nel punto attivo nella vista Side-by-Side.
   - Le etichette numeriche delle soglie (es. `18 km/h`, `26 km/h`) restano nascoste nella vista compatta e compaiono ordinatamente al margine destro solo quando la card viene espansa verticalmente al tap.
3. **Divieto di Over-Boxing (Max 1 Livello di Contenimento)**:
   - Una card grafica possiede un unico bordo perimetrale (`.gm-trend-card`).
   - È vietato inserire box scuri annidati (`.gm-chart-box` con sfondo/bordo visibile) dentro la card.
4. **Divieto di Footer Descrittivi Verbosi**:
   - Non inserire righe di testo descrittive in calce al grafico (es. `"Ore 20:00: 4 km/h (raffica 6 km/h)"`), che sottraggono spazio verticale utile al viewport mobile.
