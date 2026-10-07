# ADR / Scheda Intervento: Fase 0 - Workspace Foundation & Governance

- **Data**: 2026-10-07
- **Autore**: Alessandro Amè & Google Antigravity Agent
- **Fase**: 0 (Fondazione & Governance)
- **Stato**: Consolidato

---

## 1. Contesto & Obiettivo
Inizializzazione del repository `GlideMind` come reboot architetturale e riscrittura mobile/outdoor del progetto legacy `ParaMeteo`. L'obiettivo della Fase 0 è stabilire la governance, i vincoli ingegneristici, il piano di esecuzione e l'harness di sviluppo/test prima di iniziare l'estrazione dei moduli di dominio.

---

## 2. Decisioni Architetturali (ADR)
1. **Disaccoppiamento Headless Core**:
   Isolamento assoluto della logica di dominio (scoring volabilità, calcoli termodinamici, parser IGC, telemetria cinematica) nella cartella `core/`, priva di qualsiasi dipendenza dal DOM del browser.
2. **Standard di Runtime & Test**:
   Adozione esclusiva di ES Modules (ESM) e del test runner nativo di Node.js (`node:test`, `node:assert/strict`), eliminando bundler e librerie esterne per il core.
3. **Governance Globale dei Plugin Antigravity**:
   I plugin operativi (`engineering-sobriety`, `engineering-workflow`, `execution-guard`, `laws-of-ux`, `cognitive-persistence`, `proactive-mentorship`) sono installati a livello utente in `~/.gemini/config/plugins/` per evitare link simbolici/giunzioni NTFS che sporcherebbero la cronologia Git di GlideMind.
4. **Ergonomia Outdoor HMI**:
   Touch target minimi $\ge 44\text{px}$, caroselli a riga singola (`touch-action: pan-x`), viewport `100dvh`, contrasto visivo elevato per la luce solare diretta.

---

## 3. Impatti & File Creati
- `MASTER_PLAN.md`: Piano operativo completo (Fasi 0-8).
- `package.json`: Configurazione ESM e script `test`, `dev`.
- `scripts/serve.js`: Server HTTP di sviluppo locale nativo a zero dipendenze.
- `tests/smoke.test.mjs`: Verifica automatica del test runner e dell'ambiente Node.js >= 20.
- `.agents/rules/`: 5 regole vincolanti (anti-sycophancy, constraints, geodesy, testing weather mock guard, ui layout).
- `.agents/skills/`: 5 skill di dominio (ai briefing, flyability, geodesy 3d, open meteo, outdoor hmi touch).
- `.gitignore`: Esclusione di artefatti temporanei, cache e plugin locali.
