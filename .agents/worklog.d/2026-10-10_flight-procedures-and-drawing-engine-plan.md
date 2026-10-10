# Worklog Fragment: Piano Architetturale per Procedure di Volo, Zonizzazione Club & Drawing Engine

- **Data**: 2026-10-10
- **Autore**: Alessandro Amé & Antigravity
- **Argomento**: Pianificazione architetturale per l'integrazione di procedure di volo didattiche (scuole di volo EN-A), convenzioni e zonizzazione aeroclub (bacheca Cavallaria), e motore interattivo di disegno/annotazione su mappa.
- **Riferimento Plan**: `docs/FLIGHT_PROCEDURES_DRAWING_PLAN.md`

## 1. Contesto e Motivazione
- Analisi dello screenshot utente che riporta il circuito di atterraggio calcolato matematicamente da GlideMind (`core/flightProcedures.js` e `ui/map/mapEngineAdapter.js`).
- Ricognizione del precursore `ParaMeteo` (`C:\github\ParaMeteo\js\ui\routePlannerUi.js` e `spotContributionUi.js`), che disponeva di tracciamento polilinee a coordinate libere, smoothing con spline di Chaikin, Undo/Redo a 50 stati e sketch guidato del circuito a C in 3 tocchi.
- Analisi empirica sul campo delle fotografie della bacheca del Parapendio Club Cavallaria (Brosso / Lessolo), che evidenziano una zonizzazione fisica precisa dell'atterraggio:
  - Zona Verde: area consentita delimitata da paletti gialli con bersaglio centrale.
  - Zone Rosse: divieto assoluto per contenziosi agricoli o pericoli/rotori.
  - Zona Arancione: area piegaggio vele separata dall'asse di toccata.
  - Zona Azzurra: viabilità interna e parcheggio dedicato.
- Definizione dell'esigenza didattica delle scuole di volo: fornire agli allievi (vele EN-A / neo-brevettati) tracciati sicuri di uscita in valle dal decollo verso la pianura, aree di sicurezza per le manovre didattiche (training box) e convenzioni di atterraggio rigorose (senso di virata vincolato).

## 2. Decisioni Architetturali (ADR)
1. **Motore Procedurale Ibrido (Hybrid Procedural Engine)**:
   - Disaccoppiamento e fusione tra i vincoli fisici immutabili del Club (perimetro atterraggio verde, zone rosse interdette, senso di virata obbligatorio) e l'adattamento aerodinamico dinamico al vento live orario (allineamento controvento del finale e scala metrica di planata).
2. **Purezza Headless Core (`core/flightPlan.js`)**:
   - Zero DOM, 100% testabile in Node.js puro.
   - Definizione degli schemi per `valleyExit`, `exerciseZone`, `landingZone` e `circuitConvention`.
3. **Editor di Disegno Outdoor Tattile (`ui/map/drawingEngineAdapter.js`)**:
   - Touch targets maggiorati $\ge 48\times 48\text{px}$ per impiego sul campo anche con dita fredde o guanti.
   - Algoritmo di Chaikin per ammorbidire le polilinee di rotta.
   - Stack Undo/Redo reversibile fino a 50 azioni.
4. **Briefing Overlay a Due Viste in `ForecastView.js`**:
   - Toggle glanceable tra "Meteo Live Nowcast" (circuito dinamico) e "Convenzione Club / Scuola" (briefing ufficiale).

## 3. Stato di Avanzamento
- Documento di Master Plan redatto e archiviato in `docs/FLIGHT_PROCEDURES_DRAWING_PLAN.md`.
- Matrice `DESIDERATA.md` aggiornata con l'inserimento della **Fase 5-quinquies** in stato `⚪ Pianificato`.
