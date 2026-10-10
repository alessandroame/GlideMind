# Scheda Intervento: Consolidamento Piani di Lavoro, Normalizzazione docs/plans/ e Riconciliazione Roadmap

- **Data**: 2026-10-10
- **Autore**: Alessandro Amè & Pair Programmer
- **Tipo**: Governance / Architecture Planning / ADR / Roadmap Reconciliation
- **Stato**: Completato

---

## 1. Contesto & Motivazione

A seguito dell'audit sul piano di lavoro e sui documenti di fase generati durante le recenti implementazioni cartografiche, sono emerse quattro anomalie:
1. **Frammentazione dei file di piano**: presenza di documenti di piano eterogenei nella radice di `docs/` e nella sottocartella `docs/plans/`.
2. **Disallineamento di `MASTER_PLAN.md`**: mancato aggiornamento delle sotto-fasi 2-bis, 3-bis, 5-bis, 5-ter, 5-quater, 5-quinquies e presenza di checkbox desincronizzati (`[ ]` invece di `[x]`).
3. **Conflitto tra circuiti sintetici e bonifica cartografica**: `COMPRENSORIO_FLIGHT_ANALYSIS_PLAN.md` prescriveva circuiti sintetici algoritmici che sono stati successivamente eliminati dal codice (MEMORY #79) per salvaguardare la leggibilità orografica della mappa in favore delle sole maniche a vento vettoriali orientate dal meteo live.
4. **Scope Creep didattico scolastico e inversione di priorità**: `FLIGHT_PROCEDURES_DRAWING_PLAN.md` reintroduceva elementi di formazione scolastica (in contrasto con l'ADR di rimozione del Syllabus Peter Pan - MEMORY #21) e proponeva un costoso motore CAD interattivo di disegno a mano libera prima ancora di aver implementato il Logbook (Fase 6) e il Replay 3D (Fase 7).

---

## 2. Azioni Eseguite

1. **Normalizzazione della Directory Piani (`docs/plans/`)**:
   - `docs/plans/phase-2-bis-brand-identity.md`: consolidamento e marcatura completato.
   - `docs/plans/phase-5-bis-forecast-minimap.md`: consolidamento e marcatura completato.
   - `docs/plans/phase-5-ter-flight-analysis-overlay.md`: consolidamento con nota esplicita di rettifica e allineamento a MEMORY #79.
   - `docs/plans/phase-5-quater-european-expansion.md`: rinomina con naming standard e marcatura completato.
   - `docs/plans/phase-5-quinquies-club-safety-zoning.md`: ristrutturazione focalizzata unicamente sui dati statici territoriali (poligoni verde/rosso/arancione di Cavallaria), espungendo lo scope creep scolastico.
   - `docs/plans/future-interactive-drawing-engine.md`: editor CAD interattivo posticipato a fase successiva al Replay 3D.
   - Rimozione dei file obsoleti sparsi in `docs/`.

2. **Riconciliazione di `MASTER_PLAN.md`**:
   - Aggiornata la Sezione 4 con tutte le fasi effettivamente realizzate (Fasi 0, 1, 2, 2-bis, 3, 3-bis, 4, 4-bis, 5, 5-bis, 5-ter, 5-quater, 8-bis marcate con `[x]`).
   - Sbloccata la priorità primaria su **Fase 6: Flight Logbook & Telemetry Module** (`🔴 Prossimo Step Primario`).

3. **Allineamento di `DESIDERATA.md`**:
   - Aggiornata la riga 27 (Zonizzazione Territoriale di Sicurezza) e la riga 28 (Fase 6: Modulo Logbook marcata `🔴 Prioritario`).
   - Aggiunta la riga per le estensioni future del motore di disegno CAD post-Fase 7.

4. **Registrazione Lezione di Governance**:
   - Aggiunta la Lezione Appresa #80 in [MEMORY.md](file:///MEMORY.md).
