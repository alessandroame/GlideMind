# Scheda Intervento: Lean Governance e Disaccoppiamento Regole con Antigravity Plugins

- **Data**: 2026-10-10
- **Autore**: Alessandro Amè & DeepMind Antigravity Pair Programmer
- **Oggetto**: Bonifica sovrapposizioni tra regole locali di GlideMind e la suite `antigravity-plugins` globale, rimozione skill ridondante e allineamento formale.

---

## 1. Contesto & Motivazione

A seguito dell'audit delle direttive e dei comportamenti richiesti agli agenti, è emersa una significativa duplicazione di testo e token tra i file in `.agents/rules/` e le regole fornite centralmente dai plugin Antigravity abilitati a livello globale (`engineering-sobriety`, `engineering-workflow`, `laws-of-ux`, `execution-guard`).

Per ottimizzare il caricamento del contesto (riduzione del token footprint) e garantire l'unicità della sorgente di verità (SSOT) delle regole, è stata effettuata una riorganizzazione:
- Delegare le prescrizioni generali di ergonomia, workflow, integrità e testing ai plugin globali.
- Conservare nei file locali di GlideMind **esclusivamente i vincoli fisici, matematici, di vocabolario e di architettura specifica**.

---

## 2. Dettaglio delle Azioni Correttive

1. **Rimozione Skill Ridondante `outdoor-hmi-touch`**:
   - Eliminata la directory `.agents/skills/outdoor-hmi-touch/`.
   - I requisiti di ergonomia mobile per l'uso all'aperto (touch target $\ge 48\text{px}$, caroselli a riga singola `pan-x`, `100dvh`, gesture cooperative su mappe/canvas) sono ora presidiati a livello globale dalla skill ufficiale `ux-outdoor-and-field-ergonomics` del plugin `laws-of-ux`.
   - Aggiornato `MASTER_PLAN.md` (Fase 0).

2. **Snellimento `anti_sycophancy_integrity.md`**:
   - Delegati i Pilastri 1-4 a `engineering-sobriety` e `proactive-mentorship`.
   - Focalizzato il documento sul Pilastro 5: Ground-Truth Verification su motore reale via CDP headless (screenshot a pieno schermo con WebGL e DEM attivi) e tolleranze cinematiche $SE(3)$ / WGS84.

3. **Snellimento `constraints.md`**:
   - Delegati l'isolamento headless del core (zero DOM), il pattern injectable storage adapter e lo strict English a `engineering-workflow` (Sezioni 3 e 4).
   - Delegato il divieto di hack a `engineering-sobriety`.
   - Conservati unicamente i vincoli di shell modulare (`ui/views`), store reattivo pub/sub, variabili CSS e service worker PWA offline.

4. **Snellimento `ui_layout_spec.md`**:
   - Sostituita la ripetizione delle 5 leggi di UX con la delega a `laws-of-ux`.
   - Mantenuto l'obbligo di traduzione fenomenologica e audit terminologico anti-gergo per principianti (CAPE, LCL, EDR).

5. **Allineamento `shift_left_quality_gate.md`**:
   - Collegato formalmente alla Sezione 5 di `engineering-workflow` e alla skill `shift-left-governance`.
   - Focalizzato sui criteri specifici verificati da `tests/ui/shiftLeftGovernance.test.mjs`.

6. **Allineamento `testing_weather_mock_guard.md`**:
   - Collegato formalmente alla Sezione 4 di `execution-guard` (External API Mock Guard), mantenendo la specificità dei mock Open-Meteo (`?mock_weather=1`, `generateMockWeatherPayload`).

---

## 3. Esito Verifiche e Impatto

- **Suite di Test Completa**: `npm test` eseguito con successo su 61 file di test: **393 passed, 0 failures** in ~4.0 secondi.
- **Test di Governance Statica**: `Shift-Left Quality Gate & Architectural Governance` superato al 100%.
- **Token Economy**: Ridotti circa 18 KB di testo duplicato dalle regole caricate in memoria dall'agente ad ogni sessione di sviluppo.
