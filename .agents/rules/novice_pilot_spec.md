# Specifica di Revisione: Prospettiva Pilota Principiante (Novice Pilot Auditor)

Questo documento formalizza i requisiti operativi, i vincoli di sicurezza e la disciplina di invocazione per esaminare GlideMind attraverso gli occhi di un pilota principiante (allievo scuola o neo-brevettato con ala scuola/entry-level EN-A).

---

## 1. Principio Fondamentale: Proxy Aerodinamico della Vela (Zero Pilot Level UI)

1. **Divieto di Selettore 'Livello Pilota' nell'Interfaccia**:
   - L'applicazione non deve includere dropdown o impostazioni arbitrarie per "Livello Pilota" (principiante/intermedio/esperto).
   - L'autovalutazione del pilota è soggetta a bias (effetto Dunning-Kruger o dimenticanza nel cambio profilo).
2. **La Vela come Unica Sorgente di Verità Aerodinamica**:
   - È l'attrezzatura attiva nel profilo/hangar (`activeGlider`), con la sua classe di omologazione (EN-A, EN-B, EN-C, EN-D) e i suoi parametri fisici reali ($v_{\text{trim}}$, $v_{\text{max}}$, allungamento $AR$, efficienza di planata), a determinare deterministicamente l'inviluppo di sicurezza.
   - Per una vela da scuola/principiante (**EN-A**, con $v_{\text{trim}} \approx 36\text{ km/h}$, $AR \approx 4.8$, efficienza $\approx 7.8$), le formule di calcolo applicano matematicamente la massima protezione conservativa:
     - Un vento di $20\text{ km/h}$ lascia appena $16\text{ km/h}$ di penetrazione residua: basta una raffica termica o un gradiente per provocare lo stallo o l'arretramento verso il sottovento.
     - Pertanto, con ala EN-A le condizioni diventano arancioni/rosse a soglie rigorose senza bisogno di configurazioni soggettive.

---

## 2. Persona e Modello Mentale del Principiante

### 2.1 Contesto Operativo e Vulnerabilità Emotiva
1. **Sul Decollo**:
   - Livello di stress e frequenza cardiaca elevati (timore del gonfiaggio asimmetrico, decollo abortito, vento al limite).
   - Uso con guanti da volo (impossibilità di puntamento fine o pinch-to-zoom).
   - Luce solare diretta con occhiali da sole (polarizzazione, riverbero, riflesso dello schermo).
   - Finestra decisionale rapida: la verifica pre-volo richiede risposte binarie in $< 3$ secondi (*Glanceability*).
2. **In Volo**:
   - Ansia primaria: perdere l'efficienza necessaria per raggiungere l'atterraggio ufficiale e trovarsi costretto a un fuoricampo tra alberi o linee elettriche.
   - Paura della turbolenza e dei rotori sottovento non visti.
3. **A Terra (Pianificazione e Debriefing)**:
   - Mancanza di background aerologico universitario: acronimi come LCL, CAPE, EDR o Skew-T generano confusione e falsa sicurezza se mal interpretati.
   - Bisogno di debriefing costruttivo: sapere se ha corso rischi oggettivi (es. quota rispetto al pendio, sottovento) in linguaggio accessibile.

---

## 3. Matrice delle Soglie di Sicurezza per Vele EN-A / Base

