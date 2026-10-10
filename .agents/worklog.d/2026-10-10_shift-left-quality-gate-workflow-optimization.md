# Scheda Intervento: Istituzione del Protocollo di Qualità Shift-Left & Pre-Delivery Gates

- **Data**: 2026-10-10
- **Modulo**: `.agents/rules/shift_left_quality_gate.md`, `tests/ui/shiftLeftGovernance.test.mjs`, `AGENTS.md`, `MEMORY.md`
- **Oggetto**: Transizione da verifiche e audit reattivi post-hoc (innescati a valle dei difetti riscontrati dall'utente) a un'architettura di qualità preventiva Shift-Left (Zero-Rework Mandate) con validazione automatizzata integrata nella test suite prima di ogni consegna.

---

## 1. Contesto & Diagnosi della Causa Radice
Nel ciclo di sviluppo storico si riscontrava un pattern ricorrente di frizione:
1. L'utente richiede una funzionalità.
2. L'agente implementa la logica primaria focalizzandosi sul flusso funzionale principale ("Happy Path").
3. L'utente riscontra difetti grafici, acronimi fisici non contestualizzati (CAPE, LCL), numeri nudi o problemi di spaziatura mobile.
4. L'utente richiede l'esecuzione di audit (`laws-of-ux-audit`, `novice-pilot-auditor`, regression testing).
5. L'agente itera con modifiche correttive a posteriori.

La causa radice tecnica non era l'assenza di regole (tutte ampiamente codificate in `.agents/rules/`), ma la loro collocazione nel flusso di lavoro: **venivano trattate come strumenti di audit diagnostico da invocare a valle anziché come vincoli generativi vincolanti prima e durante la stesura del codice**.

---

## 2. Decisioni Architetturali & Soluzione Operativa (Shift-Left)

1. **Codificazione del Protocollo Shift-Left (`.agents/rules/shift_left_quality_gate.md`)**:
   - Definiti 5 Gate vincolanti da superare prima di rilasciare qualsiasi modifica all'utente:
     - **Gate 1: Matrice Pre-Design UX & Dominio (Ex-Ante)**: Occam/Prägnanz (zero ridondanze), Fitts floor $\ge 48\times 48\text{px}$, Thumb Zone, Progressive Disclosure (livello 0 qualitativo vs livello 1 quantitativo), vocabolario pilota principiante (traduzione fenomenologica di CAPE, LCL, EDR), doppio tema ad alto contrasto (Sunlight Mode).
     - **Gate 2: Rigore di Implementazione In-Flight**: Purezza headless core (`core/`), store reattivo SSOT, classi CSS rigorosamente mappate in `theme.css`, inglese esclusivo nel codice.
     - **Gate 3: Test Suite di Governance Automatizzata (`npm test`)**: Suite di verifica statica e dinamica sui contratti architetturali ed ergonomici.
     - **Gate 4: Loop di Ispezione Geometrica & Visiva**: Verifica anti-troncamento, zero overflow orizzontale, viewport dinamico `100dvh`.
     - **Gate 5: Briefing con Evidenza Pre-Flight**: Resoconto trasparente dei 5 Gate superati.

2. **Automated Governance Gate (`tests/ui/shiftLeftGovernance.test.mjs`)**:
   - Creata suite automatizzata integrata in `npm test` con 8 subtest indipendenti che verificano:
     - Isolamento headless del core (zero riferimenti diretti a DOM/browser).
     - Storage adapter pattern in `store.js`.
     - Traduzione fenomenologica obbligatoria (CAPE $\to$ Instabilità/Temporali, LCL $\to$ Base Nubi, EDR $\to$ Turbolenza).
     - Progressive disclosure (zero numeri nudi o frecce orfane nei scrubber).
     - Touch floor $\ge 48\text{px}$ e landscape guard in `theme.css`.
     - Dichiarazioni token Sunlight Light Mode.
     - Assenza assoluta di emoji decorative vietate (`📈`, `🎙️`, `⏱️`, `ℹ️`, ecc.).
     - Protezione flexbox anti-troncamento (`.gm-flight-label`, `.gm-flight-target`).

3. **Integrazione nelle Regole di Sistema (`AGENTS.md`)**:
   - Inserito il riferimento vincolante al protocollo Shift-Left in `AGENTS.md`.

---

## 3. Impatto e Verifica
- **Test Suite**: 355/355 test superati con successo in 49 suite (`npm test`, ~4.0s).
- **Zero Regressioni**: Nessuna rottura introdotta nei moduli preesistenti.
