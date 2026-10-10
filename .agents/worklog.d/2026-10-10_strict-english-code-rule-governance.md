# Standard di Codifica: Governance Lingua Inglese Esclusiva nel Codice e Attivazione AGENTS.md

**Data**: 2026-10-10  
**Autore**: Alessandro Amè & DeepMind Antigravity Pair Programmer  
**Ambito**: Governance Codice, Standard di Ingegneria & Architettura Customizzazioni Antigravity  

---

## 1. Contesto & Motivazione

Per garantire la massima manutenibilità, interoperabilità e aderenza agli standard professionali internazionali, è stato formalizzato il vincolo assoluto di redigere tutto il codice sorgente esclusivamente in lingua inglese.

Precedentemente, in `GlideMind`, la direttiva era parzialmente enunciata in `.agents/rules/constraints.md`, ma rimaneva inattiva all'avvio della sessione poiché Antigravity indicizza ed inietta nel prompt solo i file di regole posti alle radici scoperte gerarchicamente (`AGENTS.md` o plugin globali in `~/.gemini/config/plugins/`).

---

## 2. Decisioni & Interventi Architetturali

1. **Integrazione nello Standard Globale (`engineering-workflow`)**:
   - In [`C:/github/antigravity-plugins/plugins/engineering-workflow/rules/AGENTS.md`](file:///C:/github/antigravity-plugins/plugins/engineering-workflow/rules/AGENTS.md), aggiunta la sezione vincolante `3. Standard di Codifica: Lingua Inglese Esclusiva nel Codice Sorgente`.
   - **Perimetro di Applicazione**:
     - **Inglese Esclusivo**: identificatori (variabili, costanti, funzioni, classi, metodi, proprietà, tipi, nomi di file e directory), commenti inline (`//`), blocchi di commento (`/* */`), annotazioni TODO/FIXME, documentazione API (JSDoc, TSDoc), test automatizzati (`describe`, `it`, `test`), asserzioni, fixture, mock, messaggi di errore ed eccezioni (`throw new Error(...)`), log di diagnostica interna (`console.*`) e messaggi di commit Git.
     - **Distinzione UI Copy & Localizzazione**: i testi visualizzati all'utente finale nel prodotto (etichette, copywriting UI, dizionari di traduzione) rispettano la lingua target di prodotto (es. italiano per GlideMind), mentre le relative chiavi e il codice circostante restano in inglese.
     - **Conversazione Agente-Utente**: l'agente continua a comunicare nella lingua scelta dall'utente (es. italiano per dialoghi tecnici e spiegazioni), applicando il vincolo dell'inglese solo agli artefatti di codice.
   - Validazione della suite globale `node scripts/validate.mjs --all`: 9/9 plugin verificati con 0 errori e 0 avvisi.

2. **Attivazione Workspace Root (`GlideMind/AGENTS.md`)**:
   - Creato [`AGENTS.md`](file:///c:/github/GlideMind/AGENTS.md) alla radice del repository GlideMind con inclusione sintattica `@[GlideMind Constraints & Coding Standards](.agents/rules/constraints.md)`.
   - Aggiornato [`.agents/rules/constraints.md`](file:///c:/github/GlideMind/.agents/rules/constraints.md) per allineare la sezione Coding Standards con le specifiche dettagliate della lingua inglese.
   - Forniti riferimenti diretti a tutte le specifiche di dominio in `.agents/rules/` (`anti_sycophancy_integrity.md`, `comprensorio_locality_spec.md`, `novice_pilot_spec.md`, `ui_layout_spec.md`, `testing_weather_mock_guard.md`, `geodesy_webgl_3d_spec.md`).

3. **Verifica & Continuità Cognitiva**:
   - Eseguita la suite di test completa `npm test` su GlideMind: 325/325 test passati con successo (0 fallimenti).
   - Registrata la Lezione Appresa #48 in [`MEMORY.md`](file:///c:/github/GlideMind/MEMORY.md).
