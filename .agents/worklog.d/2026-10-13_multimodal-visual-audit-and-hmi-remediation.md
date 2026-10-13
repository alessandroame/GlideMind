# ADR & Worklog: Audit Visivo Multi-Modale & Bonifica Ergonomica HMI

- **Data**: 2026-10-13
- **Stato**: Consolidato
- **Obiettivo**: Esecuzione completa dell'audit visivo multimodale a piena altezza (`scripts/run-full-audit-capture.mjs`) e bonifica sistematica dei difetti ergonomici (Laws of UX P1-P2) individuati su 29 schermate reali di GlideMind.

---

## 1. Contesto & Diagnosi

A seguito delle indicazioni dell'utente, l'audit visivo è stato esteso per coprire l'intera altezza scorrevole delle viste (full-length scroll capture via CDP con altezze fino a 2676px) e lo stato aperto di tutti i controlli espandibili (menu tema, selettore 14 giorni, schede aerologia vento/sounding aperte, aim menu overlay, drawer importazione).
Dall'ispezione multimodale delle 29 schermate ad alta risoluzione in `docs/audit-screenshots/` sono emersi i seguenti punti di frizione:
1. **[P1-1 & P1-4] Target Tattili Sottodimensionati**: Pillola del selettore tema, pulsanti di chiusura banner e pulsanti canali/zoom telemetrici con altezze fisiche inferiori al pavimento di 48px.
2. **[P1-5 & P2-5] Logbook Resilience**: Protezione cancellazione volo e guarigione automatica di `sparklineSvgPoints` in `saveFlight`.
3. **[P2-1 & P2-2] Clearance Inferiore & Troncamenti**: Bottom clearance mobile (`.gm-safe-bottom-pad`), ampiezza etichette subspot comprensorio e compressione responsive del ticker HUD telemetrico su schermi 390px.
4. **[P2-3, P2-4, P2-6] Contrasto Sunlight, Grafico Mensile & Lessico Principiante**: Contrasto testo attenuato in modalità luce solare (`--gm-text-muted: #475569`), eliminazione della sovrapposizione tra ore di volo e conteggio voli nel grafico mensile, e traduzione esplicita degli acronimi 3D (`Quota Max`, `Dinamica [N]`, `Termica [N]`).

---

## 2. Decisioni & Interventi Implementati

1. **Ergonomia Tattile con Pseudo-Elementi (`css/theme.css`)**:
   - Introdotti pseudo-elementi `::before` con `min-width: var(--gm-touch-min, 48px)` e `min-height: var(--gm-touch-min, 48px)` su `.gm-telemetry-btn`, `.gm-telemetry-zoom-btn` e `.gm-theme-menu-trigger`.
   - Assegnato pavimento `min-height: 48px; min-width: 48px;` ai pulsanti dei banner di avviso e undo.
2. **Auto-Guarigione Sparkline (`core/logbookDb.js`)**:
   - In `saveFlight(meta, raw)`, se `meta.sparklineSvgPoints` è assente o vuota, viene calcolata dinamicamente dai punti traccia `raw.decimatedPoints` o `raw.flightPoints`.
3. **Clearance Mobile & Anti-Troncamento (`css/theme.css`)**:
   - Aggiunta utility `.gm-safe-bottom-pad` vincolata a `@media (max-width: 768px)` con `padding-bottom: calc(var(--gm-nav-height-mobile, 64px) + env(safe-area-inset-bottom, 16px) + 24px) !important;`.
   - Portata l'ampiezza massima di `.gm-unified-subspot-badge` da 220px a `min(340px, 80vw)`.
   - Aggiunta media query per `<= 480px` su `.gm-telemetry-hud-ticker` con `padding: 5px 8px; gap: 6px; font-size: 0.72rem;` per azzerare il clipping orizzontale a 390px.
4. **Risoluzione Collisione Etichette SVG Doppio Asse (`ui/views/LogbookStatsView.js`)**:
   - Pre-calcolate le posizioni dei dati per ciascun mese; se $|y_{\text{bar}} - y_{\text{point}}| < 16\text{px}$, l'etichetta dell'elemento superiore viene posizionata sopra ($y - 6$) e quella dell'elemento inferiore sotto ($y + 11$), garantendo almeno 9px di separazione netta.
5. **Lessico Esplicito Pilota Principiante (`core/flightTelemetry.js`)**:
   - Sostituite le sigle `D#`, `Max Q` e `T#` con `Dinamica [N]`, `Quota Max` e `Termica [N]`.
6. **Miglioramento Contrasto Sunlight Mode (`css/theme.css`)**:
   - `--gm-text-muted` aggiornato a `#475569` (Slate-600, contrasto $\ge 6.5:1$ in modalità luce).
   - Impostata opacità `0.75` per `.gm-timeline-col-compact.is-past` in light mode.

---

## 3. Verifica & Esito

- **Automated Test Suite**: 750 test passati al 100% su 129 suite (`npm test`).
- **Visual Re-Capture**: Suite CDP rigenerata con successo su 29 schermate full-length ad alta risoluzione in `docs/audit-screenshots/`.
