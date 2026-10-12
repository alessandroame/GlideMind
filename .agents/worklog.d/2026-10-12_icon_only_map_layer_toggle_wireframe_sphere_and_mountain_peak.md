# Worklog: Controlli Mappa con Sfumatura Radiale Soffice (Layer Toggle, Expand & Aim Trigger)

**Data**: 2026-10-12  
**Autore**: Antigravity  
**Ambito**: Cartografia, UI / Ergonomia Mobile (HMI), Icon Design

---

## 1. Contesto & Obiettivo
In risposta al feedback dell'utente:
1. **Rifinitura Icona Topo (Vetta di Montagna Alpina)**:
   - Sostituita la precedente geometria con una silhouette scultorea di vetta alpina innevata con nevaio a doppio arco perfettamente simmetrico (`M12 2.5L2.5 20.5h19L12 2.5z` e `M6.8 12.5L9.5 14.5L12 12.2L14.5 14.5L17.2 12.5`).
   - Allineamento geometrico rigoroso con la sfera wireframe 3D: spessore tratto 1.8px con terminali raccordati (`stroke-linecap="round"`), bounding box $19\times 18\text{px}$ centrato nella viewbox 24x24 per un'invarianza del baricentro ottico durante l'alternanza dei layer.
2. **Sfumatura Radiale: Da Trasparente sui Bordi a Meno Trasparente al Centro**:
   - Eliminazione completa di `backdrop-filter: blur(4px)`: la sfocatura applicata a un elemento circolare produce un disco opaco con confine perimetrale netto (effetto lente rigida).
   - Impostazione di un gradiente radiale continuo che raggiunge il 100% di trasparenza (`transparent`) già al 95% del raggio, estinguendosi completamente prima del bordo perimetrale dell'elemento.
   - Centro "meno trasparente" (semi-opaco 0.65 scuro su satellite / 0.75 luminoso su topo) per garantire contrasto e leggibilità del tratto SVG senza creare blocchi invasivi.
   - Rimozione delle classi rettangolari `.gm-map-ctrl-btn` e `.gm-flight-analysis-ctrl-btn` dai pulsanti toggle di `SpotMapView` e `ForecastView` con regole CSS protette `!important` per immunizzare i bottoni circolari da bordi, ombre e sfondi solidi.
3. **Estensione della Sfumatura al Menu Puntamento (Aim / Mirino)**:
   - Applicata la medesima finitura visiva borderless con sfumatura radiale al trigger del menu mirino/puntamento (`.gm-aim-menu-trigger`), eliminando la capsula bianca opaca con bordo e ombra.
   - Sagoma a pillola ergonomica ($36\text{px}$ altezza), sincronizzazione dinamica dell'attributo `data-layer` al cambio cartografia e pavimento di tocco Fitts $\ge 48\times 48\text{px}$.
4. **Inversione Cromatica Unificata (Icone Bianche su Sfumatura Nera)**:
   - Su esplicita richiesta utente, uniformati tutti i controlli flottanti su cartografia (`.gm-map-layer-toggle`, `.gm-replay-layer-toggle`, `.gm-aim-menu-trigger`, `.gm-mini-map-layer-toggle`, `.gm-mini-map-expand-btn`):
     - Icone rigorosamente bianche (`#ffffff` / `stroke="currentColor"`).
     - Sfumatura sottostante nera profonda (`rgba(0, 0, 0, 0.70)` al centro, decadimento continuo a 40% e 70%, dissolvenza completa `transparent 95%` al perimetro).
     - Applicata uniformemente su qualsiasi mappa (Topo, Satellite, Dark, Light theme) eliminando la sfumatura chiara per garantire contrasto e leggibilità massimi.
5. **Adozione Icone Opzione 2 (GIS & Navigazione Moderna)**:
   - Su preferenza espressa dall'utente, integrate le nuove icone vettoriali:
     - **Satellite**: Globo terrestre geografico (`r=7.5`) con anello orbitale ellittico inclinato (`rotate(-30)`) e satellite in orbita (`circle r=1.3 fill="currentColor"`).
     - **OpenTopo**: Mappa cartografica a 3 sezioni/pieghe (folded map) con piegature verticali e isoipsa orografica interna.
   - Tratto pulito (1.8px), terminazioni raccordate (`round`), bilanciamento ottico centrato a $24\times 24\text{px}$.
6. **Presidio Ergonomico (Fitts's Law)**:
   - Pseudo-elemento invisibile `::before` a pavimento $\ge 48\times 48\text{px}$ su tutti i controlli flottanti per garantire usabilità sul campo con guanti e all'aperto.

---

## 2. File Modificati
- `ui/map/mapEngineAdapter.js`: Aggiornato `renderLayerToggleIcon(layerId, size = 20)` con le nuove geometrie dell'Opzione 2 (Globo con anello orbitale per Satellite e Mappa a 3 pieghe con isoipsa per OpenTopo).
- `ui/views/SpotMapView.js`: Sincronizzazione `data-layer` su `#gm-map-aim-trigger` e rimozione classe rigida da `#gm-map-layer-toggle`.
- `ui/views/ForecastView.js`: Sincronizzazione `data-layer` su `.gm-aim-menu-trigger` e rimozione classe rigida da `#forecast-flight-analysis-layer-toggle`.
- `css/theme.css`: Ridisegnata la sfumatura radiale nera profonda con icone bianche pure per tutti i controlli mappa (toggle layer, expand mini-mappa e trigger mirino), azzerati blur e bordi.
- `MEMORY.md`: Aggiunta Lezione 141 (Uniform High-Contrast Scrim).

---

## 3. Verifica e Governance
- Suite globale eseguita con successo: **124 suite, 708 test passati, 0 fallimenti, 1 saltato**.
- Tutti i quality gate architetturali Shift-Left verificati e superati.


