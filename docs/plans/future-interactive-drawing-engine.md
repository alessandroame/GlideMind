# Specifiche Future: Motore di Disegno Interattivo & Annotazione Rotte (CAD Engine)

> **Stato**: ⚪ Pianificato (Post-Fase 7: Replay 3D & Telemetria)  
> **Target Repo**: `GlideMind`  
> **Riferimenti Precursori**: ParaMeteo `routePlannerUi.js`, ParaMeteo `spotContributionUi.js`

---

## 1. Obiettivo della Funzionalità Avanzata

Offrire a istruttori e piloti avanzati uno strumento interattivo touch su mappa per:
1. Disegnare corridoi di volo e percorsi termici personalizzati con posizionamento di waypoint.
2. Tracciare poligoni per delimitare campi di emergenza o nuove zone di rispetto.
3. Condividere le annotazioni geografiche tramite esportazione e importazione in formato standard GeoJSON.

---

## 2. Decisione di Deferimento (Roadmap Sequence)

Questa funzionalità viene intenzionalmente **posticipata a valle del rilascio della Fase 6 (Logbook) e della Fase 7 (Replay 3D)**:
1. **Precedenza del Core Value**: Il valore fondamentale di GlideMind risiede nella volabilità meteo, nel caricamento delle tracce IGC reali e nella cinematica di volo 3D.
2. **Prevenzione Debito di Persistenza**: Lo storage dei tracciati disegnati deve innestarsi sull'architettura IndexedDB e Backup Manager di Fase 6 e 6-bis, evitando la creazione di sottosistemi di salvataggio paralleli e frammentati.
3. **Ergonomia CAD su Mobile**: L'interfaccia di disegno a mano libera con nodi manipolabili richiede un elevato investimento di sviluppo per rispettare i requisiti di Fitts's Law ($\ge 48\text{px}$) e prevenire conflitti con i gesti nativi di Leaflet.

---

## 3. Architettura Prevista

### Modulo Controller: `ui/map/drawingEngineAdapter.js`
- Modalità Polilinea: aggiunta waypoint con smoothing spline di Chaikin headless puro.
- Modalità Poligono: chiusura perimetro con calcolo superficie.
- Gestione Stato: stack reversibile Undo / Redo a 50 stati.
- Disabilitazione temporanea del trascinamento della mappa durante l'editing dei vertici.
