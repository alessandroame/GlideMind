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
1. **Colonna Sinistra (Display Metrica Statico)**:
   - **Larghezza**: fissa `85px` - `100px` con bordo separatore sottile a destra (`border-r: 1px solid var(--gm-border)`).
   - **Etichetta Superiore**: maiuscola, grassetto, corpo `0.70rem`, colore di accento semantico (`var(--gm-accent)` o colore di categoria).
   - **Valore Primario**: evidenziato ad alta leggibilità outdoor (font-size `1.25rem` - `1.5rem`, `font-weight: 800`, colore ad alto contrasto `var(--gm-text-primary)`).
   - **Unità di Misura**: affiancata o immediatamente sotto il valore (`km/h`, `m slm`, `J/kg`, `EDR`).
   - **Sub-badge / Metrica Secondaria**: icona funzionale + grandezza correlata (es. `14 S` per raffiche e direzione del vento, `AGL +817m` per la base nubi, o classe di stabilità).
   - **Sincronizzazione Reattiva**: si aggiorna in tempo reale (`< 50ms`) al trascinamento dello scrubber orario.

2. **Colonna Destra (Canvas Grafico SVG Puro)**:
   - **Sfondo**: trasparente, poggia direttamente sulla superficie della card (nessun contenitore interno `.gm-chart-box` con bordi aggiuntivi).
   - **Tracciato**: curve continue cubiche Monotone Bézier / Catmull-Rom (`buildSmoothPath`), spessore linea $\ge 2.2\text{px}$, linecap `round`.
   - **Campitura Sfumata**: area sottostante la curva con gradiente semitrasparente (`opacity: 0.12 - 0.20`) per immediata percezione del volume.
   - **Asse Y**: posizionato sul bordo sinistro a filo del separatore, con soli valori numerici essenziali (0, 10, 20, 30).
   - **Asse X**: marcatori orari discreti (08, 11, 14, 17, 20).
   - **Marker Ora Attiva**: linea verticale tratteggiata sottile e pallino pieno centrato sulla curva.

---

## 2. Blacklist Ergonomica (Anti-Pattern Banditi)

Per preservare il rapporto dati-inchiostro e azzerare l'affaticamento visivo:

1. **Divieto di Tripla Duplicazione (No Echo Effect)**:
   - È vietato ripetere lo stesso valore sia nel titolo della card, sia nel tooltip fluttuante dello scrubber, sia nella riga descrittiva in calce.
   - Il display a sinistra è l'**Unica Sorgente di Verità Visiva (Single Source of Truth)** per il valore dell'ora attiva.
2. **Divieto di Testo Ostruente dentro il Canvas SVG**:
   - È vietato disegnare etichette testuali fluttuanti (es. `<text>4 km/h</text>`, `<text>Base: 1817m</text>`) che coprono la curva nel punto attivo.
   - È vietato stampare stringhe descrittive (es. `"Rischio (800)"`, `"Attenzione (300)"`) a metà del grafico che tagliano o collidono con le linee dei dati. Le soglie di sicurezza sono linee tratteggiate discrete.
3. **Divieto di Over-Boxing (Max 1 Livello di Contenimento)**:
   - Una card grafica possiede un unico bordo perimetrale (`.gm-trend-card`).
   - È vietato inserire box scuri annidati (`.gm-chart-box`) dentro la card.
4. **Divieto di Footer Descrittivi Verbosi**:
   - Non inserire righe di testo descrittive in calce al grafico (es. `"Ore 20:00: 4 km/h (raffica 6 km/h)"`), che sottraggono spazio verticale utile al viewport mobile.
