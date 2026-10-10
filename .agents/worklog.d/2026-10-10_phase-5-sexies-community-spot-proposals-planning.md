# Scheda di Intervento: Pianificazione Fase 5-sexies (Raccolta, Correzione Spot & Pipeline Ingestion Proposte Pilota)

> **Data**: 2026-10-10  
> **Oggetto**: Definizione architettura raccolta dati spot dal campo e ingestion tooling  
> **File Modificati / Aggiunti**:  
> - `docs/plans/phase-5-sexies-community-spot-proposals.md` (Nuovo piano architetturale)  
> - `MASTER_PLAN.md` (Integrazione Fase 5-sexies)  
> - `DESIDERATA.md` (Registrazione nuova voce di roadmap)  

---

## 1. Contesto & Rationale Architetturale

La continua evoluzione dei siti di volo (chiusure temporanee, frequenze radio modificate, nuovi decolli) richiede un canale strutturato di contribuzione dal campo. L'analisi dicotomica evidenzia due contesti operativi contrapposti:
1. **Pilota sul campo**: opera sotto la luce solare diretta con guanti, connettività ridotta e poco tempo; richiede touch target $\ge 48\text{px}$, 1-tap geolocation, draft resiliente in `localStorage` e link pubblici per immagini/foto (nessun upload binario pesante).
2. **Maintainer**: necessita di uno strumento deterministico per validare lo schema, eseguire controlli geodetici ($H_{\text{takeoff}} > H_{\text{landing}}$, efficienza di planata $E \le 7.0$ per vele scuola EN-A), rilevare duplicati spaziali ($< 500\text{m}$), visualizzare il diff e applicare il merge nel catalogo geografico sharded (`data/locations/<country>.json`) rieseguendo `shard-locations-catalog.mjs`.

---

## 2. Decisioni Strutturate

1. **Schema JSON Auto-Contenuto (`GlideMindSpotProposal`)**:
   - Definito in `docs/plans/phase-5-sexies-community-spot-proposals.md` con supporto a `create_comprensorio` e `update_comprensorio`.
   - Vincolo inderogabile comprensorio-centrico: ogni decollo deve avere almeno un atterraggio associato.
2. **Core Disaccoppiato**:
   - La logica di validazione geodetica e altimetrica risiederà nel modulo headless `core/spotProposalValidator.js`, condivisibile sia dal form client che dallo script CLI `scripts/review-proposal.mjs`.
3. **Pianificazione Coordinata**:
   - Inserimento organico come Fase 5-sexies in `MASTER_PLAN.md` e `DESIDERATA.md` con stato `⚪ Pianificato`, preservando la precedenza per la Fase 6 (Logbook) e Fase 7 (Replay 3D).
