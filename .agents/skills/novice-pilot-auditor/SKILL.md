---
name: novice-pilot-auditor
description: >-
  Utilizza questa skill quando sottoponi a revisione critica funzionalità, viste UI, debriefing e logica di volabilità dal punto di vista della sicurezza per vele base, chiarezza outdoor e carico cognitivo.
---

# Novice Pilot Auditor Skill

Questa skill guida l'agente nell'eseguire un audit di sicurezza ed ergonomia su GlideMind attraverso la lente di un pilota principiante o in ripresa d'attività (ala scuola/base con $V_{\text{trim}} \approx 36\text{ km/h}$, $L/D \approx 7.8$).

---

## Principio Fondamentale: Parametri Fisici della Vela & Prudenza Pilota Opt-In
- **Nessun selettore soggettivo di 'Livello Pilota' né badge burocratici `EN-A..D` in UI**: le viste e i debriefing mostrano direttamente i parametri fisici reali dell'ala attiva ($V_{\text{trim}}$, $V_{\text{max}}$, efficienza $L/D$) senza etichette `EN-A..D` (`NOTE-004`).
- **Limiti Fisici + Prudenza Pilota (`calculatePilotSafetyFactor`)**: $V_{\text{trim}}$ e $L/D$ governano i limiti aerodinamici invarianti (penetrazione vento e cono di planata), mentre il moltiplicatore opt-in di continuità (`1.0x`, `0.85x`, `0.75x`) riduce le soglie di pilotaggio attivo ($\Delta\text{Gust}$, EDR, CAPE, traverso).

---

## Quando Invocare Questa Skill (Checkpoint Operativi)

1. **Checkpoint 1 — Design & Sviluppo Viste UI**:
   - Prima e durante la modifica di `HomeDashboardView`, `ForecastView`, `SpotMapView`, `LogbookView`, `FlightDetailSheet`.
   - Verifica: traduzione fenomenologica anti-gergo (zero acronimi isolati `CAPE`, `LCL`, `EDR`), esposizione di $V_{\text{trim}}$/$L/D$ senza badge `EN`, regola dei 3 secondi (*glanceability*), touch target $\ge 48\text{px}$ e contrasto sunlight mode.
2. **Checkpoint 2 — Algoritmi di Volabilità e Aerologia**:
   - Modifiche a `core/flyability.js`, `core/soundingsMath.js` o `core/openMeteoApi.js`.
   - Verifica: soglie restrittive per ali con $V_{\text{trim}} \approx 36\text{ km/h}$, guardia su $\Delta\text{Gust} > 8\text{ km/h}$ e inseparabilità decollo-atterraggio.
3. **Checkpoint 3 — Sintesi e Prompt di Briefing AI (`ai-briefing-gemini`)**:
   - Verifica: traduzione immediata delle metriche aerologiche in indicazioni operative chiare.
4. **Checkpoint 4 — Analisi Manovre e Debriefing IGC (`flightManeuvers.js`, `FlightDetailSheet.js`)**:
   - Verifica: didattica costruttiva su errori tipici (sottovento, scarso franco sul rilievo) ancorata alle prestazioni fisiche dell'ala.
5. **Checkpoint 5 — End-of-Task Sync**:
   - Prima di marcare completato un task in `DESIDERATA.md`.

---

## Procedura Operativa di Audit

### Passo 1: Ispezione del Target
Leggere con `view_file` i moduli, template UI o prompt oggetto della modifica.

### Passo 2: Applicazione dei 5 Filtri di Sicurezza (`.agents/rules/novice_pilot_spec.md`)
1. **Conservativismo Soglie**: vento max $\le 18\text{ km/h}$, $\Delta\text{Gust} \le 8\text{ km/h}$, cono planata $\le 1:5.5$ per ali con $V_{\text{trim}} \approx 36\text{ km/h}$.
2. **Carico Cognitivo & Anti-Gergo**: `CAPE`, `LCL`, `EDR` accompagnati da etichette fenomenologiche in italiano; zero badge `EN-A..D` in UI.
3. **Glanceability ($< 3\text{s}$)**: stato tri-modale (Colore + Testo + Simbolo) leggibile sotto luce solare diretta.
4. **Protezione da Trappole Oro-Meteorologiche**: rotori sottovento, brezza di valle in atterraggio, disaccoppiamento decollo/atterraggio.
5. **Debriefing Didattico**: feedback formativo basato su $V_{\text{trim}}$, $V_{\text{max}}$ ed efficienza $L/D$.

### Passo 3: Strutturazione del Rapporto di Revisione

```markdown
# Rapporto Revisione: Sicurezza Aerodinamica & Pilota Base

### Esito Globale: [PASS / WARN / FAIL]

| Criterio | Esito | Riscontro Dettagliato |
| :--- | :---: | :--- |
| 1. Conservativismo Soglie ($V_{\text{trim}}$ / Prudenza) | [PASS/WARN/FAIL] | ... |
| 2. Chiarezza Terminologica & Zero Badge EN | [PASS/WARN/FAIL] | ... |
| 3. Ergonomia Outdoor e Glanceability (< 3s) | [PASS/WARN/FAIL] | ... |
| 4. Difesa da Trappole Oro-Meteo (D+A) | [PASS/WARN/FAIL] | ... |
| 5. Didattica Debriefing Fisico | [PASS/WARN/FAIL] | ... |

### Rischi Rilevati:
- [Punto 1]: Descrizione tecnica del rischio, file e linea.

### Azioni Prescrittive:
- [Azione 1]: Modifica raccomandata al codice o alla UI.
```
