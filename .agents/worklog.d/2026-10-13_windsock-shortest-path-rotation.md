# Worklog: Rotazione Continua Geodetica (Shortest Path) delle Maniche a Vento allo Scrubbing

- **Data**: 2026-10-13
- **Autore**: Antigravity Pair Programmer
- **Stato**: Completato
- **Ambito**: Cartografia UI & Headless Kinematics (`core/windsock.js`, `ui/map/mapEngineAdapter.js`, `css/theme.css`, test suites)

## 1. Contesto & Diagnosi
Durante l'uso dello scrubber orario delle previsioni (`ForecastView`), le maniche a vento vettoriali (sia decollo sia atterraggio) ruotavano talvolta compiendo un giro completo di $345^\circ$ nel senso opposto anziché percorrere la traiettoria più breve di $15^\circ$.
La causa radice risiedeva nella transizione CSS su `.gm-windsock-wrapper`:
```css
transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
```
Quando l'angolo bersaglio passava attraverso la discontinuità $0^\circ / 360^\circ$ (es. $355^\circ \to 10^\circ$), `updateWindsockMarker` assegnava al wrapper l'angolo normalizzato `k.rotation` ($10^\circ$). Il browser eseguiva un'interpolazione numerica scalare da $355$ a $10$ ($\Delta = -345^\circ$, senso antiorario), producendo una rotazione non-geodetica e innaturale.

## 2. Modifiche Architetturali & Algoritmiche
1. **Algoritmo Headless Shortest Path (`core/windsock.js`)**:
   - Creata ed esportata la funzione pura `calculateShortestRotation(currentAngle, targetAngle)`:
     ```javascript
     let diff = (target - current) % 360;
     if (diff > 180) diff -= 360;
     if (diff < -180) diff += 360;
     return current + diff;
     ```
   - Garantisce che per qualsiasi coppia di angoli lo spostamento angolare sia rigorosamente minimo ($|\Delta \theta| \le 180^\circ$).
   - Aggiunto l'attributo `data-current-rotation` al wrapper SVG iniziale in `generateWindsockSvg`.
2. **Tracciamento Angolare Continuo nell'Adapter Cartografico (`ui/map/mapEngineAdapter.js`)**:
   - Inizializzati `takeoffWindsockAngle` e `landingWindsockAngle` (e controparti di analisi volo `flightTakeoffWindsockAngle`, `flightLandingWindsockAngle`) su `LeafletMapEngine` e `HeadlessMockMapEngine`.
   - In `updateWindsockMarker`:
     - Rilevato l'angolo attuale dal motore o dal dataset del wrapper (`wrapper.dataset?.currentRotation`).
     - Calcolato l'angolo continuo unwrapped con `calculateShortestRotation(currentAngle, k.rotation)`.
     - Applicato l'aggiornamento a `wrapper.dataset.currentRotation` e `wrapper.style.transform = rotate(${nextAngle}deg)`.
     - Preservata la rigenerazione in-place dei 12 segmenti interni (`includeWrapper: false`) senza distruggere il nodo DOM animato.
   - Uniformato il medesimo comportamento anche in `updateFlightProcedures` per la vista a schermo intero.
   - Pulizia degli stati angolari nei metodi `clearOverlays` e `destroy`.

## 3. Validazione Automatizzata
- Unit test in `tests/core/windsock.test.mjs`:
  - `calculateShortestRotation()`: validati passaggi attraverso il nord ($355^\circ \to 10^\circ \implies 370^\circ$, $10^\circ \to 355^\circ \implies -5^\circ$), angoli unwrapped cumulativi ($725^\circ \to 355^\circ \implies 715^\circ$), fallback difensivi su non-finiti.
  - Verifica della presenza di `data-current-rotation` nel wrapper di `generateWindsockSvg()`.
- Test di integrazione UI in `tests/ui/forecastView.test.mjs`:
  - Verificato che lo scrubber orario della mini-mappa interpola l'angolo su percorso continuo geodetico ($355^\circ \to 370^\circ \to 355^\circ$) senza salti a ritroso.
- Test di cartografia in `tests/ui/mapTakeoffSector.test.mjs`:
  - Superati tutti i test con dual windsock indipendenti.
- Test suite globale:
  - `npm test`: 774 test passati, 132 suite, 0 fallimenti, 0 regressioni.
