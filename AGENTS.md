# GlideMind: Istruzioni Operative e Standard di Ingegneria

Questo documento definisce i vincoli architetturali e operativi vincolanti per lo sviluppo nel repository GlideMind.

---

## 1. Vincoli Architetturali e Standard di Codifica

@[GlideMind Constraints & Coding Standards](.agents/rules/constraints.md)

---

## 2. Riferimenti alle Specifiche di Dominio

Per l'implementazione e la verifica dei moduli del progetto, consultare le specifiche di dominio dedicate in `.agents/rules/` (le regole trasversali di sobrietà, shift-left, mock guard e UX sono fornite dai plugin globali in `C:/Users/aame/.gemini/config/plugins/`):
- **Comprensorio e Binomio Decollo-Atterraggio**: [.agents/rules/comprensorio_locality_spec.md](file:///c:/github/GlideMind/.agents/rules/comprensorio_locality_spec.md)
- **Profilo Sicurezza Aerodinamica & Prudenza Pilota**: [.agents/rules/novice_pilot_spec.md](file:///c:/github/GlideMind/.agents/rules/novice_pilot_spec.md)
- **Layout UI Mobile ed Ergonomia Visiva**: [.agents/rules/ui_layout_spec.md](file:///c:/github/GlideMind/.agents/rules/ui_layout_spec.md)
- **Ergonomia Grafici e Serie Temporali (Parameteo Standard)**: [.agents/rules/ui_chart_design_spec.md](file:///c:/github/GlideMind/.agents/rules/ui_chart_design_spec.md)
- **Design System UI & Coerenza Visiva**: [.agents/rules/ui_design_system_spec.md](file:///c:/github/GlideMind/.agents/rules/ui_design_system_spec.md)
- **Geodesia e Motore WebGL 3D**: [.agents/rules/geodesy_webgl_3d_spec.md](file:///c:/github/GlideMind/.agents/rules/geodesy_webgl_3d_spec.md)

---

## 3. Standard di Formattazione Report in Chat (0-Click + `<details>` 1-Click)

Nei messaggi di riepilogo e consegna a fine lavorazione, in coerenza con [`engineering-sobriety`](file:///C:/Users/aame/.gemini/config/plugins/engineering-sobriety/rules/AGENTS.md) e [`engineering-workflow`](file:///C:/Users/aame/.gemini/config/plugins/engineering-workflow/rules/AGENTS.md):
- **In chiaro (0-Click — Max 800–1.200 char)**:
  1. **Diagnosi / Lavori Svolti**: 1–2 frasi dirette sull'intervento completato e sull'esito dei test (`Test: PASS`), seguite da 3–5 bullet sintetici di 1 riga.
  2. **Come Provarli (Punto di Vista Utente) & Prossimo Passo**: indicazioni pratiche per verificare la modifica nell'app (quali controlli usare e comportamento atteso a schermo) e domanda finale isolata.
- **A 1-Click (`<details>` chiusi di default, con riga vuota obbligatoria dopo `</summary>`)**:
  - Racchiudere i dettagli tecnici interni (Diagnosi & RCA, Dettaglio File Modificati & Evidenza Gate 1–5, Esito Test Suite, Sincronizzazione Memoria Cognitiva) in blocchi `<details><summary><strong>Titolo Sezione Tecnica</strong></summary>`.
