# ADR: Audit Governance Istruzioni Agente, Ripristino Token Budget `<user_rules>` e Allineamento Frontmatter YAML

- **Data**: 2026-10-16
- **Stato**: Completato
- **Ambito**: Governance Agente (`AGENTS.md`, `.agents/rules/*.md`, `.agents/skills/*/SKILL.md`, `tests/ui/shiftLeftGovernance.test.mjs`, plugin globali)

---

## 1. Contesto e Problematiche Rilevate
L'audit statico sull'infrastruttura delle istruzioni per l'agente (workspace GlideMind + plugin globali in `~/.gemini/config/plugins/`) ha evidenziato:
1. **Overflow del Token Budget di `<user_rules>` (P0)**: i file `AGENTS.md` always-on pesavano complessivamente `68.922 byte`, causando l'esclusione dall'iniezione inline di `cognitive-persistence/rules/AGENTS.md` (`11.987 B`) e `laws-of-ux/rules/AGENTS.md` (`9.952 B`).
2. **Scarto Silente di 2 Skill per YAML Invalido (P0)**: `skill-audit/SKILL.md` e `skill-token-optimizer/SKILL.md` contenevano `: ` non quotati su righe inline del campo `description`, causando il rigetto del frontmatter da parte del parser YAML strict di Antigravity.
3. **Violazioni di `skill-governance` (P2)**: 8 skill superavano il limite di 250 caratteri nella `description` (`260–291 char`) e 10 skill mancavano del trigger condizionale direttivo (*"Use this skill when..."* / *"Utilizza questa skill quando..."*).
4. **Drift Normativo Interno in GlideMind (P1)**:
   - `AGENTS.md` (Sezione 3) prescriveva blocchi `<details>` con l'ultimo `<details open>`, in contrasto con il modello Piramide Invertita `0-Click + <details> 1-Click` di `engineering-sobriety` e `engineering-workflow`.
   - `.agents/rules/ui_layout_spec.md` e `.agents/rules/novice_pilot_spec.md` contenevano riferimenti legacy (carosello decolli in Home, MapLibre per `#view-map` anziché Leaflet `IMapEngine`, badge `EN-A` in UI superati da `NOTE-004`, link a `c:/github/antigravity-plugins` ed emoji decorative `🪂`, `❌`).

---

## 2. Decisioni e Interventi Implementati
1. **Compattazione Chirurgica dei `rules/AGENTS.md` (-50% byte)**:
   - Ridotto il peso combinato dei 9 `rules/AGENTS.md` dei plugin da `65,5 KB` a `~32 KB` (con tetto singolo $\le 6.500\text{ B}$ verificato in `validate.mjs`), preservando tutti gli invarianti, le soglie quantitative e le tabelle di anti-razionalizzazione, così da far rientrare tutte le regole nel budget inline di `<user_rules>`.
2. **Bonifica Frontmatter YAML e Conformità `skill-governance`**:
   - Convertiti tutti i frontmatter `SKILL.md` con blocco folded `description: >-`, lunghezza rigorosamente compresa tra `80` e `250` caratteri e trigger direttivo esplicito.
3. **Allineamento Regole di Dominio GlideMind e Gate Automatico**:
   - Armonizzato `AGENTS.md` al formato `0-Click + <details> 1-Click`.
   - Aggiornati `.agents/rules/constraints.md`, `.agents/rules/ui_layout_spec.md`, `.agents/rules/novice_pilot_spec.md`, `.agents/rules/comprensorio_locality_spec.md` e `.agents/skills/novice-pilot-auditor/SKILL.md` con i vincoli di `MEMORY.md` (`NOTE-003..005`), puntamenti a `C:/Users/aame/.gemini/config/plugins/` e rimozione delle emoji decorative.
   - Aggiunto in `tests/ui/shiftLeftGovernance.test.mjs` il test `Gate 5 (Agent Instructions & Skill Governance)` per prevenire regressioni su frontmatter YAML, lunghezza `description`, trigger direttivi e link nei file `.agents/`.
