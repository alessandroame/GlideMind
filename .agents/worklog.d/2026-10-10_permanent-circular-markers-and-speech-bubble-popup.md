# Worklog: Marker Circolari Permanenti e Fumetto Informativo al Tap su Mappa Comprensori

- **Data**: 2026-10-10
- **Autore**: Antigravity Agent
- **Modulo**: `ui/map/mapEngineAdapter.js`, `ui/views/SpotMapView.js`, `css/theme.css`, `tests/ui/spotMapView.test.mjs`

---

## 1. Contesto & Diagnosi
L'utente ha condiviso uno screenshot della mappa con i marker circolari compatti (anello colorato, fill semitrasparente e glifo avionico: verde con `●`, giallo con `▲`, rosso con `✕`) e ha prescritto:
1. Mantenere sempre i marker circolari con questo stile invariante a tutti i livelli di zoom, eliminando la transizione a banner rettangolari ingombranti (aureole e micro-vettori di decollo/atterraggio).
2. All'interazione (tap/click) sul marker, visualizzare un fumetto (`L.popup`) ancorato sopra il marker riportante il nome dello spot, lo stato di volabilità e i dati sintetici, anziché forzare l'apertura immediata della bottom sheet modale a pieno schermo.

---

## 2. Decisioni Tecniche & Implementazione

### 2.1 Marker Circolari Semantici Invarianti (`ui/map/mapEngineAdapter.js`)
- Rimosso il branching a 3 livelli di zoom (`< 7.5` dot, `7.5-8.9` aureole, `>= 9.0` micro-vettori) da `LeafletMapEngine.renderOverlays`.
- Configurato il rendering uniforme del disco avionico da 26px (`iconSize: [26, 26]`, `iconAnchor: [13, 13]`, `popupAnchor: [0, -14]`) con classi `.gm-status-flyable`, `.gm-status-caution`, `.gm-status-unflyable`, `.gm-status-severe`, `.gm-status-unavailable`.
- Aggiunta guardia anti-thrashing con calcolo della firma di stato (`signature`) per preservare il DOM dei marker e i popup aperti durante il pan e lo zoom della mappa.
- Aggiornato `HeadlessMockMapEngine` per impostare deterministicamente `this.renderedMode = 'circular'`.

### 2.2 Fumetto Informativo al Tap (`L.popup` / `gm-leaflet-popup`)
- Ogni marker associa un popup nativo Leaflet (`marker.bindPopup`) con classe personalizzata `.gm-leaflet-popup`.
- Contenuto del fumetto:
  - Nome dello spot in evidenza (`.gm-map-popup-name`).
  - Badge geometrico di volabilità (`.gm-map-popup-badge`).
  - Località, provincia e quota altimetrica decollo (`.gm-map-popup-meta`).
  - Pulsante secondario ("Scheda Spot ›") per consentire l'apertura mirata del cassetto dettagliato (`openSheet`).
- Disaccoppiata la logica di focus dal click della scheda: il tocco sul marker aggiorna la selezione oraria e lo store (`handleSpotFocus`), mentre l'apertura della bottom sheet avviene esclusivamente su richiesta esplicita dell'utente tramite il pulsante nel fumetto o il pill dello spot nello scrubber.
- Aggiunti i metodi `openSpotPopup(spotId)` e `closeSpotPopup()` sia a `LeafletMapEngine` che a `HeadlessMockMapEngine`.

### 2.3 Ergonomia e Stile Dual Theme (`css/theme.css`)
- Stile fumetto responsive per tema scuro Cockpit (`var(--gm-bg-card)`, bordi definiti, ombra aeronautica ad alto contrasto) e tema chiaro (`[data-theme="light"]`).
- Pavimento tattile $\ge 46\text{px}$ tramite pseudo-elemento invisibile `.gm-map-dot-marker::before` (`top: -10px; bottom: -10px; left: -10px; right: -10px`) in conformità con la Fitts's Law e le regole di ergonomia outdoor.

---

## 3. Verifica e Test di Governance
- `npm test`: 401 test eseguiti, 401 passati, 0 falliti.
- Tutti gli Shift-Left Quality Gates (Gate 1..Gate 5) superati con successo.
