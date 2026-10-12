# ADR / Worklog: Rimozione Freccia Azimutale e Badge Gradi nel Settore di Esposizione Decollo

**Data**: 2026-10-12  
**Autore**: Antigravity  
**Ambito**: UI / Cartografia 2D / mapEngineAdapter / Ergonomia Visiva Outdoor

---

## 1. Contesto e Problema Riscontrato
Nel marker cartografico dell'esposizione del decollo (`generateTakeoffSectorSvg` in `ui/map/mapEngineAdapter.js`), visibile sia nella mini-mappa contestuale delle previsioni sia nella mappa comprensorio a schermo intero:
1. **Sovraffollamento Cartografico (Visual Clutter)**: Oltre al cuneo ad arco di 70° (`path.wedge`) che già definisce in modo chiaro e immediato l'orientamento e l'apertura del decollo, venivano disegnati una linea centrale con freccia direzionale (`line.line` e `polygon.arrow`) e un badge scuro esterno con il valore numerico dei gradi (`170°`).
2. **Interferenza con Altri Elementi Geodesici e Ortofoto**: La freccia e il badge dei gradi si estendevano oltre il raggio del settore, coprendo dettagli dell'orografia, strade, centri abitati e intersecandosi con la linea di planata geodesica verso l'atterraggio.

---

## 2. Decisione Architetturale e Design
1. **Semplificazione Visiva (Occam's Razor & Prägnanz)**:
   - Aggiornata la funzione `generateTakeoffSectorSvg` in `ui/map/mapEngineAdapter.js` impostando `showArrow: false` e `showBadge: false` come comportamento predefinito.
   - Il marker renderizza esclusivamente il cuneo di lancio a 70° (`path.wedge`), il cerchio centrale (`circle.hub` con triangolo `▲`) e l'indicazione altimetrica (`${altitude}m`), garantendo pulizia visiva assoluta.
   - Mantenuto il supporto opzionale a `showArrow` e `showBadge` tramite l'oggetto `options` per massima flessibilità futura.

---

## 3. Impatti e Verifica
- **File Modificati**:
  - `ui/map/mapEngineAdapter.js`: `generateTakeoffSectorSvg` omette freccia e badge numerico di default.
  - `tests/ui/mapTakeoffSector.test.mjs`: verificato che il rendering SVG di default non contenga `test-to-line`, `test-to-arrow` e `test-to-badge`, aggiungendo un test separato per il rendering condizionale su richiesta.
- **Esito Test Suite**: 714 test eseguiti (124 suite), 713 passanti, 0 falliti, 1 skipped (100% verde).
