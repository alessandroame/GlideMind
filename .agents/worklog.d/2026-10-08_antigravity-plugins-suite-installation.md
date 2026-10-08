# Scheda Intervento: Installazione Suite Antigravity Plugins

- **Data**: 2026-10-08
- **Autore**: Alessandro Amè & DeepMind Antigravity Pair Programmer
- **Oggetto**: Collegamento e attivazione di tutti gli 8 plugin Antigravity nel workspace GlideMind (`c:\github\glidemind`).

---

## 1. Dettagli del Collegamento
Tutti i plugin della suite `antigravity-plugins` sono stati collegati all'interno della directory `.agents/plugins/` di GlideMind tramite Directory Junction NTFS:

| Plugin | Sorgente | Componenti Principali |
| :--- | :--- | :--- |
| `cognitive-persistence` | `plugins/cognitive-persistence` | Skill `memory-sync`, `next-step`, Regole persistenza e Master Plan |
| `engineering-sobriety` | `plugins/engineering-sobriety` | Skill `tone-audit`, Regola Anti-Sycophancy & Blacklist marketing |
| `engineering-workflow` | `plugins/engineering-workflow` | Skill `trace-debugging`, `worktree-lifecycle`, Governance Git e worklog.d |
| `execution-guard` | `plugins/execution-guard` | Skill `circuit-breaker`, `task-watchdog`, Prevenzione blocchi asincroni |
| `laws-of-ux` | `plugins/laws-of-ux` | 7 Skill e 6 Regole di ergonomia, Gestalt, Fitts, Doherty e accessibilità |
| `proactive-mentorship` | `plugins/proactive-mentorship` | Skill `prompt-refactor`, Scrutinio critico preventivo e mentorship |
| `skill-governance` | `plugins/skill-governance` | Skill `skill-audit`, `skill-collision-check`, `skill-token-optimizer` |
| `telemetry-analytics` | `plugins/telemetry-analytics` | Skill `plugin-analytics`, `telemetry-export`, lifecycle hooks di telemetria |

---

## 2. Esito Audit Sovrapposizioni e Conflitti
1. **Collisioni Nomi Skill**: 0 collisioni rilevate. Le skill locali di GlideMind (`comprensorio-evaluator`, `flyability-evaluator`, `geodesy-webgl-3d`, `novice-pilot-auditor`, `open-meteo-integration`, `outdoor-hmi-touch`, `ai-briefing-gemini`) hanno namespace distinti.
2. **Allineamento Regole**:
   - `anti_sycophancy_integrity.md` in GlideMind delega già esplicitamente le direttive generali al plugin `engineering-sobriety` concentrandosi sui vincoli di dominio (geodesia, WebGL, test non tautologici).
   - `outdoor-hmi-touch` e `ui_layout_spec.md` si integrano perfettamente con le regole globali di `laws-of-ux`, specializzandole per l'ambiente outdoor in volo (guanti, luce solare diretta, touch targets $\ge 44\text{px}$, `100dvh`).
3. **Controllo Versione (VCS)**:
   - La cartella `.agents/plugins/` è inclusa in `.gitignore` di GlideMind, mantenendo lo status Git pulito e non inquinato da percorsi assoluti di macchina.
