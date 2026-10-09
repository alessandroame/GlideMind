# ADR: Istituzione del Gate Obbligatorio di Audit Terminologico & Anti-Gergo in Fase Progettuale

**Data**: 2026-10-09  
**Stato**: Approvato / Vincolante  
**Ambito**: Governance UI / Novice Pilot Spec / Laws of UX / Continuità Cognitiva  
**File Impattati**: [MEMORY.md](file:///c:/github/GlideMind/MEMORY.md), [.agents/rules/ui_layout_spec.md](file:///c:/github/GlideMind/.agents/rules/ui_layout_spec.md), [.agents/rules/novice_pilot_spec.md](file:///c:/github/GlideMind/.agents/rules/novice_pilot_spec.md), [.agents/skills/novice-pilot-auditor/SKILL.md](file:///c:/github/GlideMind/.agents/skills/novice-pilot-auditor/SKILL.md)

---

## 1. Contesto & Diagnosi

Durante l'implementazione delle viste meteorologiche (es. `ForecastView`), termini termodinamici grezzi e acronimi fisici (`Energia CAPE`, `J/kg`, `LCL`, `EDR`) sono trapelati nell'interfaccia utente.
Sebbene la skill `novice-pilot-auditor` ne prescrivesse il bando o la traduzione (Filtro 2: Carico Cognitivo & Anti-Gergo), l'audit veniva eseguito a posteriori o omesso, poiché i gate preventivi di progettazione (Regola 18 di `MEMORY.md` e Sezione 4 di `ui_layout_spec.md`) erano calibrati esclusivamente su layout geometrico, Fitts's Law e touch target.

---

## 2. Decisione Architetturale (ADR)

È formalmente istituito il **Gate di Validazione Terminologica Preventiva** (Regola 19 di `MEMORY.md` e Punto 6 di `ui_layout_spec.md`):
1. **Verifica Anticipata (Pre-Design Intake)**: L'audit sul vocabolario non è più un controllo post-rilascio, ma una pre-condizione bloccante prima di scrivere codice, markup HTML o prompt AI.
2. **Traduzione Fenomenologica Obbligatoria**:
   - Qualsiasi grandezza fisica o aerologica deve essere nominata in funzione dell'effetto pratico sul volo e sulla sicurezza del pilota.
   - Vietati acronimi isolati (`CAPE`, `LCL`, `EDR`) come label primarie.
3. **Gerarchia Qualitativo-Quantitativa**:
   - Il dato prominente è lo stato semantico di sicurezza (color-coded: Basso / Moderato / Sovrasviluppo CB).
   - Il valore numerico con unità specialistica (`J/kg`) è subordinato come nota accessoria per piloti avanzati.

---

## 3. Matrice Vincolante di Traduzione Aerologica

| Grandezza Fisica Grezza | Label Primaria Pilota | Stato Semantico in Evidenza | Dettaglio Secondario Accessorio |
| :--- | :--- | :--- | :--- |
| `CAPE (J/kg)` | **Rischio Temporali** *(o Instabilità Termica)* | `Calmo` (<100) / `Moderato` (100-800) / `Pericolo CB` (>800) | `CAPE: ${val} J/kg • Cumuli` |
| `LCL (m)` | **Base Nubi (Cumulo)** | Delta quota dal decollo (es. `+850m sopra decollo`) | `${val}m slm (LCL)` |
| `EDR / Turbulence` | **Turbolenza in Termica** | `Leggera` / `Moderata` / `Forte` | `${val} EDR` |
| `Lapse Rate (°C/100m)`| **Gradiente Termico** | `Stabile` / `Instabile (Termiche attive)` | `${val} °C/100m` |
| `Wind Shear` | **Taglio del Vento** | `Omogeneo` / `Gradiente Ripido` | `${val} km/h per 1000m` |

---

## 4. Conseguenze & Impatti

- Ogni proposta progettuale di nuova vista o scheda deve includere esplicitamente il censimento delle etichette prima del codice.
- Prevenzione del sovraccarico cognitivo e salvaguardia della regola dei 3 secondi sul decollo per allievi e piloti con vela base EN-A.
