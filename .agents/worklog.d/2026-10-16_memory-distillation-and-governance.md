# [2026-10-16] ADR: Distillazione per Dominio di MEMORY.md e Guardia Automatica Anti-Bloat

## Contesto & Motivazione
`MEMORY.md` aveva raggiunto 2.572 righe (`375,3 KB`, `~95.000 token`, 176 sezioni accodate cronologicamente), superando di 8 volte il limite di lettura singola di `view_file` (`46 KB`) e mantenendo in testa al documento direttive storiche successivamente abrogate (es. blocchi statistici pilota in Home, card a 2 righe testuali, 5° chip data `.custom`, ricostruzione sintetica di tracce GPS).

## Decisioni Architetturali
1. **Archiviazione Storica Zero-Loss**: Copia integrale dello storico pre-distillazione (voci 1–176) in `.agents/archive/MEMORY_v1_archive.md`.
2. **Distillazione per Dominio (`Opzione A`)**: Riscrittura di `MEMORY.md` in **6 sezioni canoniche di dominio** (`Core Headless`, `Meteo & Volabilità`, `UI & Design System`, `Cartografia & 3D`, `Persistenza & PWA`, `Test & Ambiente Windows`) per un totale di **124 righe** (`~11,2 KB`, `-97%` di peso), eliminando tutte le contraddizioni storiche.
3. **Gate Automatico e Regola In-Place (`Opzione C`)**:
   - Aggiunto test automatico in `tests/ui/shiftLeftGovernance.test.mjs` (`Gate 5: Cognitive Memory Hygiene`) che impone il tetto massimo `<= 200 righe` e `<= 8 sezioni H2` su `MEMORY.md`.
   - Aggiornati `cognitive-persistence/rules/AGENTS.md` e `cognitive-persistence/skills/memory-sync/SKILL.md` vietando l'append numerato sequenziale e imponendo l'aggiornamento *in-place* per dominio.

## Impatto e Conseguenze
- Riduzione di `MEMORY.md` da `2.572 righe` (`375,3 KB`) a `124 righe` (`11,2 KB`), leggibile in 1 singola chiamata `view_file` (`~2.800 token` invece di `~95.000 token`).
- Suite `tests/ui/shiftLeftGovernance.test.mjs` verificata al 100% (14/14 test passati).
