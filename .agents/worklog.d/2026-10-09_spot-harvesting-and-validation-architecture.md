# Worklog: Architettura Pipeline di Harvesting e Validazione Spot (ETL + Subagent)

- **Data**: 2026-10-09
- **Autore**: Antigravity (Pair Programming Assistant)
- **Contesto**: Analisi di fattibilità per il reperimento automatico dei dati di volo libero (decolli e atterraggi), esclusione di XContest per vincoli tecnici/ToS, e definizione dell'architettura di validazione ibrida (pre-filtro matematico deterministico + audit semantico con LLM).

---

## 1. Contesto e Diagnosi delle Fonti

1. **Inidoneità di XContest**:
   - Assenza di API pubblica per il catalogo decolli/atterraggi.
   - Protezioni anti-scraping severe (Cloudflare, rate limit a 150 record).
   - Dati di decollo nei log IGC non strutturati (mancanza di metadati critici di sicurezza: pendenza, quota atterraggio ufficiale, frequenze radio, contatti club).
2. **Sorgenti Primarie Selezionate**:
   - **OpenStreetMap (OSM)** via Overpass API (`sport=free_flying`, `free_flying:site=takeoff|landing`). Licenza aperta ODbL, georeferenziazione globale.
   - **Paragliding Earth**: REST API per coordinate, esposizioni di vento, dislivelli e descrizioni.
   - **Waypoint Agonistici (.cup / .wpt)** e registri federazioni (DHV / FFVL / FIVL) per convalida di alto livello.

---

## 2. Decisioni Architetturali (ADR)

### ADR 1: Architettura Ibrida a Due Livelli (Anti-Allucinazione)
- **Problema**: L'uso esclusivo di un LLM per analizzare coordinate, distanze e quote genera errori numerici e allucinazioni su distanze e coni di planata.
- **Decisione**: Separazione netta dei compiti:
  - **Livello 1 (Deterministico in Node.js)**: Clustering spaziale Haversine ($\Delta d \le 100\text{ m}$), validazione altimetrica DEM Copernicus via Open-Meteo ($|\Delta h| \le 30\text{ m}$), calcolo efficienza planata ($E \le 7$). Zero costo token, tempo di esecuzione $< 2\text{s}$.
  - **Livello 2 (Audit Semantico via Agente/LLM)**: Deduplicazione toponimi e rampe multiple dello stesso comprensorio, estrazione e strutturazione dei pericoli (`hazards`), individuazione di atterraggi chiusi o controversie legali da testo libero, calcolo punteggio di attendibilità semantica e motivazione.

### ADR 2: Isolamento Staging (Zero Interferenza con il Runtime)
- **Problema**: Una scrittura diretta su `data/locations.json` durante test di harvesting o validazione potrebbe corrompere il catalogo usato da `HomeDashboardView.js` e `ForecastView.js`.
- **Decisione**: La pipeline opera offline come tooling (`scripts/`):
  1. I dati grezzi vengono estratti in `data/raw-harvest/`.
  2. I cluster pre-filtrati e validati dall'agente confluiscono in `data/staging-locations.json`.
  3. Solo i record con stato `APPROVED` e attendibilità verificata vengono unificati in `data/locations.json` dopo differenziale pulito.
  4. Nessuna interferenza a runtime sull'applicazione web.

---

## 3. Impatto e Integrazione nel Master Plan

- **Fase 5 (Mappa Comprensori)**: Beneficia direttamente di un catalogo `locations.json` arricchito con coordinate verificate e quote DEM coerenti.
- **Indice di Attendibilità**: Ogni decollo e atterraggio possiede il campo `reliability` numerico e la nota esplicativa per il pilota, garantendo trasparenza conforme alle Laws of UX (Explainability).

---

## 4. Moduli Implementati e Suite di Test (262/262 Passanti)

1. **`scripts/harvest-osm.mjs`**: Harvester OpenStreetMap via Overpass API con normalizzazione nodi e aree, testato in [tests/scripts/harvestOsm.test.mjs](file:///tests/scripts/harvestOsm.test.mjs) (5 test).
2. **`scripts/geo-cluster-filter.mjs`**: Clustering di prossimità ($\le 100\text{ m}$), validazione altimetrica DEM Copernicus ($|\Delta h| \le 30\text{ m}$), accoppiamento decollo-atterraggio ($E \le 7$) e scoring geometrico, testato in [tests/scripts/geoClusterFilter.test.mjs](file:///tests/scripts/geoClusterFilter.test.mjs) (13 test).
3. **`.agents/skills/spot-data-auditor/SKILL.md`**: Skill operazionale per il subagent LLM delegato all'audit semantico dei pericoli e toponimi.
4. **`scripts/build-locations-catalog.mjs`**: Builder del catalogo con staging isolato (`data/staging-locations.json`) e generazione report markdown (`docs/spots-audit-report.md`), testato in [tests/scripts/buildLocationsCatalog.test.mjs](file:///tests/scripts/buildLocationsCatalog.test.mjs) (3 test).
