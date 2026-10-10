# Worklog: Marker Cartografici ad Alto Contrasto e Scaling Progressivo per Zoom Dettagliato

- **Data**: 2026-10-10
- **Autore**: AI Assistant (Antigravity)
- **Ambito**: Cartografia, UI/UX, Visibilità Outdoor, Contrast Governance

---

## Contesto e Causa Radice

Dallo screenshot inviato dall'utente è emerso che a livelli di zoom intermedio/dettagliato (zoom $\ge 9.5$, vista valliva su Val Susa/Giaveno/Cumiana):
1. **Traslucenza Eccessiva dei Marker**: `.gm-map-dot-marker` adottava `background: rgba(..., 0.32)`. Con una trasparenza del 68%, la tessitura orografica chiara dei tile topografici (curve di livello, rilievo chiaro, vegetazione verde chiaro) traspariva attraverso il corpo del marker, facendolo dissolvere completamente.
2. **Assenza di Casing di Contrasto (Boundary Inversion)**: Il bordo era sottile (2px) e dello stesso colore di stato (es. verde `#22c55e` su montagne verdi, giallo `#eab308` su declivi chiari), privo di linea bianca o scura di contrasto.
3. **Glifi Omocromatici**: I simboli geometrici interni (`●`, `▲`, `✕`) erano colorati con la stessa tinta del bordo su sfondo trasparente, generando un rapporto di contrasto vicino a 1:1 contro i rilievi.
4. **Ombra Attenuata**: Su tile chiari o in modalità luce, `box-shadow` era debole e veniva ulteriormente ridotto in `[data-theme="light"]`.

---

## Interventi Implementati

### 1. Riprogettazione Marker Circolari ad Alto Contrasto (`css/theme.css`)
- **Riempimento Solido Opaco (100% Saturation)**:
  - Volabile: `var(--gm-status-flyable, #22c55e)` solido.
  - Cautela: `var(--gm-status-caution, #eab308)` solido.
  - Non Volabile: `var(--gm-status-unflyable, #ef4444)` solido.
  - Severo: `#18181b` solido.
  - Non Disponibile: `#64748b` solido.
- **Doppia Casing Boundary (Aeronautical Waypoint)**:
  - Bordo interno bianco puro: `border: 2.5px solid #ffffff;`.
  - Anello esterno scuro + ombra profonda: `box-shadow: 0 3px 8px rgba(0, 0, 0, 0.65), 0 0 0 1.5px rgba(0, 0, 0, 0.35);`. Garantisce contrasto assoluto sia su tile chiari (dove agisce l'ombra esterna) sia su tile scuri o satellitari (dove stacca il bordo bianco).
- **Glifi con Contrasto Calcolato**:
  - Volabile / Non Volabile: glifi bianco puro `#ffffff` con ombra sottile (`text-shadow: 0 1px 2px rgba(0,0,0,0.5)`).
  - Cautela: glifo scuro `#0f172a` su fondo ambra per contrasto WCAG AA $\ge 4.8:1$.
- **Spot Attivo / Osservato (`.gm-map-dot-focused`)**:
  - Doppia corona luminosa beacon: `box-shadow: 0 0 0 3px #ffffff, 0 0 0 6px var(--gm-accent, #38bdf8), 0 4px 16px rgba(0, 0, 0, 0.75);`.
  - Tag fluttuante con nome dello spot (`.gm-map-focused-name-tag`) ad aggancio superiore con sfondo antracite solido `rgba(15, 23, 42, 0.94)`.

### 2. Scaling Progressivo in Base allo Zoom (`ui/map/mapEngineAdapter.js`)
- Rilevazione del tier di zoom (`zoomTier: standard | detailed`, soglia zoom 9.5).
- **Zoom Standard (< 9.5)**: diametro 28px (`iconSize: [28, 28]`, anchor `[14, 14]`).
- **Zoom Dettagliato ($\ge 9.5$)**: diametro 34px (`iconSize: [34, 34]`, anchor `[17, 17]`), classe `.gm-map-dot-detailed` con glifo maggiorato a `0.95rem` per massima leggibilità a colpo d'occhio.
- Integrazione di `zoomTier` nella firma di cache `signature` di `renderOverlays` per aggiornare deterministicamente il ridimensionamento al pan/zoom.
- Sincronizzazione Canvas mode: raggio scalato (9px/11px standard, 13px/15px focused), bordo bianco `color: '#ffffff'` con spessore 2.5px/3.5px e `fillOpacity: 1.0`.

### 3. Rimozione Override Depotenzianti in Tema Luce (`css/theme.css`)
- Rimossa la soppressione dell'ombra da `[data-theme="light"] .gm-map-dot-marker`. I marker cartografici vivono sul layer raster e devono mantenere la propria autosufficienza di contrasto indipendentemente dal tema dell'app.

---

## Verifiche di Qualità

- **Test Automatizzati**: Eseguito `npm test` con **543/543 test passati** su 87 suite.
- **Nuovo Test Dedicato**: Aggiunto caso in `tests/ui/spotMapView.test.mjs` che convalida il rendering ad alto contrasto, il ridimensionamento a 34px per zoom $\ge 9.5$ e il tag del nome dello spot osservato.
- **Ergonomia Outdoor**: Pavimento touch floor $\ge 48\times 48\text{px}$ garantito tramite pseudo-elemento `::before`.
