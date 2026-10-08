# Scheda Intervento: Formalizzazione Novice Pilot Auditor & Proxy Aerodinamico della Vela

- **Data**: 2026-10-08
- **Autore**: Alessandro Amè & DeepMind Antigravity Pair Programmer
- **Oggetto**: Creazione della skill/regola `novice-pilot-auditor` e adozione del principio di derivazione aerodinamica dalla vela (zero selettori di livello pilota nella UI).

---

## 1. Contesto & Decisioni Architetturali

1. **Rifiuto dell'Auto-Dichiarazione 'Livello Pilota'**:
   - È stato stabilito di non inserire nell'app alcun menu a tendina o toggle per "Livello Pilota" (principiante/esperto).
   - In aeronautica e nel volo libero, le capacità fisiche di penetrazione e resistenza alla turbolenza dipendono primariamente dall'attrezzatura: è l'ala in uso (`glider`: EN-A, EN-B, EN-C, EN-D) a definire i parametri oggettivi ($v_{\text{trim}}$, $AR$, polar/glide ratio).
   - Per un pilota che vola un'ala scuola/entry-level **EN-A**, le formule di volabilità impongono automaticamente le soglie conservative minime (vento $\le 18\text{ km/h}$, delta raffica $\le 8\text{ km/h}$, cono atterraggio $\le 1:5.5$).

2. **Scopo della Skill `novice-pilot-auditor`**:
   - La skill non è una schermata per l'utente, bensì uno strumento ingegneristico di revisione interna per l'agente e il team di sviluppo.
   - Serve a testare e convalidare codice, layout, briefing e debriefing con la mentalità e le vulnerabilità dell'allievo con vela base.

3. **Matrice dei Momenti Opportuni di Invocazione**:
   - **Checkpoint 1 (UI Views)**: Durante la progettazione/refactoring di viste per verificare la regola dei 3 secondi (*glanceability*), contrasto al sole e touch target $\ge 48\text{ px}$.
   - **Checkpoint 2 (Algoritmi Meteo)**: Modifiche a `flyability.js` per garantire protezione automatica alla vela EN-A.
   - **Checkpoint 3 (Briefing AI)**: Verifica che i prompt Gemini traducano acronimi (LCL, CAPE, EDR) in indicazioni pratiche.
   - **Checkpoint 4 (Debriefing IGC)**: Validazione didattica delle manovre e rilevamento zone di sottovento.
   - **Checkpoint 5 (End-of-Task)**: Verifica finale prima del completamento di un task.

---

## 2. Artefatti Prodotti e Aggiornati
1. **Regola Architetturale Permanente**:
   - Creato [.agents/rules/novice_pilot_spec.md](file:///.agents/rules/novice_pilot_spec.md).
2. **Skill Operativa**:
   - Creato [.agents/skills/novice-pilot-auditor/SKILL.md](file:///.agents/skills/novice-pilot-auditor/SKILL.md).
3. **Subagent Antigravity**:
   - Registrato subagent `novice_pilot_auditor`.
4. **Headless Domain Core (`core/flyability.js`)**:
   - Aggiunta costante `GLIDER_CLASSES` (EN-A, EN-B, EN-C, EN-D) con parametri fisici di riferimento.
   - Deprecato `PilotExperienceLevel` per allineamento al principio glider-proxy.
5. **Triade Cognitiva**:
   - Aggiunta la sezione 13 in [MEMORY.md](file:///MEMORY.md).
