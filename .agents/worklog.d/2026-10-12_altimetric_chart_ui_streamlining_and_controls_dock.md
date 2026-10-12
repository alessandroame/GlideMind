# Riorganizzazione Ergonomica del Grafico Telemetrico: Dock Unificata, Ticker HUD a Riga Singola e Smoothing Multi-Canale

- **Data**: 2026-10-12
- **Ambito**: UI / UX, Grafico Telemetrico, Controlli Interattivi, Design System (`ui/views/FlightDetailSheet.js`, `css/theme.css`)
- **Autore**: Alessandro Amé (Pair programming con Antigravity)

---

## Contesto & Diagnosi

A valle dell'audit UI/UX su `FlightDetailSheet.js`, il grafico telemetrico e i suoi controlli presentavano diverse criticità di ergonomia e affollamento visivo:
1. **Vertical Bloat e Dispersione dei Controlli**: I pulsanti per l'attivazione dei canali telemetrici (`Quota`, `Vario`, `Velocità`) e i comandi di zoom (`+`, `-`, `Reset`) occupavano due righe distinte con stili non allineati al design system dell'app, sottraendo circa 130px di altezza utile al tracciato su dispositivi mobili.
2. **HUD di Ispezione Sovradimensionato**: Il pannello HUD di ispezione statica (`.gm-telemetry-hud`) si presentava come una card pesante alta 60px con etichette ridondanti e bordi opachi, causando un vistoso "salto" di layout tra stato di riposo e stato di scrub attivo.
3. **Collisione Spaghetti-Chart dei Canali**: La curva di velocità al suolo (0-70 km/h) e la curva del variometro (-6 / +6 m/s) venivano tracciate direttamente sopra il profilo altimetrico senza bande verticali protette né filtraggio anti-rumore, generando sovrapposizioni indecifrabili ("spaghetti chart").
4. **Collisione Badges Termiche e Inversioni**: I marker verticali delle termiche (`T1..Tn`) e delle spendolate (`nP`) calcolavano lo scostamento Y tramite semplice alternanza binaria modulo 2, provocando sovrapposizioni e testo illeggibile in corrispondenza di manovre ravvicinate (es. `T3/T4`, `T5/3P/T6`, `12P/3P/3P`).
5. **Legenda Dispersiva a 8 Righe**: La legenda inferiore elencava 8 righe di testo statico occupando spazio verticale prezioso senza fornire un'indicazione sintetica dell'intensità variometrica.

---

## Interventi Eseguiti

1. **Dock Unificata dei Controlli (`.gm-telemetry-toolbar`)**:
   - Accorpati i controlli dei canali e i comandi di zoom in un'unica barra orizzontale a dock (`.gm-telemetry-toolbar`) con layout flex `justify-between` e `gap: 8px`.
   - Introdotto il gruppo a pillola `.gm-telemetry-segmented-dock` per i canali (`Quota`, `Vario`, `Velocità`), con dot semantico integrato (`.dot-alt`, `.dot-vario`, `.dot-speed`) e stato attivo ad alto contrasto.
   - Introdotto il gruppo compatto `.gm-telemetry-zoom-dock` per i pulsanti di zoom (`-`, indicatore percentuale `1.0x`, `+`, `Reset`), garantendo touch target conformi Fitts ($\ge 44\text{px}$).

2. **Ticker HUD Compatto a Riga Singola (`.gm-telemetry-hud-ticker`)**:
   - Ridisegnato l'HUD come una striscia orizzontale snella a riga singola (altezza $\le 36\text{px}$) con `overflow-x: auto` e `backdrop-filter: blur(12px)`.
   - Raggruppate le letture chiave (Tempo, Quota MSL, Vario colorato dinamicamente per salita/discesa, Velocità km/h ed eventuale Evento/Manovra) con etichette compatte e separatori sottili.

3. **Bande Protette e Smoothing Tri-Puntuale per Vario e Velocità**:
   - In `generateAltimetricChartSvg`, applicata una media mobile a 3 campioni (`(v[i-1] + v[i] + v[i+1]) / 3`) sia per il variometro che per la velocità al suolo, eliminando il rumore ad alta frequenza tipico dei sensori GPS/baro.
   - Confinata la curva di velocità al suolo nella fascia inferiore 38% del grafico ($padTop + 0.62 \cdot H \to padTop + H$), evitando qualsiasi intersezione con il profilo altimetrico.
   - Confinato il variometro nella fascia inferiore 58% con asse di zero tratteggiato discreto (`#64748b`).

4. **Algoritmo Non-Colliding a 3 Corsie per i Marker di Termica e Inversione**:
   - Implementato un algoritmo greedy basato su corsie orizzontali (`laneRightBounds = [-999, -999, -999]`) con spaziatura minima di 48px:
     - Ogni badge calcola la sua coordinata $X$ e viene assegnato alla corsia disponibile più bassa che non provochi sovrapposizioni orizzontali.
     - Azzerate categoricamente le collisioni tra badge vicini (es. `T5`, `3P`, `T6`).

5. **Legenda Compatta a Riga Singola con Gradiente Variometrico**:
   - Sostituita la tabella a 8 righe con `.gm-vario-legend-compact`:
     - Barra a gradiente continuo orizzontale da discesa forte (`#ef4444`, -5 m/s) a neutro (`#64748b`, 0 m/s) e salita forte (`#10b981`, +5 m/s).
     - Chip compatte per Termica (`T`), Inversioni (`P`), Velocità e Quota.

---

## Verifiche e Collaudi

- **Suite Test Unitari & Integrazione**:
  - `tests/ui/flightDetailSheet.test.mjs`: 24/24 test superati, inclusi i contratti di render, zoom, pan, selezione canali e HUD.
  - Test suite complessiva: **686 passati, 0 falliti, 1 saltato**.
- **Governance Shift-Left**: Verificati e soddisfatti i 5 Gate architetturali (Headless Core, Storage Abstraction, Novice Pilot Spec, Laws of UX Ergonomic Floor $\ge 44\text{px}$, Sobrietà e zero emoji decorative).
