---
name: novice-pilot-auditor
description: Sottopone a revisione critica funzionalità, UI, debriefing e logica di volabilità dal punto di vista di un pilota principiante di parapendio (EN-A / neo-brevettato). Valuta conservativismo di sicurezza, chiarezza outdoor e carico cognitivo.
---

# Novice Pilot Auditor Skill

Questa skill guida l'agente o il subagente nell'eseguire un audit rigoroso del software GlideMind attraverso la lente del pilota principiante (allievo scuola o neo-brevettato che vola con vela scuola/entry-level EN-A).

---

## Principio Fondamentale: Proxy Aerodinamico della Vela (Zero Pilot Level UI)
- **Nessun selettore di 'Livello Pilota'**: L'app non deve richiedere un'auto-dichiarazione soggettiva del pilota.
- **La Vela come Unica Sorgente di Verità**: È l'attrezzatura attiva nel profilo (`activeGlider`), con i suoi parametri fisici reali ($v_{\text{trim}}$, allungamento $AR$, efficienza), a dettare l'inviluppo aerodinamico. Una vela EN-A riceve matematicamente la massima protezione conservativa.

---

## Quando Invocare Questa Skill (Momenti Opportuni)
Invocare questa skill sistematicamente nei seguenti checkpoint del flusso di lavoro:

1. **Checkpoint 1: Design & Sviluppo Viste UI**:
   - Durante il rilascio o refactoring di `HomeDashboardView`, `ForecastView`, `SpotMapView`, `LogbookView`.
   - Verifica: regola dei 3 secondi sul decollo (*glanceability*), touch target $\ge 48\text{ px}$ con guanti da volo, contrasto per luce solare diretta.
2. **Checkpoint 2: Aggiornamenti Algoritmi di Volabilità e Aerologia**:
   - Modifiche a `core/flyability.js`, `core/soundingsMath.js` o `core/openMeteoApi.js`.
   - Verifica: calcolo conservativo con vela EN-A ($v_{\text{trim}} \approx 36\text{ km/h}$), protezione contro raffiche con delta $> 8\text{ km/h}$, inseparabilità decollo-atterraggio.
3. **Checkpoint 3: Sintesi e Prompt di Briefing AI**:
   - Modifiche a `ai-briefing-gemini`.
   - Verifica: traduzione immediata del gergo tecnico (LCL, CAPE, EDR) in indicazioni pratiche per vele base.
4. **Checkpoint 4: Analisi Manovre e Debriefing IGC**:
   - Modifiche a `core/flightManeuvers.js` e `LogbookView`.
   - Verifica: didattica chiara e costruttiva per errori tipici (sottovento, avvicinamento basso al pendio).
5. **Checkpoint 5: End-of-Task Sync**:
   - Prima di completare un task nella matrice `DESIDERATA.md`.

---

## Procedura Operativa di Audit

### Passo 1: Ispezione del Target
Identificare i file di codice sorgente, componenti UI o prompt oggetto dell'analisi.

### Passo 2: Applicazione dei 5 Filtri di Sicurezza (.agents/rules/novice_pilot_spec.md)
1. **Conservativismo Soglie**: Vento max $\le 18\text{ km/h}$, Delta raffica $\le 8\text{ km/h}$, cono planata $\le 1:5.5$ per vela EN-A.
2. **Carico Cognitivo & Anti-Gergo**: Termini come CAPE, LCL, EDR tradotti in linguaggio intuitivo. Zero acronimi isolati.
3. **Glanceability (< 3s)**: Stato chiaro e leggibile immediatamente sotto la luce solare diretta.
4. **Protezione da Trappole del Decollo**: Rotori sottovento, falsi cicli termici frontali con vento contrario in quota.
5. **Debriefing Didattico**: Riconoscimento manovre spiegato in chiave formativa.

### Passo 3: Strutturazione del Rapporto di Revisione
Generare il resoconto seguendo questo template:

```markdown
# 🪂 Rapporto Revisione: Prospettiva Pilota Principiante (Vela EN-A)

### Esito Globale: [🟢 PASS / 🟡 WARN / 🔴 FAIL]

| Criterio | Esito | Riscontro Dettagliato |
| :--- | :---: | :--- |
| 1. Conservativismo Soglie (EN-A) | [🟢/🟡/🔴] | ... |
| 2. Chiarezza Terminologica | [🟢/🟡/🔴] | ... |
| 3. Ergonomia e Glanceability (< 3s) | [🟢/🟡/🔴] | ... |
| 4. Difesa da Trappole Meteo | [🟢/🟡/🔴] | ... |
| 5. Didattica e Feedback | [🟢/🟡/🔴] | ... |

### ⚠️ Rischi Rilevati per il Principiante:
- [Punto 1]: Descrizione tecnica del rischio, file e linea.

### 🛠️ Azioni Prescrittive:
- [Azione 1]: Modifica raccomandata al codice o alla UI.
```
