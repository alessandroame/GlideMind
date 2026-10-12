# Worklog: Icon-Only Map Layer Toggle con Sfera Wireframe, Vetta di Montagna e Sfumatura Radiale Soffice

**Data**: 2026-10-12  
**Autore**: Antigravity  
**Ambito**: Cartografia, UI / Ergonomia Mobile (HMI), Icon Design

---

## 1. Contesto & Obiettivo
In risposta al feedback dell'utente:
1. **Rifinitura Icona Topo (Vetta di Montagna Alpina)**:
   - Sostituita la precedente geometria con una silhouette scultorea di vetta alpina innevata con nevaio a doppio arco perfettamente simmetrico (`M12 2.5L2.5 20.5h19L12 2.5z` e `M6.8 12.5L9.5 14.5L12 12.2L14.5 14.5L17.2 12.5`).
   - Allineamento geometrico rigoroso con la sfera wireframe 3D: spessore tratto 1.8px con terminali raccordati (`stroke-linecap="round"`), bounding box $19\times 18\text{px}$ centrato nella viewbox 24x24 per un'invarianza del baricentro ottico durante l'alternanza dei layer.
2. **Sfumatura Radiale: Da Completamente Trasparente Intorno a Meno Trasparente al Centro**:
   - Eliminazione completa di `backdrop-filter: blur(4px)`: la sfocatura applicata a un elemento circolare produce un disco opaco con confine perimetrale netto (effetto lente rigida).
   - Impostazione di un gradiente radiale continuo che raggiunge il 100% di trasparenza (`transparent`) già al 95% del raggio, estinguendosi completamente prima del bordo perimetrale dell'elemento.
   - Centro "meno trasparente" (semi-opaco 0.65 scuro su satellite / 0.75 luminoso su topo) per garantire contrasto e leggibilità del tratto SVG senza creare blocchi invasivi.
   - Rimozione delle classi rettangolari `.gm-map-ctrl-btn` e `.gm-flight-analysis-ctrl-btn` dai pulsanti toggle di `SpotMapView` e `ForecastView` con regole CSS protette `!important` per immunizzare i bottoni circolari da bordi, ombre e sfondi solidi.
3. **Presidio Ergonomico (Fitts's Law)**:
   - Pseudo-elemento invisibile `::before` a pavimento $\ge 48\times 48\text{px}$ per garantire usabilità sul campo con guanti e all'aperto.

---

## 2. File Modificati
- `ui/map/mapEngineAdapter.js`: Aggiornato `renderLayerToggleIcon(layerId, size = 20)` con la geometria simmetrica della vetta alpina con nevaio.
- `ui/views/SpotMapView.js`: Rimossa la classe `.gm-map-ctrl-btn` dal bottone `#gm-map-layer-toggle`.
- `ui/views/ForecastView.js`: Rimossa la classe `.gm-flight-analysis-ctrl-btn` dal bottone `#forecast-flight-analysis-layer-toggle`.
- `css/theme.css`: Ridisegnata la sfumatura radiale (perimetro trasparente, centro semitrasparente, rimozione del blur filter) su tutti i selettori toggle mappa e mini-mappa.
- `MEMORY.md`: Aggiornata la Lezione 136.

---

## 3. Verifica e Governance
- Suite globale eseguita con successo: **122 suite, 700 test passati, 0 fallimenti, 1 saltato**.
- Tutti i quality gate architetturali Shift-Left verificati e superati.