| Parametro Operativo | Soglia Ottimale (🟢 Verde) | Soglia Attenzione (🟡 Giallo) | Soglia Pericolo (🔴 Rosso / NO FLY) |
| :--- | :---: | :---: | :---: |
| **Vento Base al Decollo** | $5 - 14\text{ km/h}$ | $15 - 18\text{ km/h}$ | $> 18\text{ km/h}$ (oltre il 50% di $v_{\text{trim}}$ EN-A) |
| **Raffica Massima (Gust)** | $\le 18\text{ km/h}$ | $19 - 22\text{ km/h}$ | $> 22\text{ km/h}$ |
| **Delta Raffica ($\Delta$ Gust)** | $\le 5\text{ km/h}$ | $6 - 8\text{ km/h}$ | $> 8\text{ km/h}$ |
| **Deviazione Vento / Pendio ($\Delta\theta$)** | $\le \pm 15^\circ$ | $\pm 16^\circ - \pm 25^\circ$ | $> \pm 25^\circ$ (o componente da tergo) |
| **Gradiente Brezza in Atterraggio** | $< 12\text{ km/h}$ | $13 - 18\text{ km/h}$ | $> 18\text{ km/h}$ |
| **Cono di Planata verso Landing** | Efficienza richiesta $\le 1:5.0$ | Efficienza $1:5.1 - 1:6.0$ | Efficienza $> 1:6.0$ (o quota residua $< 150\text{m}$ AGL) |
| **Attività Termica (Vario Medio)** | $0.0 - +1.5\text{ m/s}$ | $+1.6 - +2.5\text{ m/s}$ | $> +2.5\text{ m/s}$ o CAPE $> 600\text{ J/kg}$ |

---

## 4. Matrice di Invocazione della Skill nei "Momenti Opportuni"

La skill `novice-pilot-auditor` deve essere invocata sistematicamente nei seguenti checkpoint operativi del ciclo di sviluppo:

### Checkpoint 1: Fase Progettuale Preventiva & Rilascio Viste UI (Design Review)
- **Quando**: In fase progettuale preventiva (PRIMA di scrivere codice, template o mockup) e durante lo sviluppo o modifica di `HomeDashboardView`, `ForecastView`, `SpotMapView`, `LogbookView`.
- **Cosa verificare**:
  - **Audit Terminologico & Anti-Gergo Preventivo**: Censimento di tutte le etichette, unità di misura e grandezze meteo. Divieto assoluto di acronimi isolati o grandezze fisiche grezze come etichette primarie (`CAPE`, `LCL`, `EDR`, `J/kg`). Mappatura obbligatoria sull'effetto di sicurezza pratico per il pilota (es. *Rischio Temporali*, *Base Nubi*, *Turbolenza in Termica*).
  - Regola dei 3 secondi: il verdetto è immediatamente visibile senza scrollare o aprire modal?
  - Fitts's Law: touch target rigorosamente $\ge 48 \times 48\text{ px}$ per l'uso con guanti da volo.
  - Zero Icon Clutter e contrasto elevato conforme WCAG AAA.

### Checkpoint 2: Aggiornamento Algoritmi di Volabilità (`flyability.js`, `soundingsMath.js`)
- **Quando**: Modifiche alle funzioni di scoring, waterfall a cascata, priorità aeronautica o formule di vento.
- **Cosa verificare**:
  - La vela attiva EN-A riceve un punteggio restrittivo automatico.
  - Inseparabilità decollo-atterraggio: nessun semaforo verde se l'atterraggio ha vento forte o brezza a fondo valle incanalata.

### Checkpoint 3: Sintesi e Prompt di Briefing AI (`ai-briefing-gemini`)
- **Quando**: Modifiche ai prompt per Google Gemini (pre-flight briefing o debriefing IGC).
- **Cosa verificare**:
  - Nessun acronimo isolato (LCL $\to$ "Base nubi stimata", CAPE $\to$ "Rischio colpi di vento/temporale", EDR $\to$ "Turbolenza termica").
  - Raccomandazioni pratiche focalizzate sulla finestra oraria sicura per vele base.

### Checkpoint 4: Analisi Manovre e Debriefing IGC (`flightManeuvers.js`, `LogbookView`)
- **Quando**: Implementazione di metriche di volo o visualizzazione tracce GPS.
- **Cosa verificare**:
  - Evidenziazione didattica di errori tipici (sottovento alla cresta, virate a bassa quota senza margine, ingresso in termiche rotte).
  - Tono costruttivo ed educativo.

### Checkpoint 5: End-of-Task Sync (Verifica Finale)
- **Quando**: Prima di marcare come completato (`🟢 Completato`) un task nella matrice [DESIDERATA.md](file:///c:/github/GlideMind/DESIDERATA.md).
- **Cosa verificare**: L'agente esegue un rapido audit di conformità per garantire zero regressioni ergonomiche o di sicurezza.
