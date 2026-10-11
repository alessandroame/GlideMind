# GlideMind: Istruzioni Operative e Standard di Ingegneria

Questo documento definisce i vincoli architetturali e operativi vincolanti per lo sviluppo nel repository GlideMind.

---

## 1. Vincoli Architetturali e Standard di Codifica

@[GlideMind Constraints & Coding Standards](.agents/rules/constraints.md)

---

## 2. Riferimenti alle Specifiche di Dominio

Per l'implementazione e la verifica dei moduli del progetto, consultare le specifiche dedicate in `.agents/rules/`:
- **Integrità Scientifica e Anti-Sycophancy**: [.agents/rules/anti_sycophancy_integrity.md](file:///c:/github/GlideMind/.agents/rules/anti_sycophancy_integrity.md)
- **Protocollo di Qualità Shift-Left & Pre-Delivery Gates**: [.agents/rules/shift_left_quality_gate.md](file:///c:/github/GlideMind/.agents/rules/shift_left_quality_gate.md)
- **Comprensorio e Binomio Decollo-Atterraggio**: [.agents/rules/comprensorio_locality_spec.md](file:///c:/github/GlideMind/.agents/rules/comprensorio_locality_spec.md)
- **Profilo Pilota Principiante (EN-A)**: [.agents/rules/novice_pilot_spec.md](file:///c:/github/GlideMind/.agents/rules/novice_pilot_spec.md)
- **Layout UI Mobile ed Ergonomia Visiva**: [.agents/rules/ui_layout_spec.md](file:///c:/github/GlideMind/.agents/rules/ui_layout_spec.md)
- **Ergonomia Grafici e Serie Temporali (Parameteo Standard)**: [.agents/rules/ui_chart_design_spec.md](file:///c:/github/GlideMind/.agents/rules/ui_chart_design_spec.md)
- **Guardia Mock Dati Meteo nei Test**: [.agents/rules/testing_weather_mock_guard.md](file:///c:/github/GlideMind/.agents/rules/testing_weather_mock_guard.md)
- **Geodesia e Motore WebGL 3D**: [.agents/rules/geodesy_webgl_3d_spec.md](file:///c:/github/GlideMind/.agents/rules/geodesy_webgl_3d_spec.md)

---

## 3. Standard di Formattazione Report in Chat (Sezioni Collassate)

Nei messaggi di riepilogo e consegna a fine lavorazione:
- Organizzare le sezioni tecniche e di dettaglio interno (es. Diagnosi & RCA, Esito Test Suite, Elenco File e Codice, Sincronizzazione Memoria Cognitiva) all'interno di blocchi collassati HTML:
  ```html
  <details>
  <summary>[Titolo Sezione Tecnica]</summary>
  ...
  </details>
  ```
- Mantenere **obbligatoriamente aperto solo ed esclusivamente l'ultimo blocco** (`<details open>`), dedicato a **Lavori Svolti e Come Provarli (Punto di Vista Utente)**:
  1. **Lavori Svolti**: sintesi chiara di cosa è stato modificato, risolto o implementato nell'applicazione.
  2. **Come Provarli (Guida Utente)**: guida passo-passo dal punto di vista dell'utente finale (cosa fare nell'app, quali pulsanti/controlli premere, cosa osservare a schermo, comportamento atteso), evitando dump di codice o percorsi di file che appartengono ai blocchi tecnici collassati.


